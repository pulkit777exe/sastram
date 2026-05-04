'use server';

import { z } from 'zod';
import { requireSession } from '@/modules/auth/session';
import { revalidatePath } from 'next/cache';
import { logAction } from '@/modules/audit/repository';
import { prisma } from '@/lib/infrastructure/prisma';
import { withValidation } from '@/lib/utils/server-action';
import { getBannedUsersSchema } from '@/modules/moderation/schemas';

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
      return { data: null, error: 'You are not banned' };
    }

    const activeBans = await prisma.userBan.findMany({
      where: { userId: session.user.id, isActive: true },
      orderBy: { createdAt: 'desc' },
    });

    if (activeBans.length === 0) {
      return { data: null, error: 'No active ban found to appeal' };
    }

    const sourceReport = reportId
      ? await prisma.report.findUnique({ where: { id: reportId }, select: { messageId: true } })
      : await prisma.report.findFirst({
          where: { message: { senderId: session.user.id } },
          orderBy: { createdAt: 'desc' },
          select: { messageId: true },
        });

    if (!sourceReport?.messageId) {
      return { data: null, error: 'No report found to appeal' };
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

    revalidatePath('/banned');
    return { data: null, error: null };
  }
);

export const getAppeals = withValidation(
  z.object({}),
  'getAppeals',
  async () => {
    const session = await requireSession();
    if (session.user.role !== 'ADMIN' && session.user.role !== 'MODERATOR') {
      return { data: null, error: 'Something went wrong' };
    }

    const appeals = await prisma.report.findMany({
      where: { status: 'PENDING', category: 'OTHER', details: { startsWith: 'APPEAL:' } },
      include: { reporter: { select: { id: true, name: true, email: true, image: true } } },
      orderBy: { createdAt: 'asc' },
    });

    const appealsWithBanInfo = await Promise.all(
      appeals.map(async (appeal) => {
        const activeBans = await prisma.userBan.findMany({
          where: { userId: appeal.reporterId, isActive: true },
          orderBy: { createdAt: 'desc' },
        });

        return {
          ...appeal,
          details: appeal.details?.replace(/^APPEAL:\s*/i, '') ?? null,
          banReason: activeBans[0]?.reason || 'Unknown',
          banDate: activeBans[0]?.createdAt || new Date(),
        };
      })
    );

    return { data: appealsWithBanInfo, error: null };
  }
);

export const resolveAppeal = withValidation(
  resolveAppealSchema,
  'resolveAppeal',
  async ({ appealId, approved }) => {
    const session = await requireSession();
    if (session.user.role !== 'ADMIN' && session.user.role !== 'MODERATOR') {
      return { data: null, error: 'Something went wrong' };
    }

    const appeal = await prisma.report.findUnique({
      where: { id: appealId },
      include: { reporter: true },
    });

    if (!appeal) {
      return { data: null, error: 'Appeal not found' };
    }

    await prisma.$transaction(async (tx) => {
      await tx.report.update({
        where: { id: appealId },
        data: { status: approved ? 'RESOLVED' : 'DISMISSED', resolvedBy: session.user.id },
      });

      if (approved) {
        const activeBans = await tx.userBan.findMany({
          where: { userId: appeal.reporterId, isActive: true },
          select: { id: true },
        });

        for (const ban of activeBans) {
          await tx.userBan.update({ where: { id: ban.id }, data: { isActive: false } });

          const otherActiveBans = await tx.userBan.count({
            where: { userId: appeal.reporterId, isActive: true, id: { not: ban.id } },
          });

          if (otherActiveBans === 0) {
            await tx.user.update({ where: { id: appeal.reporterId }, data: { status: 'ACTIVE' } });
          }
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

    revalidatePath('/dashboard/admin/appeals');
    return { data: null, error: null };
  }
);

export const getBannedUsers = withValidation(
  getBannedUsersSchema,
  'getBannedUsers',
  async (filters) => {
    const session = await requireSession();
    if (!['ADMIN', 'MODERATOR'].includes(session.user.role || '')) {
      return { data: null, error: 'Something went wrong' };
    }

    const limit = Math.min(filters.limit || 50, 100);
    const offset = filters.offset || 0;

    const whereClause: any = {};
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
        pagination: { total: totalCount, limit, offset, hasMore: offset + limit < totalCount },
      },
      error: null,
    };
  }
);
