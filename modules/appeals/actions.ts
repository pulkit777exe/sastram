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
import { actionSuccess } from '@/lib/actions/result';

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

// Appeal rows hang off a message, but a ban isn't always traceable to one.
// Walk from the most specific evidence to the least: the cited report, then any
// report against this user, then their last message.
async function resolveAppealMessageId(userId: string, reportId?: string) {
  if (reportId) {
    const report = await prisma.report.findUnique({
      where: { id: reportId },
      select: { messageId: true },
    });
    if (report) return report.messageId;
  }

  const banReport = await prisma.report.findFirst({
    where: { message: { senderId: userId } },
    orderBy: { createdAt: 'desc' },
    select: { messageId: true },
  });
  if (banReport) return banReport.messageId;

  const lastMessage = await prisma.message.findFirst({
    where: { senderId: userId },
    orderBy: { createdAt: 'desc' },
    select: { id: true },
  });
  return lastMessage?.id ?? null;
}

export const submitAppeal = withValidation(
  createAppealSchema,
  'submitAppeal',
  async ({ reason, reportId }) => {
    // checkBanStatus: false — by definition only banned users get here.
    const session = await requireSession(false);

    if (session.user.status !== 'BANNED' && session.user.status !== 'SUSPENDED') {
      return { data: null, error: 'You are not banned', ok: false, errorCode: 'VALIDATION_ERROR' };
    }

    const activeBan = await prisma.userBan.findFirst({
      where: { userId: session.user.id, isActive: true },
      orderBy: { createdAt: 'desc' },
    });

    if (!activeBan) {
      return {
        data: null,
        error: 'No active ban found to appeal',
        ok: false,
        errorCode: 'NOT_FOUND',
      };
    }

    const messageId = await resolveAppealMessageId(session.user.id, reportId);

    if (!messageId) {
      return { data: null, error: 'No message found to appeal', ok: false, errorCode: 'NOT_FOUND' };
    }

    const existingAppeal = await prisma.appeal.findFirst({
      where: { userId: session.user.id, status: 'PENDING' },
    });

    if (existingAppeal) {
      return {
        data: null,
        error: 'You already have a pending appeal',
        ok: false,
        errorCode: 'CONFLICT',
      };
    }

    const appeal = await prisma.appeal.create({
      data: {
        messageId,
        userId: session.user.id,
        status: 'PENDING',
        reason,
      },
    });

    await logAction({
      action: 'APPEAL_SUBMITTED',
      entityType: 'Appeal',
      entityId: appeal.id,
      userId: session.user.id,
      details: { reason, banId: activeBan.id },
    });

    revalidatePath(ROUTES.BANNED);
    return actionSuccess(null);
  }
);

export const getAppeals = withValidation(listSchema, 'getAppeals', async (filters) => {
  await requireModerationRole();

  const limit = Math.min(filters.limit || 50, 100);
  const offset = filters.offset || 0;
  const whereClause = { status: 'PENDING' as const };

  const [appeals, totalCount] = await Promise.all([
    prisma.appeal.findMany({
      where: whereClause,
      include: {
        user: { select: { id: true, name: true, email: true, image: true } },
      },
      // Oldest first — the queue is worked FIFO.
      orderBy: { createdAt: 'asc' },
      take: limit,
      skip: offset,
    }),
    prisma.appeal.count({ where: whereClause }),
  ]);

  const userIds = appeals.map((a) => a.userId).filter((id): id is string => id !== null);
  const allBans = await prisma.userBan.findMany({
    where: { userId: { in: userIds }, isActive: true },
    orderBy: { createdAt: 'desc' },
  });

  // Newest ban per user wins, which the desc ordering above gives us first.
  const latestBanByUser = new Map<string, (typeof allBans)[number]>();
  for (const ban of allBans) {
    if (ban.userId && !latestBanByUser.has(ban.userId)) {
      latestBanByUser.set(ban.userId, ban);
    }
  }

  const appealsWithBanInfo = appeals.map((appeal) => {
    const activeBan = appeal.userId ? latestBanByUser.get(appeal.userId) : undefined;
    return {
      ...appeal,
      reporter: appeal.user,
      banReason: activeBan?.reason || 'Unknown',
      banDate: activeBan?.createdAt || new Date(),
    };
  });

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

    if (!appeal) {
      return { data: null, error: 'Appeal not found', ok: false, errorCode: 'NOT_FOUND' };
    }

    await prisma.$transaction(async (tx) => {
      await tx.appeal.update({
        where: { id: appealId },
        data: {
          status: approved ? 'APPROVED' : 'REJECTED',
          moderatorId: session.user.id,
          response: response ?? null,
          resolvedAt: new Date(),
        },
      });

      if (approved) {
        await tx.userBan.updateMany({
          where: { userId: appeal.userId!, isActive: true },
          data: { isActive: false },
        });

        const remainingBans = await tx.userBan.count({
          where: { userId: appeal.userId!, isActive: true },
        });

        if (remainingBans === 0) {
          await tx.user.update({
            where: { id: appeal.userId! },
            data: { status: 'ACTIVE' },
          });
        }
      }
    });

    if (appeal.userId) {
      await dispatch({
        recipients: { userIds: [appeal.userId] },
        category: 'SYSTEM',
        title: approved ? 'Appeal Approved' : 'Appeal Rejected',
        message: approved
          ? `Your appeal has been approved. ${response ?? 'Your account has been restored.'}`
          : `Your appeal has been reviewed and rejected. ${response ?? 'No further action was taken.'}`,
        data: { appealId },
      });
    }

    await logAction({
      action: 'APPEAL_RESOLVED',
      entityType: 'Appeal',
      entityId: appealId,
      userId: session.user.id,
      details: { approved, userId: appeal.userId, response },
    });

    revalidatePath(ROUTES.ADMIN_APPEALS);
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

    const whereClause: { isActive?: boolean; threadId?: string } = {};
    if (filters.isActive !== undefined) whereClause.isActive = filters.isActive;
    if (filters.threadId) whereClause.threadId = filters.threadId;

    const [bans, totalCount] = await Promise.all([
      prisma.userBan.findMany({
        where: whereClause,
        include: {
          user: { select: { id: true, name: true, email: true, image: true, status: true } },
          issuer: { select: { id: true, name: true, email: true } },
          thread: { select: { id: true, name: true, slug: true } },
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
