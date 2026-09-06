'use server';

import { z } from 'zod';
import { requireSession } from '@/modules/auth';
import { revalidatePath } from 'next/cache';
import { logAction } from '@/modules/audit';
import { prisma } from '@/lib/infrastructure/prisma';
import { logger } from '@/lib/infrastructure/logger';
import { computeHasMore } from '@/lib/db/pagination';
import { withValidation } from '@/lib/utils/server-action';
import { getBannedUsersSchema } from '@/modules/moderation';
import { ROUTES } from '@/lib/config/routes';
import { requireModerationRole } from '@/modules/policy';
import { dispatch } from '@/modules/notifications/dispatcher';
import { actionFailure, actionSuccess } from '@/lib/actions/result';
import { buildBannedUsersWhereClause } from '@/modules/moderation/policy';

// ── Jury constants (KISS vertical slice) ─────────────────────────────────────
const JURY_SIZE = 3;
const JURY_MAJORITY = 2;

// ── Shared select constants ────────────────────────────────────────────────
const APPEAL_USER_SELECT = { id: true, name: true, email: true, image: true } as const;
const BANNED_USER_APPEAL_SELECT = { id: true, name: true, email: true, image: true, status: true } as const;
const BAN_ISSUER_APPEAL_SELECT = { id: true, name: true, email: true } as const;
const BAN_THREAD_APPEAL_SELECT = { id: true, name: true, slug: true } as const;

const createAppealSchema = z.object({
  reason: z.string().min(10, 'Reason must be at least 10 characters long'),
  reportId: z.string().cuid().optional(),
});

const resolveAppealSchema = z.object({
  appealId: z.string().cuid(),
  approved: z.boolean(),
  response: z.string().min(1, 'Response is required').optional(),
});

const listSchema = z.object({
  limit: z.number().int().min(1).max(100).optional(),
  offset: z.number().int().min(0).optional(),
});

// ── Revalidation helper ────────────────────────────────────────────────────
function revalidateAppealPath(route: string) {
  revalidatePath(route);
}

function getAppealTitle(approved: boolean): string {
  if (approved) {
    return 'Appeal Approved';
  }
  return 'Appeal Rejected';
}

function getAppealMessage(approved: boolean, response?: string): string {
  if (approved) {
    const fallback = 'Your account has been restored.';
    return `Your appeal has been approved. ${response ?? fallback}`;
  }
  const fallback = 'No further action was taken.';
  return `Your appeal has been reviewed and rejected. ${response ?? fallback}`;
}

function getAppealStatus(approved: boolean): 'APPROVED' | 'REJECTED' {
  if (approved) {
    return 'APPROVED';
  }
  return 'REJECTED';
}

function buildBanLookupMap<T extends { userId: string | null }>(bans: T[]): Map<string, T> {
  const latestBanByUser = new Map<string, T>();
  for (const ban of bans) {
    if (ban.userId !== null && !latestBanByUser.has(ban.userId)) {
      latestBanByUser.set(ban.userId, ban);
    }
  }
  return latestBanByUser;
}

// Appeal rows hang off a message, but a ban isn't always traceable to one.
// Walk from the most specific evidence to the least: the cited report, then any
// report against this user, then their last message.
async function resolveAppealMessageId(userId: string, reportId?: string): Promise<string | null> {
  if (reportId) {
    const report = await prisma.report.findUnique({
      where: { id: reportId },
      select: { messageId: true },
    });
    if (report !== null) {
      return report.messageId;
    }
  }

  const banReport = await prisma.report.findFirst({
    where: { message: { senderId: userId } },
    orderBy: { createdAt: 'desc' },
    select: { messageId: true },
  });
  if (banReport !== null) {
    return banReport.messageId;
  }

  const lastMessage = await prisma.message.findFirst({
    where: { senderId: userId },
    orderBy: { createdAt: 'desc' },
    select: { id: true },
  });
  if (lastMessage === null) {
    return null;
  }
  return lastMessage.id;
}

function isBannedStatus(status: string): boolean {
  return status === 'BANNED' || status === 'SUSPENDED';
}

// ── submitAppeal helpers ───────────────────────────────────────────────────
async function fetchActiveBanForAppeal(userId: string) {
  return prisma.userBan.findFirst({
    where: { userId, isActive: true },
    orderBy: { createdAt: 'desc' },
  });
}

async function ensureNoPendingAppeal(userId: string) {
  return prisma.appeal.findFirst({ where: { userId, status: 'PENDING' } });
}

async function createAppealRecord(params: { messageId: string; userId: string; reason: string }) {
  return prisma.appeal.create({
    data: { messageId: params.messageId, userId: params.userId, status: 'PENDING', reason: params.reason },
  });
}

function validateBannedUserStatus(status: string) {
  if (!isBannedStatus(status)) {
    return actionFailure('VALIDATION_ERROR', 'You are not banned');
  }
  return null;
}

// ── Jury helpers ───────────────────────────────────────────────────────────
function shuffleInPlace<T>(arr: T[]): T[] {
  const a = [...arr];
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    const tmp = a[i]!;
    a[i] = a[j]!;
    a[j] = tmp;
  }
  return a;
}

async function pickRandomJurorIds(excludeUserId?: string | null): Promise<string[]> {
  const moderators = await prisma.user.findMany({
    where: {
      role: 'MODERATOR',
      status: 'ACTIVE',
      deletedAt: null,
      ...(excludeUserId ? { id: { not: excludeUserId } } : {}),
    },
    select: { id: true },
  });
  if (moderators.length === 0) return [];
  const shuffled = shuffleInPlace(moderators.map((m) => m.id));
  const take = Math.min(JURY_SIZE, shuffled.length);
  return shuffled.slice(0, take);
}

async function createJuryForAppeal(appealId: string, appellantUserId: string | null) {
  try {
    const jurorIds = await pickRandomJurorIds(appellantUserId);
    if (jurorIds.length === 0) {
      logger.warn('[appeals] No moderators available for jury', { appealId });
      return [];
    }
    await prisma.appealVote.createMany({
      data: jurorIds.map((moderatorId) => ({
        appealId,
        moderatorId,
        vote: null,
        reason: null,
      })),
      skipDuplicates: true,
    });
    // Notify jurors — transparent assignment
    await dispatch({
      recipients: { userIds: jurorIds },
      category: 'SYSTEM',
      title: 'Jury Duty: New Appeal Assigned',
      message: 'You have been selected as a juror for a ban appeal. Please review and vote.',
      data: { appealId },
    });
    await logAction({
      action: 'APPEAL_JURY_ASSIGNED',
      entityType: 'Appeal',
      entityId: appealId,
      userId: appellantUserId ?? 'system',
      details: { jurorIds, jurySize: jurorIds.length } as unknown as import('@prisma/client').Prisma.InputJsonValue,
    });
    return jurorIds;
  } catch (error) {
    logger.error('[appeals] Failed to create jury', { appealId, error });
    return [];
  }
}

// ── getAppeals helpers ─────────────────────────────────────────────────────
async function fetchPendingAppeals(limit: number, offset: number) {
  const whereClause = { status: 'PENDING' as const };
  return Promise.all([
    prisma.appeal.findMany({
      where: whereClause,
      include: {
        user: { select: APPEAL_USER_SELECT },
        votes: {
          include: { moderator: { select: APPEAL_USER_SELECT } },
          orderBy: { createdAt: 'asc' },
        },
      },
      orderBy: { createdAt: 'asc' },
      take: limit,
      skip: offset,
    }),
    prisma.appeal.count({ where: whereClause }),
  ]);
}

async function fetchBansForAppeals(userIds: string[]) {
  if (userIds.length === 0) return [];
  return prisma.userBan.findMany({
    where: { userId: { in: userIds }, isActive: true },
    orderBy: { createdAt: 'desc' },
  });
}

function enrichAppealsWithBanInfo(
  appeals: Awaited<ReturnType<typeof fetchPendingAppeals>>[0],
  allBans: Awaited<ReturnType<typeof fetchBansForAppeals>>
) {
  const latestBanByUser = buildBanLookupMap(allBans);
  return appeals.map((appeal) => {
    const activeBan = appeal.userId ? latestBanByUser.get(appeal.userId) : undefined;
    const votes = (appeal as unknown as { votes: unknown[] }).votes ?? [];
    // Jury transparency: count votes
    const approvedCount = (votes as { vote: string | null }[]).filter((v) => v.vote === 'APPROVED').length;
    const rejectedCount = (votes as { vote: string | null }[]).filter((v) => v.vote === 'REJECTED').length;
    return {
      ...appeal,
      reporter: appeal.user,
      banReason: activeBan?.reason ?? 'Unknown',
      banDate: activeBan?.createdAt ?? new Date(),
      jury: {
        votes,
        approvedCount,
        rejectedCount,
        totalJurors: votes.length,
        majority: JURY_MAJORITY,
      },
    };
  });
}

// ── resolveAppeal helpers ──────────────────────────────────────────────────
async function applyAppealResolution(
  appealId: string,
  appealUserId: string | null,
  approved: boolean,
  response: string | undefined,
  moderatorId: string
) {
  const newStatus = getAppealStatus(approved);
  const responseValue = response ?? null;

  await prisma.$transaction(async (tx) => {
    await tx.appeal.update({
      where: { id: appealId },
      data: { status: newStatus, moderatorId, response: responseValue, resolvedAt: new Date() },
    });

    if (approved && appealUserId) {
      await tx.userBan.updateMany({ where: { userId: appealUserId, isActive: true }, data: { isActive: false } });
      const remainingBans = await tx.userBan.count({ where: { userId: appealUserId, isActive: true } });
      if (remainingBans === 0) {
        await tx.user.update({ where: { id: appealUserId }, data: { status: 'ACTIVE' } });
      }
    }
  });
}

async function notifyAppealResult(userId: string | null, approved: boolean, response: string | undefined, appealId: string) {
  if (!userId) return;
  await dispatch({
    recipients: { userIds: [userId] },
    category: 'SYSTEM',
    title: getAppealTitle(approved),
    message: getAppealMessage(approved, response),
    data: { appealId },
  });
}

export const submitAppeal = withValidation(
  createAppealSchema,
  'submitAppeal',
  async ({ reason, reportId }) => {
    const session = await requireSession(false);

    const statusError = validateBannedUserStatus(session.user.status);
    if (statusError) return statusError;

    const activeBan = await fetchActiveBanForAppeal(session.user.id);
    if (activeBan === null) {
      return actionFailure('NOT_FOUND', 'No active ban found to appeal');
    }

    const messageId = await resolveAppealMessageId(session.user.id, reportId);
    if (messageId === null) {
      return actionFailure('NOT_FOUND', 'No message found to appeal');
    }

    const existingAppeal = await ensureNoPendingAppeal(session.user.id);
    if (existingAppeal !== null) {
      return actionFailure('CONFLICT', 'You already have a pending appeal');
    }

    const appeal = await createAppealRecord({ messageId, userId: session.user.id, reason });

    await logAction({
      action: 'APPEAL_SUBMITTED',
      entityType: 'Appeal',
      entityId: appeal.id,
      userId: session.user.id,
      details: { reason, banId: activeBan.id },
    });

    // KISS jury: pick 3 random moderators and notify them
    await createJuryForAppeal(appeal.id, session.user.id);

    revalidateAppealPath(ROUTES.BANNED);
    revalidateAppealPath(ROUTES.ADMIN_APPEALS);
    return actionSuccess(null);
  }
);

export const getAppeals = withValidation(listSchema, 'getAppeals', async (filters) => {
  await requireModerationRole();

  const limit = Math.min(filters.limit || 50, 100);
  const offset = filters.offset || 0;

  const [appeals, totalCount] = await fetchPendingAppeals(limit, offset);

  const userIds = appeals.map((a) => a.userId).filter((id): id is string => id !== null);
  const allBans = await fetchBansForAppeals(userIds);
  const appealsWithBanInfo = enrichAppealsWithBanInfo(appeals, allBans);

  return actionSuccess({
    appeals: appealsWithBanInfo,
    pagination: {
      total: totalCount,
      limit,
      offset,
      hasMore: computeHasMore(offset, limit, totalCount),
    },
  });
});

export const resolveAppeal = withValidation(
  resolveAppealSchema,
  'resolveAppeal',
  async ({ appealId, approved, response }) => {
    const session = await requireModerationRole();

    const appeal = await prisma.appeal.findUnique({
      where: { id: appealId },
      include: { user: true },
    });

    if (appeal === null) {
      return actionFailure('NOT_FOUND', 'Appeal not found');
    }

    if (appeal.status !== 'PENDING') {
      return actionFailure('CONFLICT', 'Appeal already resolved');
    }

    // Fetch jury votes for this appeal
    const juryVotes = await prisma.appealVote.findMany({
      where: { appealId },
      orderBy: { createdAt: 'asc' },
    });

    // Legacy fallback: no jury assigned (old appeals or insufficient moderators)
    // Keep single-moderator behavior so existing tests don't break.
    if (juryVotes.length === 0) {
      await applyAppealResolution(appealId, appeal.userId, approved, response, session.user.id);
      await notifyAppealResult(appeal.userId, approved, response, appealId);

      await logAction({
        action: 'APPEAL_RESOLVED',
        entityType: 'Appeal',
        entityId: appealId,
        userId: session.user.id,
        details: { approved, userId: appeal.userId, response, jury: false },
      });

      revalidateAppealPath(ROUTES.ADMIN_APPEALS);
      return actionSuccess(null);
    }

    // Jury mode: caller must be one of the assigned jurors
    const myVote = juryVotes.find((v: { moderatorId: string }) => v.moderatorId === session.user.id);
    if (!myVote) {
      return actionFailure('FORBIDDEN', 'You are not assigned to this jury');
    }
    if (myVote.vote !== null) {
      return actionFailure('CONFLICT', 'You have already voted on this appeal');
    }

    const voteValue = approved ? 'APPROVED' : 'REJECTED';

    await prisma.appealVote.update({
      where: { id: myVote.id },
      data: { vote: voteValue as unknown as never, reason: response ?? null },
    });

    await logAction({
      action: 'APPEAL_VOTE_CAST',
      entityType: 'Appeal',
      entityId: appealId,
      userId: session.user.id,
      details: { vote: voteValue, response, jurorId: session.user.id },
    });

    // Re-count votes after this vote
    const updatedVotes = await prisma.appealVote.findMany({ where: { appealId } });
    const approvedCount = updatedVotes.filter((v: { vote: string | null }) => v.vote === 'APPROVED').length;
    const rejectedCount = updatedVotes.filter((v: { vote: string | null }) => v.vote === 'REJECTED').length;
    const pendingCount = updatedVotes.filter((v: { vote: string | null }) => v.vote === null).length;

    const majorityReached = approvedCount >= JURY_MAJORITY || rejectedCount >= JURY_MAJORITY;
    // If jury is smaller than JURY_SIZE (e.g., only 1 moderator in dev), majority is ceil(n/2)
    const effectiveMajority = Math.min(JURY_MAJORITY, Math.ceil(updatedVotes.length / 2));
    const effectiveMajorityReached = approvedCount >= effectiveMajority || rejectedCount >= effectiveMajority;

    const shouldResolve = juryVotes.length >= JURY_SIZE ? majorityReached : effectiveMajorityReached;

    // Also resolve if all jurors have voted even without strict majority (tie-break as reject)
    const allVoted = pendingCount === 0;
    const finalShouldResolve = shouldResolve || allVoted;

    if (finalShouldResolve) {
      // KISS: winner is side with more votes; tie -> REJECTED (conservative)
      const finalApproved = approvedCount > rejectedCount;

      await applyAppealResolution(appealId, appeal.userId, finalApproved, response, session.user.id);
      await notifyAppealResult(appeal.userId, finalApproved, response, appealId);

      await logAction({
        action: 'APPEAL_RESOLVED',
        entityType: 'Appeal',
        entityId: appealId,
        userId: session.user.id,
        details: {
          approved: finalApproved,
          userId: appeal.userId,
          response,
          jury: true,
          approvedCount,
          rejectedCount,
          totalJurors: updatedVotes.length,
        },
      });

      revalidateAppealPath(ROUTES.ADMIN_APPEALS);
      return actionSuccess({ resolved: true, approved: finalApproved, approvedCount, rejectedCount } as unknown as null);
    }

    // Vote recorded but jury not yet decided
    revalidateAppealPath(ROUTES.ADMIN_APPEALS);
    return actionSuccess({ resolved: false, approvedCount, rejectedCount, pendingCount } as unknown as null);
  }
);

export const getBannedUsers = withValidation(
  getBannedUsersSchema,
  'getBannedUsers',
  async (filters) => {
    await requireModerationRole();

    const limit = Math.min(filters.limit || 50, 100);
    const offset = filters.offset || 0;

    const whereClause = buildBannedUsersWhereClause(filters);

    const [bans, totalCount] = await Promise.all([
      prisma.userBan.findMany({
        where: whereClause,
        include: {
          user: { select: BANNED_USER_APPEAL_SELECT },
          issuer: { select: BAN_ISSUER_APPEAL_SELECT },
          thread: { select: BAN_THREAD_APPEAL_SELECT },
        },
        orderBy: { createdAt: 'desc' },
        take: limit,
        skip: offset,
      }),
      prisma.userBan.count({ where: whereClause }),
    ]);

    return actionSuccess({
      bans,
      pagination: {
        total: totalCount,
        limit,
        offset,
        hasMore: computeHasMore(offset, limit, totalCount),
      },
    });
  }
);
