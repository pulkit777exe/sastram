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

const createAppealSchema = z.object({
  reason: z.string().min(10, 'Reason must be at least 10 characters long'),
  reportId: z.string().cuid().optional(),
});

const resolveAppealSchema = z.object({
  appealId: z.string().cuid(),
  approved: z.boolean(),
});

export const submitAppeal = withValidation(
  createAppealSchema,
  'submitAppeal',
  async ({ reason, reportId }) => {
    const session = await requireSession(false);

    if (session.user.status !== 'BANNED' && session.user.status !== 'SUSPENDED') {
      return { data: null, error: 'You are not banned', ok: false, errorCode: 'VALIDATION_ERROR' };
    }

    const activeBans = await prisma.userBan.findMany({
      where: { userId: session.user.id, isActive: true },
      orderBy: { createdAt: 'desc' },
    });

    if (activeBans.length === 0) {
      return { data: null, error: 'No active ban found to appeal', ok: false, errorCode: 'NOT_FOUND' };
    }

    const sourceReport = reportId
      ? await prisma.report.findUnique({ where: { id: reportId }, select: { messageId: true } })
      : await prisma.report.findFirst({
          where: { message: { senderId: session.user.id } },
          orderBy: { createdAt: 'desc' },
          select: { messageId: true },
        });

    if (!sourceReport?.messageId) {
      return { data: null, error: 'No report found to appeal', ok: false, errorCode: 'NOT_FOUND' };
    }

    const appealReport = await prisma.report.create({
      data: {
        messageId: sourceReport.messageId,
        reporterId: session.user.id,
        category: 'OTHER',
        details: `APPEAL: ${reason}`,
        status: 'PENDING',
      },
    });

    await logAction({
      action: 'APPEAL_SUBMITTED',
      entityType: 'Report',
      entityId: appealReport.id,
      userId: session.user.id,
      details: { reason, banId: activeBans[0].id },
    });

    revalidatePath(ROUTES.BANNED);
    return { data: null, error: null, ok: true, errorCode: null };
  }
);

export const getAppeals = withValidation(
  z.object({
    limit: z.number().int().min(1).max(100).optional(),
    offset: z.number().int().min(0).optional(),
  }),
  'getAppeals',
  async (filters) => {
    await requireModerationRole();

    const limit = Math.min(filters.limit || 50, 100);
    const offset = filters.offset || 0;

    const whereClause = { status: 'PENDING' as const, category: 'OTHER' as const, details: { startsWith: 'APPEAL:' } };

    const [appeals, totalCount] = await Promise.all([
      prisma.report.findMany({
        where: whereClause,
        include: { reporter: { select: { id: true, name: true, email: true, image: true } } },
        orderBy: { createdAt: 'asc' },
        take: limit,
        skip: offset,
      }),
      prisma.report.count({ where: whereClause }),
    ]);

    const reporterIds = appeals.map((a) => a.reporterId);
    const allBans = await prisma.userBan.findMany({
      where: { userId: { in: reporterIds }, isActive: true },
      orderBy: { createdAt: 'desc' },
    });

    const banMap = new Map<string, (typeof allBans)[0]>();
    for (const ban of allBans) {
      if (!banMap.has(ban.userId)) {
        banMap.set(ban.userId, ban);
      }
    }

    const appealsWithBanInfo = appeals.map((appeal) => {
      const activeBan = banMap.get(appeal.reporterId);
      return {
        ...appeal,
        details: appeal.details?.replace(/^APPEAL:\s*/i, '') ?? null,
        banReason: activeBan?.reason || 'Unknown',
        banDate: activeBan?.createdAt || new Date(),
      };
    });

    return { data: { appeals: appealsWithBanInfo, pagination: { total: totalCount, limit, offset, hasMore: offset + limit < totalCount } }, error: null, ok: true, errorCode: null };
  }
);

export const resolveAppeal = withValidation(
  resolveAppealSchema,
  'resolveAppeal',
  async ({ appealId, approved }) => {
    const session = await requireModerationRole();

    const appeal = await prisma.report.findUnique({
      where: { id: appealId },
      include: { reporter: true },
    });

    if (!appeal) {
      return { data: null, error: 'Appeal not found', ok: false, errorCode: 'NOT_FOUND' };
    }

    await prisma.$transaction(async (tx) => {
      await tx.report.update({
        where: { id: appealId },
        data: { status: approved ? 'RESOLVED' : 'DISMISSED', resolvedBy: session.user.id },
      });

      if (approved) {
        await tx.userBan.updateMany({
          where: { userId: appeal.reporterId, isActive: true },
          data: { isActive: false },
        });

        const remainingBans = await tx.userBan.count({
          where: { userId: appeal.reporterId, isActive: true },
        });

        if (remainingBans === 0) {
          await tx.user.update({
            where: { id: appeal.reporterId },
            data: { status: 'ACTIVE' },
          });
        }
      }
    });

    await logAction({
      action: 'APPEAL_RESOLVED',
      entityType: 'Report',
      entityId: appealId,
      userId: session.user.id,
      details: { approved, userId: appeal.reporterId },
    });

    revalidatePath(ROUTES.ADMIN_APPEALS);
    return { data: null, error: null, ok: true, errorCode: null };
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

    return {
      data: {
        bans,
        pagination: { total: totalCount, limit, offset, hasMore: computeHasMore(offset, limit, totalCount) },
      },
      error: null,
      ok: true,
      errorCode: null,
    };
  }
);
