'use server';

import { z } from 'zod';
import { requireSession } from '@/modules/auth';
import { revalidatePath } from 'next/cache';
import { logAction } from '@/modules/audit';
import { prisma } from '@/lib/infrastructure/prisma';
import { computeHasMore } from '@/lib/db/pagination';
import { withValidation } from '@/lib/utils/server-action';
import { getBannedUsersSchema } from '@/modules/moderation';
import { ROUTES } from '@/lib/config/routes';
import { requireModerationRole } from '@/modules/policy';
import { dispatch } from '@/modules/notifications/dispatcher';
import { actionFailure, actionSuccess } from '@/lib/actions/result';
import { buildBannedUsersWhereClause } from '@/modules/moderation/policy';

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

// ── getAppeals helpers ─────────────────────────────────────────────────────
async function fetchPendingAppeals(limit: number, offset: number) {
  const whereClause = { status: 'PENDING' as const };
  return Promise.all([
    prisma.appeal.findMany({
      where: whereClause,
      include: { user: { select: APPEAL_USER_SELECT } },
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
    return {
      ...appeal,
      reporter: appeal.user,
      banReason: activeBan?.reason ?? 'Unknown',
      banDate: activeBan?.createdAt ?? new Date(),
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

    revalidateAppealPath(ROUTES.BANNED);
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

    await applyAppealResolution(appealId, appeal.userId, approved, response, session.user.id);
    await notifyAppealResult(appeal.userId, approved, response, appealId);

    await logAction({
      action: 'APPEAL_RESOLVED',
      entityType: 'Appeal',
      entityId: appealId,
      userId: session.user.id,
      details: { approved, userId: appeal.userId, response },
    });

    revalidateAppealPath(ROUTES.ADMIN_APPEALS);
    return actionSuccess(null);
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
