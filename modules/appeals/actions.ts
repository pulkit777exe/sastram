import { logger } from '@/lib/infrastructure/logger';
'use server';

import { prisma } from '@/lib/infrastructure/prisma';
import { requireSession } from '@/modules/auth/session';
import { revalidatePath } from 'next/cache';
import { z } from 'zod';
import { logAction } from '@/modules/audit/repository';

const createAppealSchema = z.object({
  reason: z.string().min(10, 'Reason must be at least 10 characters long'),
  reportId: z.string().optional(),
});

const resolveAppealSchema = z.object({
  appealId: z.string().cuid(),
  approved: z.boolean(),
});

export async function submitAppeal(formData: FormData) {
  const rawData = {
    reason: formData.get('reason'),
    reportId: formData.get('reportId'),
  };

  const validation = createAppealSchema.safeParse(rawData);
  if (!validation.success) {
    return { data: null, error: 'Invalid input' };
  }

  try {
    const session = await requireSession(false);

    if (session.user.status !== 'BANNED' && session.user.status !== 'SUSPENDED') {
      return { data: null, error: 'You are not banned' };
    }

    // Find active bans for the user
    const activeBans = await prisma.userBan.findMany({
      where: {
        userId: session.user.id,
        isActive: true,
      },
      orderBy: { createdAt: 'desc' },
    });

    if (activeBans.length === 0) {
      return { data: null, error: 'No active ban found to appeal' };
    }

    const sourceReport = validation.data.reportId
      ? await prisma.report.findUnique({
          where: { id: validation.data.reportId },
          select: { messageId: true },
        })
      : await prisma.report.findFirst({
          where: {
            message: { senderId: session.user.id },
          },
          orderBy: { createdAt: 'desc' },
          select: { messageId: true },
        });

    if (!sourceReport?.messageId) {
      return { data: null, error: 'No report found to appeal' };
    }

    // Create a report to serve as the appeal (tagged via details prefix)
    const appealReport = await prisma.report.create({
      data: {
        messageId: sourceReport.messageId,
        reporterId: session.user.id,
        category: 'OTHER' as const,
        details: `APPEAL: ${validation.data.reason}`,
        status: 'PENDING' as const,
      },
    });

    await logAction({
      action: 'APPEAL_SUBMITTED',
      entityType: 'Report',
      entityId: appealReport.id,
      userId: session.user.id,
      details: {
        reason: validation.data.reason,
        banId: activeBans[0].id,
      },
    });

    revalidatePath('/banned');
    return { data: null, error: null };
  } catch (error) {
    logger.error('[submitAppeal]', error);
    return { data: null, error: 'Something went wrong' };
  }
}

type AppealWithBanInfo = {
  id: string;
  reporter: {
    id: string;
    name: string | null;
    email: string;
    image: string | null;
  };
  details: string | null;
  status: string;
  createdAt: Date;
  banReason: string;
  banDate: Date;
};

export async function getAppeals() {
  try {
    const session = await requireSession();
    if (session.user.role !== 'ADMIN' && session.user.role !== 'MODERATOR') {
      return { data: null, error: 'Something went wrong' };
    }

    // Get all pending reports that are appeals (details prefix)
    const appeals = await prisma.report.findMany({
      where: {
        status: 'PENDING',
        category: 'OTHER',
        details: { startsWith: 'APPEAL:' },
      },
      include: {
        reporter: {
          select: {
            id: true,
            name: true,
            email: true,
            image: true,
          },
        },
      },
      orderBy: { createdAt: 'asc' },
    });

    // For each appeal, get associated active bans
    const appealsWithBanInfo = await Promise.all(
      appeals.map(async (appeal) => {
        const activeBans = await prisma.userBan.findMany({
          where: {
            userId: appeal.reporterId,
            isActive: true,
          },
          orderBy: { createdAt: 'desc' },
        });

        return {
          ...appeal,
          details: appeal.details?.replace(/^APPEAL:\\s*/i, '') ?? null,
          banReason: activeBans[0]?.reason || 'Unknown',
          banDate: activeBans[0]?.createdAt || new Date(),
        };
      })
    );

    return { data: appealsWithBanInfo, error: null };
  } catch (error) {
    logger.error('[getAppeals]', error);
    return { data: null, error: 'Something went wrong' };
  }
}

export async function resolveAppeal(appealId: string, approved: boolean) {
  const parsed = resolveAppealSchema.safeParse({ appealId, approved });
  if (!parsed.success) {
    return { data: null, error: 'Invalid input' };
  }

  try {
    const session = await requireSession();
    if (session.user.role !== 'ADMIN' && session.user.role !== 'MODERATOR') {
      return { data: null, error: 'Something went wrong' };
    }

    const appeal = await prisma.report.findUnique({
      where: { id: parsed.data.appealId },
      include: { reporter: true },
    });

    if (!appeal) {
      return { data: null, error: 'Appeal not found' };
    }

    await prisma.$transaction(async (tx) => {
      // Update appeal status
      await tx.report.update({
        where: { id: appealId },
        data: {
          status: parsed.data.approved ? 'RESOLVED' : 'DISMISSED',
          resolvedBy: session.user.id,
        },
      });

      if (parsed.data.approved) {
        // Get all active bans for this user
        const activeBans = await tx.userBan.findMany({
          where: { userId: appeal.reporterId, isActive: true },
          select: { id: true },
        });

        // Unban each ban using the existing unbanUser logic
        for (const ban of activeBans) {
          await tx.userBan.update({
            where: { id: ban.id },
            data: { isActive: false },
          });

          // Handle user status restoration (only if no other active global bans)
          const otherActiveBans = await tx.userBan.count({
            where: {
              userId: appeal.reporterId,
              isActive: true,
              id: { not: ban.id },
            },
          });

          if (otherActiveBans === 0) {
            await tx.user.update({
              where: { id: appeal.reporterId },
              data: { status: 'ACTIVE' },
            });
          }
        }
      }
    });

    await logAction({
      action: 'APPEAL_RESOLVED',
      entityType: 'Report',
      entityId: appealId,
      userId: session.user.id,
      details: {
        approved: parsed.data.approved,
        userId: appeal.reporterId,
      },
    });

    revalidatePath('/dashboard/admin/appeals');
    return { data: null, error: null };
  } catch (error) {
    logger.error('[resolveAppeal]', error);
    return { data: null, error: 'Something went wrong' };
  }
}
