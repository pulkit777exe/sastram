'use server';

import { logger } from '@/lib/infrastructure/logger';

import { prisma } from '@/lib/infrastructure/prisma';
import { requireSession } from '@/modules/auth';
import { z } from 'zod';
import { REPORT_STATUS, REPORT_CATEGORY_LABELS } from '@/lib/config/constants';
import { createReportSchema, updateReportStatusSchema, resolveReportSchema } from './schemas';
import { createNotification } from '@/modules/notifications';
import { requireRole } from '@/modules/policy';
import { requireReportsModeratorSession, assertCanReportOwnMessage } from './policy';
import { executeReportAuditAndRefresh } from './executors';
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
    return { data: null, error: 'Invalid input', ok: false, errorCode: 'VALIDATION_ERROR' };
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
      return { data: null, error: 'You have already reported this message', ok: false, errorCode: 'CONFLICT' };
    }

    const message = await prisma.message.findUnique({
      where: { id: validation.data.messageId },
      select: {
        id: true,
        senderId: true,
        threadId: true,
        thread: { select: { name: true, slug: true } },
      },
    });

    if (!message) {
      return { data: null, error: 'Message not found', ok: false, errorCode: 'NOT_FOUND' };
    }

    // Verify the reporter is a member of the thread
    const membership = await prisma.threadMember.findUnique({
      where: { threadId_userId: { threadId: message.threadId, userId: session.user.id } },
    });

    if (!membership) {
      return { data: null, error: 'You are not a member of this thread', ok: false, errorCode: 'FORBIDDEN' };
    }

    try {
      assertCanReportOwnMessage(session.user.id, message.senderId);
    } catch (error) {
      if (error instanceof Error) {
        return { data: null, error: error.message, ok: false, errorCode: 'FORBIDDEN' };
      }
      return { data: null, error: 'Something went wrong', ok: false, errorCode: 'INTERNAL_ERROR' };
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

    await executeReportAuditAndRefresh({
      action: 'REPORT_CREATED',
      entityType: 'Report',
      entityId: report.id,
      userId: session.user.id,
      details: {
        messageId: validation.data.messageId,
        category: validation.data.category,
      },
    });

    return {
      data: {
        reportId: report.id,
        message: `Thank you for reporting. We'll review this within 24 hours.`,
      },
      error: null,
      ok: true,
      errorCode: null,
    };
  } catch (error) {
    logger.error('[createReport]', error);
    return { data: null, error: 'Something went wrong', ok: false, errorCode: 'INTERNAL_ERROR' };
  }
}

export async function getReports(filters?: { status?: string; limit?: number; offset?: number }) {
  const parsed = reportFiltersSchema.safeParse(filters ?? {});
  if (!parsed.success) {
    return { data: null, error: 'Invalid input', ok: false, errorCode: 'VALIDATION_ERROR' };
  }

  try {
    await requireReportsModeratorSession();

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
            thread: {
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

    return { data: reports, error: null, ok: true, errorCode: null };
  } catch (error) {
    logger.error('[getReports]', error);
    return { data: null, error: 'Something went wrong', ok: false, errorCode: 'INTERNAL_ERROR' };
  }
}

export async function getReportStats() {
  try {
    await requireReportsModeratorSession();

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
      ok: true,
      errorCode: null,
    };
  } catch (error) {
    logger.error('[getReportStats]', error);
    return { data: null, error: 'Something went wrong', ok: false, errorCode: 'INTERNAL_ERROR' };
  }
}

export async function getReportWithContext(reportId: string) {
  const parsed = reportIdSchema.safeParse({ reportId });
  if (!parsed.success) {
    return { data: null, error: 'Invalid input', ok: false, errorCode: 'VALIDATION_ERROR' };
  }

  try {
    await requireRole(['ADMIN']);

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
              },
            },
            thread: {
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
          },
        },
      },
    });

    if (!report) {
      return { data: null, error: 'Report not found', ok: false, errorCode: 'NOT_FOUND' };
    }

    const [surroundingMessages, violationHistory, similarReports, userBanCount, userReportCount] =
      await Promise.all([
        prisma.message.findMany({
          where: {
            threadId: report.message.thread.id,
            createdAt: {
              gte: new Date(report.message.createdAt.getTime() - 5 * 60 * 1000),
              lte: new Date(report.message.createdAt.getTime() + 5 * 60 * 1000),
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
          threadTitle: report.message.thread.name,
          threadSlug: report.message.thread.slug,
          messageCount: report.message.thread.messageCount,
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
      ok: true,
      errorCode: null,
    };
  } catch (error) {
    logger.error('[getReportWithContext]', error);
    return { data: null, error: 'Something went wrong', ok: false, errorCode: 'INTERNAL_ERROR' };
  }
}

export async function updateReportStatusAction(reportId: string, status: 'RESOLVED' | 'DISMISSED') {
  const validation = updateReportStatusSchema.safeParse({ reportId, status });
  if (!validation.success) {
    return { data: null, error: 'Invalid input', ok: false, errorCode: 'VALIDATION_ERROR' };
  }

  try {
    const session = await requireReportsModeratorSession();

    await prisma.report.update({
      where: { id: validation.data.reportId },
      data: {
        status: validation.data.status as 'RESOLVED' | 'DISMISSED',
        resolvedBy: status === 'RESOLVED' || status === 'DISMISSED' ? session.user.id : null,
      },
    });

    await executeReportAuditAndRefresh({
      action: 'REPORT_STATUS_UPDATED',
      entityType: 'Report',
      entityId: validation.data.reportId,
      userId: session.user.id,
      details: { status: validation.data.status },
    });
    return { data: null, error: null, ok: true, errorCode: null };
  } catch (error) {
    logger.error('[updateReportStatusAction]', error);
    return { data: null, error: 'Something went wrong', ok: false, errorCode: 'INTERNAL_ERROR' };
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
            thread: {
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
      threadName: r.message.thread.name,
      messagePreview: r.message.content.substring(0, 100),
    }));
    return { data, error: null, ok: true, errorCode: null };
  } catch (error) {
    logger.error('[getMyReports]', error);
    return { data: null, error: 'Something went wrong', ok: false, errorCode: 'INTERNAL_ERROR' };
  }
}

export async function resolveReport(data: {
  reportId: string;
  action: 'DISMISS' | 'REMOVE_MESSAGE' | 'WARN_USER' | 'SUSPEND_USER' | 'BAN_USER';
  note: string;
  notifyReporter: boolean;
  duration?: string;
}) {
  const parsed = resolveReportSchema.safeParse(data);
  if (!parsed.success) {
    return { data: null, error: 'Invalid input', ok: false, errorCode: 'VALIDATION_ERROR' };
  }

  try {
    const session = await requireReportsModeratorSession();

    const report = await prisma.report.findUnique({
      where: { id: parsed.data.reportId },
      include: {
        message: {
          include: {
            sender: { select: { id: true, name: true, email: true } },
            thread: { select: { id: true, name: true, slug: true } },
          },
        },
        reporter: { select: { id: true, name: true, email: true } },
      },
    });

    if (!report) {
      return { data: null, error: 'Report not found', ok: false, errorCode: 'NOT_FOUND' };
    }

    const newStatus = parsed.data.action === 'DISMISS' ? 'DISMISSED' : 'RESOLVED';
    let banExpiresAt: Date | null = null;

    await prisma.$transaction(async (tx) => {
      await tx.report.update({
        where: { id: parsed.data.reportId },
        data: {
          status: newStatus,
          resolution: parsed.data.note,
          resolvedBy: session.user.id,
        },
      });

      if (
        parsed.data.action === 'REMOVE_MESSAGE' ||
        parsed.data.action === 'WARN_USER' ||
        parsed.data.action === 'SUSPEND_USER' ||
        parsed.data.action === 'BAN_USER'
      ) {
        await tx.message.update({
          where: { id: report.messageId },
          data: { deletedAt: new Date() },
        });
      }

      if (parsed.data.action === 'SUSPEND_USER' || parsed.data.action === 'BAN_USER') {
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
          banExpiresAt = new Date(
            now.getTime() + (durationMap[parsed.data.duration] || 24 * 60 * 60 * 1000)
          );
        }

        await tx.userBan.create({
          data: {
            userId: report.message.senderId,
            bannedBy: session.user.id,
            reason: parsed.data.note,
            isActive: true,
            expiresAt: banExpiresAt,
          },
        });

        await tx.user.update({
          where: { id: report.message.senderId },
          data: {
            status: parsed.data.action === 'BAN_USER' ? 'BANNED' : 'SUSPENDED',
          },
        });
      }
    });

    if (parsed.data.action === 'WARN_USER') {
      await createNotification({
        userId: report.message.senderId,
        type: 'SYSTEM',
        title: 'Official Warning',
        message: `Your message has been removed for violating community guidelines. Reason: ${parsed.data.note}`,
        data: {
          reportId: parsed.data.reportId,
          threadSlug: report.message.thread.slug,
        },
      });
    }

    if (parsed.data.action === 'BAN_USER' || parsed.data.action === 'SUSPEND_USER') {
      await createNotification({
        userId: report.message.senderId,
        type: 'SYSTEM',
        title: parsed.data.action === 'BAN_USER' ? 'Account Banned' : 'Account Suspended',
        message:
          parsed.data.action === 'BAN_USER'
            ? `Your account has been permanently banned. Reason: ${parsed.data.note}`
            : `Your account has been suspended until ${(banExpiresAt as Date | null)?.toLocaleDateString() ?? 'indefinitely'}. Reason: ${
                parsed.data.note
              }`,
        data: { reportId: parsed.data.reportId, duration: parsed.data.duration },
      });
    }

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

    await executeReportAuditAndRefresh({
      action: 'REPORT_RESOLVED',
      entityType: 'Report',
      entityId: parsed.data.reportId,
      userId: session.user.id,
      details: {
        action: parsed.data.action,
        note: parsed.data.note,
        duration: parsed.data.duration,
      },
    });

    return {
      data: {
        message: `Report ${
          parsed.data.action === 'DISMISS' ? 'dismissed' : 'resolved'
        } successfully`,
      },
      error: null,
      ok: true,
      errorCode: null,
    };
  } catch (error) {
    logger.error('[resolveReport]', error);
    return { data: null, error: 'Something went wrong', ok: false, errorCode: 'INTERNAL_ERROR' };
  }
}
