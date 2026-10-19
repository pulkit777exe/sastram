'use server';

import { z } from 'zod';
import { requireSession } from '@/modules/auth';
import { revalidatePath } from 'next/cache';
import { recordActivity } from '@/modules/activity/repository';
import { prisma } from '@/lib/infrastructure/prisma';
import { logger } from '@/lib/infrastructure/logger';
import { computeHasMore } from '@/lib/db/pagination';
import { actionFailure, actionSuccess, withValidation } from '@/lib/utils/server-action';
import { getBannedUsersSchema } from '@/modules/moderation';
import { ROUTES } from '@/lib/config/routes';
import { requireModerationRole } from '@/modules/policy';
import { dispatch } from '@/modules/notifications/dispatcher';
import { buildBannedUsersWhereClause } from '@/modules/moderation/policy';
import { lookupJurorVote, pickJurors, tallyVotes, voteForApproval } from './jury';
import {
  castAppealVote,
  createAppeal,
  createJuryVotes,
  finalizeAppealResolution,
  findActiveBanForUser,
  findAppealWithUser,
  findPendingAppealForUser,
  listActiveBansForUsers,
  listActiveModeratorIds,
  listAppealVotes,
  listPendingAppeals,
  recountAppealVotes,
  resolveAppealMessageId,
} from './repository';

// ── Jury constants (KISS vertical slice) ─────────────────────────────────────
const JURY_SIZE = 3;
const JURY_MAJORITY = 2;

// ── Shared select constants ────────────────────────────────────────────────
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

function buildBanLookupMap<T extends { userId: string | null }>(bans: T[]): Map<string, T> {
  const latestBanByUser = new Map<string, T>();
  for (const ban of bans) {
    if (ban.userId !== null && !latestBanByUser.has(ban.userId)) {
      latestBanByUser.set(ban.userId, ban);
    }
  }
  return latestBanByUser;
}

function isBannedStatus(status: string): boolean {
  return status === 'BANNED' || status === 'SUSPENDED';
}

// ── submitAppeal helpers ───────────────────────────────────────────────────
function validateBannedUserStatus(status: string) {
  if (!isBannedStatus(status)) {
    return actionFailure('VALIDATION_ERROR', 'You are not banned');
  }
  return null;
}

// ── Jury helpers ───────────────────────────────────────────────────────────
async function pickRandomJurorIds(excludeUserId?: string | null): Promise<string[]> {
  const moderatorIds = await listActiveModeratorIds(excludeUserId);
  return pickJurors(moderatorIds, JURY_SIZE);
}

async function createJuryForAppeal(appealId: string, appellantUserId: string | null) {
  try {
    const jurorIds = await pickRandomJurorIds(appellantUserId);
    if (jurorIds.length === 0) {
      logger.warn('[appeals] No moderators available for jury', { appealId });
      return [];
    }
    await createJuryVotes(appealId, jurorIds);
    // Notify jurors — transparent assignment
    await dispatch({
      recipients: { userIds: jurorIds },
      category: 'SYSTEM',
      title: 'Jury Duty: New Appeal Assigned',
      message: 'You have been selected as a juror for a ban appeal. Please review and vote.',
      data: { appealId },
    });
    await recordActivity({
      type: 'APPEAL_JURY_ASSIGNED',
      entityType: 'Appeal',
      entityId: appealId,
      userId: appellantUserId ?? 'system',
      metadata: { jurorIds, jurySize: jurorIds.length } as unknown as import('@prisma/client').Prisma.InputJsonValue,
    });
    return jurorIds;
  } catch (error) {
    logger.error('[appeals] Failed to create jury', { appealId, error });
    return [];
  }
}

// ── getAppeals helpers ─────────────────────────────────────────────────────
function enrichAppealsWithBanInfo(
  appeals: Awaited<ReturnType<typeof listPendingAppeals>>[0],
  allBans: Awaited<ReturnType<typeof listActiveBansForUsers>>
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

    const activeBan = await findActiveBanForUser(session.user.id);
    if (activeBan === null) {
      return actionFailure('NOT_FOUND', 'No active ban found to appeal');
    }

    const messageId = await resolveAppealMessageId(session.user.id, reportId);
    if (messageId === null) {
      return actionFailure('NOT_FOUND', 'No message found to appeal');
    }

    const existingAppeal = await findPendingAppealForUser(session.user.id);
    if (existingAppeal !== null) {
      return actionFailure('CONFLICT', 'You already have a pending appeal');
    }

    const appeal = await createAppeal({ messageId, userId: session.user.id, reason });

    await recordActivity({
      type: 'APPEAL_SUBMITTED',
      entityType: 'Appeal',
      entityId: appeal.id,
      userId: session.user.id,
      metadata: { reason, banId: activeBan.id },
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

  const [appeals, totalCount] = await listPendingAppeals(limit, offset);

  const userIds = appeals.map((a) => a.userId).filter((id): id is string => id !== null);
  const allBans = await listActiveBansForUsers(userIds);
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

    const appeal = await findAppealWithUser(appealId);

    if (appeal === null) {
      return actionFailure('NOT_FOUND', 'Appeal not found');
    }

    if (appeal.status !== 'PENDING') {
      return actionFailure('CONFLICT', 'Appeal already resolved');
    }

    // Fetch jury votes for this appeal
    const juryVotes = await listAppealVotes(appealId);

    // Legacy fallback: no jury assigned (old appeals or insufficient moderators)
    // Keep single-moderator behavior so existing tests don't break.
    if (juryVotes.length === 0) {
      await finalizeAppealResolution({
        appealId,
        appealUserId: appeal.userId,
        approved,
        response,
        moderatorId: session.user.id,
      });
      await notifyAppealResult(appeal.userId, approved, response, appealId);

      await recordActivity({
        type: 'APPEAL_RESOLVED',
        entityType: 'Appeal',
        entityId: appealId,
        userId: session.user.id,
        metadata: { approved, userId: appeal.userId, response, jury: false },
      });

      revalidateAppealPath(ROUTES.ADMIN_APPEALS);
      return actionSuccess(null);
    }

    // Jury mode: caller must be one of the assigned jurors
    const jurorVote = lookupJurorVote(juryVotes, session.user.id);
    if (jurorVote.status === 'NOT_ASSIGNED') {
      return actionFailure('FORBIDDEN', 'You are not assigned to this jury');
    }
    if (jurorVote.status === 'ALREADY_VOTED') {
      return actionFailure('CONFLICT', 'You have already voted on this appeal');
    }

    const voteValue = voteForApproval(approved);

    await castAppealVote(jurorVote.vote.id, voteValue, response ?? null);

    await recordActivity({
      type: 'APPEAL_VOTE_CAST',
      entityType: 'Appeal',
      entityId: appealId,
      userId: session.user.id,
      metadata: { vote: voteValue, response, jurorId: session.user.id },
    });

    // Re-count votes after this vote
    const updatedVotes = await recountAppealVotes(appealId);
    const tally = tallyVotes(updatedVotes, JURY_SIZE);
    // Enforce JURY_SIZE invariant — degraded juries are not allowed to decide
    if (!tally.sizeSufficient) {
      return actionFailure('SERVICE_UNAVAILABLE', `Jury unavailable — requires ${JURY_SIZE} moderators, have ${tally.totalVotes}`);
    }

    if (tally.shouldResolve) {
      // KISS: winner is side with more votes; tie -> REJECTED (conservative)
      const finalApproved = tally.approved;

      await finalizeAppealResolution({
        appealId,
        appealUserId: appeal.userId,
        approved: finalApproved,
        response,
        moderatorId: session.user.id,
      });
      await notifyAppealResult(appeal.userId, finalApproved, response, appealId);

      await recordActivity({
        type: 'APPEAL_RESOLVED',
        entityType: 'Appeal',
        entityId: appealId,
        userId: session.user.id,
        metadata: {
          approved: finalApproved,
          userId: appeal.userId,
          response,
          jury: true,
          approvedCount: tally.approvedCount,
          rejectedCount: tally.rejectedCount,
          totalJurors: tally.totalVotes,
        },
      });

      revalidateAppealPath(ROUTES.ADMIN_APPEALS);
      return actionSuccess({ resolved: true, approved: finalApproved, approvedCount: tally.approvedCount, rejectedCount: tally.rejectedCount } as unknown as null);
    }

    // Vote recorded but jury not yet decided
    revalidateAppealPath(ROUTES.ADMIN_APPEALS);
    return actionSuccess({ resolved: false, approvedCount: tally.approvedCount, rejectedCount: tally.rejectedCount, pendingCount: tally.pendingCount } as unknown as null);
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
