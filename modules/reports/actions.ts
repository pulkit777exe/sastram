import { logger } from '@/lib/infrastructure/logger';
'use server';

import { prisma } from '@/lib/infrastructure/prisma';
import { requireSession, assertAdmin } from '@/modules/auth/session';
import { revalidatePath } from 'next/cache';
import { z } from 'zod';
import { REPORT_STATUS, REPORT_CATEGORY_LABELS } from '@/lib/config/constants';
import { createReportSchema, updateReportStatusSchema, resolveReportSchema } from './schemas';
import { createNotification } from '@/modules/notifications/repository';
import { logAction } from '@/modules/audit/repository';
import type { ReportCategory } from '@prisma/client';

const reportFiltersSchema = z.object({
  status: z.string().optional(),
  limit: z.number().int().positive().max(100).optional(),
  offset: z.number().int().nonnegative().optional(),
});

const reportIdSchema = z.object({
  reportId: z.string().cuid(),
});

export async function createReport(data: {
  messageId: string;
  category: string;
  details?: string;
}) {
  const validation = createReportSchema.safeParse(data);
  if (!validation.success) {
    return { data: null, error: 'Invalid input' };
  }

  try {
    const session = await requireSession();
    const existingReport = await prisma.report.findFirst({
      where: {
        messageId: validation.data.messageId,
        reporterId: session.user.id,
      },
    });

    if (existingReport) {
      return { data: null, error: 'You have already reported this message' };
    }

    const message = await prisma.message.findUnique({
      where: { id: validation.data.messageId },
      select: {
        id: true,
        senderId: true,
        section: { select: { name: true, slug: true } },
      },
    });

    if (!message) {
      return { data: null, error: 'Message not found' };
    }

    if (message.senderId === session.user.id) {
      return { data: null, error: 'You cannot report your own message' };
    }
    const report = await prisma.report.create({
      data: {
        messageId: validation.data.messageId,
        reporterId: session.user.id,
        category: validation.data.category as ReportCategory,
        details: validation.data.details,
        status: REPORT_STATUS.PENDING,
      },
    });

    await logAction({
      action: 'REPORT_CREATED',
      entityType: 'Report',
      entityId: report.id,
      userId: session.user.id,
      details: {
        messageId: validation.data.messageId,
        category: validation.data.category,
      },
    });

    revalidatePath('/dashboard/admin/reports');
    revalidatePath('/dashboard/admin/moderation');

    return {
      data: {
        reportId: report.id,
        message: `Thank you for reporting. We'll review this within 24 hours.`,
      },
      error: null,
    };
  } catch (error) {
    logger.error('[createReport]', error);
    return { data: null, error: 'Something went wrong' };
  }
}

export async function getReports(filters?: { status?: string; limit?: number; offset?: number }) {
  const parsed = reportFiltersSchema.safeParse(filters ?? {});
  if (!parsed.success) {
    return { data: null, error: 'Invalid input' };
  }

  try {
    const session = await requireSession();

    if (session.user.role !== 'ADMIN' && session.user.role !== 'MODERATOR') {
      return { data: null, error: 'Something went wrong' };
    }

    const limit = Math.min(parsed.data.limit || 50, 100);
    const offset = parsed.data.offset || 0;

    const whereClause: Record<string, unknown> = {};

    if (parsed.data.status) {
      whereClause.status = parsed.data.status;
    }

    const reports = await prisma.report.findMany({
      where: whereClause,
      include: {
        message: {
          include: {
            sender: {
              select: {
                id: true,
                name: true,
                email: true,
                image: true,
                status: true,
                createdAt: true,
              },
            },
            section: {
              select: {
                id: true,
                name: true,
                slug: true,
              },
            },
          },
        },
        reporter: {
          select: {
            id: true,
            name: true,
            email: true,
          },
        },
      },
      orderBy: [{ createdAt: 'desc' }],
      take: limit,
      skip: offset,
    });

    return { data: reports, error: null };
  } catch (error) {
    logger.error('[getReports]', error);
    return { data: null, error: 'Something went wrong' };
  }
}

export async function getReportStats() {
  try {
    const session = await requireSession();

    if (session.user.role !== 'ADMIN' && session.user.role !== 'MODERATOR') {
      return { data: null, error: 'Something went wrong' };
    }

    const today = new Date();
    today.setHours(0, 0, 0, 0);

    const [total, pending, resolvedToday] = await Promise.all([
      prisma.report.count(),
      prisma.report.count({ where: { status: 'PENDING' } }),
      prisma.report.count({
        where: {
          status: { in: ['RESOLVED', 'DISMISSED'] },
          updatedAt: { gte: today },
        },
      }),
    ]);

    return {
      data: {
        total,
        pending,
        critical: 0,
        high: 0,
        medium: 0,
        low: 0,
        resolvedToday,
        autoModActions: 0,
      },
      error: null,
    };
  } catch (error) {
    logger.error('[getReportStats]', error);
    return { data: null, error: 'Something went wrong' };
  }
}

export async function getReportWithContext(reportId: string) {
  const parsed = reportIdSchema.safeParse({ reportId });
  if (!parsed.success) {
    return { data: null, error: 'Invalid input' };
  }

  try {
    const session = await requireSession();
    await assertAdmin(session.user);

    const report = await prisma.report.findUnique({
      where: { id: parsed.data.reportId },
      include: {
        message: {
          include: {
            sender: {
              select: {
                id: true,
                name: true,
                email: true,
                image: true,
                status: true,
                createdAt: true,
                reputationPoints: true,
              },
            },
            section: {
              select: {
                id: true,
                name: true,
                slug: true,
                messageCount: true,
              },
            },
          },
        },
        reporter: {
          select: {
            id: true,
            name: true,
            email: true,
            createdAt: true,
            reputationPoints: true,
          },
        },
      },
    });

    if (!report) {
      return { data: null, error: 'Report not found' };
    }

    const [surroundingMessages, violationHistory, similarReports, userBanCount, userReportCount] =
      await Promise.all([
        prisma.message.findMany({
          where: {
            sectionId: report.message.section.id,
            createdAt: {
              gte: new Date(report.message.createdAt.getTime() - 5 * 60 * 1000), // 5 min before
              lte: new Date(report.message.createdAt.getTime() + 5 * 60 * 1000), // 5 min after
            },
            deletedAt: null,
          },
          include: {
            sender: {
              select: { id: true, name: true },
            },
          },
          orderBy: { createdAt: 'asc' },
          take: 10,
        }),
        prisma.userBan.findMany({
          where: { userId: report.message.senderId },
          select: {
            id: true,
            reason: true,
            createdAt: true,
            isActive: true,
            expiresAt: true,
          },
          orderBy: { createdAt: 'desc' },
          take: 5,
        }),
        prisma.report.findMany({
          where: {
            messageId: report.messageId,
            id: { not: parsed.data.reportId },
          },
          select: {
            id: true,
            category: true,
            status: true,
            createdAt: true,
          },
        }),
        prisma.userBan.count({
          where: { userId: report.message.senderId },
        }),
        prisma.report.count({
          where: {
            message: { senderId: report.message.senderId },
            status: 'RESOLVED',
          },
        }),
      ]);

    const accountAgeDays = Math.floor(
      (Date.now() - new Date(report.message.sender.createdAt).getTime()) / (1000 * 60 * 60 * 24)
    );

    const trustScore = Math.max(
      0,
      Math.min(100, 50 + accountAgeDays * 0.5 - userBanCount * 20 - userReportCount * 5)
    );

    return {
      data: {
        ...report,
        categoryLabel:
          REPORT_CATEGORY_LABELS[report.category as keyof typeof REPORT_CATEGORY_LABELS],
        threadContext: {
          threadTitle: report.message.section.name,
          threadSlug: report.message.section.slug,
          messageCount: report.message.section.messageCount,
          surroundingMessages: surroundingMessages.map((m) => ({
            id: m.id,
            content: m.content,
            senderId: m.senderId,
            senderName: m.sender.name,
            createdAt: m.createdAt,
            isReported: m.id === report.messageId,
          })),
        },
        reportedUserProfile: {
          id: report.message.sender.id,
          name: report.message.sender.name,
          email: report.message.sender.email,
          createdAt: report.message.sender.createdAt,
          status: report.message.sender.status,
          reputationPoints: report.message.sender.reputationPoints,
          trustScore: Math.round(trustScore),
          violationHistory: violationHistory.map((v) => ({
            id: v.id,
            action: v.isActive ? 'Active Ban' : 'Past Ban',
            reason: v.reason,
            createdAt: v.createdAt,
          })),
        },
        similarReports,
        reportCount: similarReports.length + 1,
      },
      error: null,
    };
  } catch (error) {
    logger.error('[getReportWithContext]', error);
    return { data: null, error: 'Something went wrong' };
  }
}

export async function updateReportStatusAction(reportId: string, status: 'RESOLVED' | 'DISMISSED') {
  const validation = updateReportStatusSchema.safeParse({ reportId, status });
  if (!validation.success) {
    return { data: null, error: 'Invalid input' };
  }

  try {
    const session = await requireSession();

    if (session.user.role !== 'ADMIN' && session.user.role !== 'MODERATOR') {
      return { data: null, error: 'Something went wrong' };
    }

    await prisma.report.update({
      where: { id: validation.data.reportId },
      data: {
        status: validation.data.status as 'RESOLVED' | 'DISMISSED',
        resolvedBy: status === 'RESOLVED' || status === 'DISMISSED' ? session.user.id : null,
      },
    });

    revalidatePath('/dashboard/admin/reports');
    revalidatePath('/dashboard/admin/moderation');
    return { data: null, error: null };
  } catch (error) {
    logger.error('[updateReportStatusAction]', error);
    return { data: null, error: 'Something went wrong' };
  }
}

export async function getMyReports() {
  try {
    const session = await requireSession();
    const reports = await prisma.report.findMany({
      where: { reporterId: session.user.id },
      include: {
        message: {
          select: {
            id: true,
            content: true,
            section: {
              select: { name: true, slug: true },
            },
          },
        },
      },
      orderBy: { createdAt: 'desc' },
      take: 20,
    });

    const data = reports.map((r) => ({
      id: r.id,
      category: r.category,
      categoryLabel: REPORT_CATEGORY_LABELS[r.category as keyof typeof REPORT_CATEGORY_LABELS],
      status: r.status,
      createdAt: r.createdAt,
      resolvedBy: r.resolvedBy,
      threadName: r.message.section.name,
      messagePreview: r.message.content.substring(0, 100),
    }));
    return { data, error: null };
  } catch (error) {
    logger.error('[getMyReports]', error);
    return { data: null, error: 'Something went wrong' };
  }
}

/**
 * Resolve a report with a specific action
 */
export async function resolveReport(data: {
  reportId: string;
  action: 'DISMISS' | 'REMOVE_MESSAGE' | 'WARN_USER' | 'SUSPEND_USER' | 'BAN_USER';
  note: string;
  notifyReporter: boolean;
  duration?: string;
}) {
  const parsed = resolveReportSchema.safeParse(data);
  if (!parsed.success) {
    return { data: null, error: 'Invalid input' };
  }

  try {
    const session = await requireSession();

    if (session.user.role !== 'ADMIN' && session.user.role !== 'MODERATOR') {
      return { data: null, error: 'Something went wrong' };
    }

    const report = await prisma.report.findUnique({
      where: { id: parsed.data.reportId },
      include: {
        message: {
          include: {
            sender: { select: { id: true, name: true, email: true } },
            section: { select: { id: true, name: true, slug: true } },
          },
        },
        reporter: { select: { id: true, name: true, email: true } },
      },
    });

    if (!report) {
      return { data: null, error: 'Report not found' };
    }

    // Update report status
    const newStatus = parsed.data.action === 'DISMISS' ? 'DISMISSED' : 'RESOLVED';

    await prisma.report.update({
      where: { id: parsed.data.reportId },
      data: {
        status: newStatus,
        resolution: parsed.data.note,
        resolvedBy: session.user.id,
      },
    });

    // Execute action based on type
    if (
      parsed.data.action === 'REMOVE_MESSAGE' ||
      parsed.data.action === 'WARN_USER' ||
      parsed.data.action === 'SUSPEND_USER' ||
      parsed.data.action === 'BAN_USER'
    ) {
      // Soft delete the message
      await prisma.message.update({
        where: { id: report.messageId },
        data: { deletedAt: new Date() },
      });
    }

    if (parsed.data.action === 'WARN_USER') {
      // Create a warning notification
      await createNotification({
        userId: report.message.senderId,
        type: 'SYSTEM',
        title: 'Official Warning',
        message: `Your message has been removed for violating community guidelines. Reason: ${parsed.data.note}`,
        data: {
          reportId: parsed.data.reportId,
          threadSlug: report.message.section.slug,
        },
      });
    }

    if (parsed.data.action === 'SUSPEND_USER' || parsed.data.action === 'BAN_USER') {
      // Calculate ban expiry
      let expiresAt: Date | null = null;
      if (parsed.data.action === 'SUSPEND_USER' && parsed.data.duration) {
        const now = new Date();
        const durationMap: Record<string, number> = {
          '1h': 60 * 60 * 1000,
          '6h': 6 * 60 * 60 * 1000,
          '24h': 24 * 60 * 60 * 1000,
          '3d': 3 * 24 * 60 * 60 * 1000,
          '7d': 7 * 24 * 60 * 60 * 1000,
          '30d': 30 * 24 * 60 * 60 * 1000,
        };
        expiresAt = new Date(
          now.getTime() + (durationMap[parsed.data.duration] || 24 * 60 * 60 * 1000)
        );
      }

      // Create ban record
      await prisma.userBan.create({
        data: {
          userId: report.message.senderId,
          bannedBy: session.user.id,
          reason: parsed.data.note,
          isActive: true,
          expiresAt,
        },
      });

      // Update user status
      await prisma.user.update({
        where: { id: report.message.senderId },
        data: {
          status: parsed.data.action === 'BAN_USER' ? 'BANNED' : 'SUSPENDED',
        },
      });

      // Notify banned user
      await createNotification({
        userId: report.message.senderId,
        type: 'SYSTEM',
        title: parsed.data.action === 'BAN_USER' ? 'Account Banned' : 'Account Suspended',
        message:
          parsed.data.action === 'BAN_USER'
            ? `Your account has been permanently banned. Reason: ${parsed.data.note}`
            : `Your account has been suspended until ${expiresAt?.toLocaleDateString()}. Reason: ${
                parsed.data.note
              }`,
        data: { reportId: parsed.data.reportId, duration: parsed.data.duration },
      });
    }

    // Notify reporter if requested
    if (parsed.data.notifyReporter) {
      await createNotification({
        userId: report.reporterId,
        type: 'SYSTEM',
        title: 'Report Updated',
        message:
          parsed.data.action === 'DISMISS'
            ? 'Your report has been reviewed. No violation was found.'
            : 'Thank you for your report. Action has been taken.',
        data: { reportId: parsed.data.reportId },
      });
    }

    // Log the action
    await logAction({
      action: 'REPORT_RESOLVED',
      entityType: 'Report',
      entityId: parsed.data.reportId,
      userId: report.message.senderId,
      details: {
        action: parsed.data.action,
        note: parsed.data.note,
        duration: parsed.data.duration,
      },
    });

    revalidatePath('/dashboard/admin/reports');
    revalidatePath('/dashboard/admin/moderation');

    return {
      data: {
        message: `Report ${
          parsed.data.action === 'DISMISS' ? 'dismissed' : 'resolved'
        } successfully`,
      },
      error: null,
    };
  } catch (error) {
    logger.error('[resolveReport]', error);
    return { data: null, error: 'Something went wrong' };
  }
}
