'use server';

import { logger } from '@/lib/infrastructure/logger';
import { prisma } from '@/lib/infrastructure/prisma';
import { requireSession } from '@/modules/auth';
import { z } from 'zod';
import { REPORT_STATUS, REPORT_CATEGORY_LABELS } from '@/lib/config/constants';
import { createReportSchema, updateReportStatusSchema, resolveReportSchema } from './schemas';
import { createBulkNotifications, createNotification } from '@/modules/notifications';
import { requireRole, requireModerationRole } from '@/modules/policy';
import { executeAuditAndRevalidate } from '@/modules/moderation/executors';
import type { ReportCategory, ReportStatus } from '@prisma/client';
import { requireThreadAccessOrThrow } from '@/modules/threads/access';
import { actionSuccess } from '@/lib/actions/result';
import { AppError } from '@/lib/utils/errors';
import type { ActionErrorCode } from '@/lib/actions/result';

const INTERNAL_ERROR = {
  data: null,
  error: 'Something went wrong',
  ok: false,
  errorCode: 'INTERNAL_ERROR',
} as const;

const INVALID_INPUT = {
  data: null,
  error: 'Invalid input',
  ok: false,
  errorCode: 'VALIDATION_ERROR',
} as const;

const SUSPENSION_DURATIONS_MS: Record<string, number> = {
  '1h': 60 * 60 * 1000,
  '6h': 6 * 60 * 60 * 1000,
  '24h': 24 * 60 * 60 * 1000,
  '3d': 3 * 24 * 60 * 60 * 1000,
  '7d': 7 * 24 * 60 * 60 * 1000,
  '30d': 30 * 24 * 60 * 60 * 1000,
};

// Fanning out to every moderator is best-effort — a notification failure must
// not roll back a report that was already written.
async function notifyModerators(opts: {
  reportId: string;
  category: string;
  messagePreview: string;
  threadName: string;
  isAutoMod?: boolean;
}) {
  try {
    const mods = await prisma.user.findMany({
      where: { role: { in: ['MODERATOR', 'ADMIN'] }, status: 'ACTIVE', deletedAt: null },
      select: { id: true },
    });

    if (mods.length === 0) return;

    const label = opts.isAutoMod ? 'Auto-mod flagged' : 'New report';
    await createBulkNotifications(
      mods.map((mod) => ({
        userId: mod.id,
        type: 'SYSTEM' as const,
        title: `${label}: ${opts.category}`,
        message: `Reported in "${opts.threadName}": ${opts.messagePreview.substring(0, 120)}`,
        data: { reportId: opts.reportId, autoMod: opts.isAutoMod ?? false },
      }))
    );
  } catch (error) {
    logger.error('[notifyModerators] failed', error);
  }
}

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
    return INVALID_INPUT;
  }

  const { messageId, category, details } = validation.data;

  try {
    const session = await requireSession();

    const existingReport = await prisma.report.findFirst({
      where: { messageId, reporterId: session.user.id },
    });

    if (existingReport) {
      return {
        data: null,
        error: 'You have already reported this message',
        ok: false,
        errorCode: 'CONFLICT',
      };
    }

    const message = await prisma.message.findUnique({
      where: { id: messageId },
      select: {
        id: true,
        content: true,
        senderId: true,
        threadId: true,
        thread: { select: { name: true, slug: true } },
      },
    });

    if (!message) {
      return { data: null, error: 'Message not found', ok: false, errorCode: 'NOT_FOUND' };
    }

    await requireThreadAccessOrThrow(message.threadId, session.user.id, session.user.role);

    if (message.senderId === session.user.id) {
      return {
        data: null,
        error: 'You cannot report your own message',
        ok: false,
        errorCode: 'FORBIDDEN',
      };
    }

    const report = await prisma.report.create({
      data: {
        messageId,
        reporterId: session.user.id,
        category: category as ReportCategory,
        details,
        status: REPORT_STATUS.PENDING,
      },
    });

    await executeAuditAndRevalidate({
      action: 'REPORT_CREATED',
      entityType: 'Report',
      entityId: report.id,
      userId: session.user.id,
      details: { messageId, category },
    });

    await notifyModerators({
      reportId: report.id,
      category,
      messagePreview: message.content ?? '',
      threadName: message.thread.name,
    });

    return actionSuccess({
      reportId: report.id,
      message: `Thank you for reporting. We'll review this within 24 hours.`,
    });
  } catch (error) {
    logger.error('[createReport]', error);
    return INTERNAL_ERROR;
  }
}

export async function getReports(filters?: { status?: string; limit?: number; offset?: number }) {
  const parsed = reportFiltersSchema.safeParse(filters ?? {});
  if (!parsed.success) {
    return INVALID_INPUT;
  }

  try {
    await requireModerationRole();

    const limit = Math.min(parsed.data.limit || 50, 100);
    const offset = parsed.data.offset || 0;

    const reports = await prisma.report.findMany({
      where: parsed.data.status ? { status: parsed.data.status as ReportStatus } : {},
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
            thread: { select: { id: true, name: true, slug: true } },
          },
        },
        reporter: { select: { id: true, name: true, email: true } },
      },
      orderBy: { createdAt: 'desc' },
      take: limit,
      skip: offset,
    });

    return actionSuccess(reports);
  } catch (error) {
    logger.error('[getReports]', error);
    return INTERNAL_ERROR;
  }
}

// Category drives severity; there is no separate priority column on Report.
const CATEGORY_SEVERITY: Record<string, 'critical' | 'high' | 'medium' | 'low'> = {
  SPAM: 'low',
  HARASSMENT: 'high',
  MISINFORMATION: 'high',
  ADULT_CONTENT: 'medium',
  OTHER: 'low',
};

export async function getReportStats() {
  try {
    await requireModerationRole();

    const today = new Date();
    today.setHours(0, 0, 0, 0);

    const [total, pending, resolvedToday, pendingByCategory, autoModCount] = await Promise.all([
      prisma.report.count(),
      prisma.report.count({ where: { status: 'PENDING' } }),
      prisma.report.count({
        where: { status: { in: ['RESOLVED', 'DISMISSED'] }, updatedAt: { gte: today } },
      }),
      prisma.report.groupBy({ by: ['category'], where: { status: 'PENDING' }, _count: true }),
      // Auto-mod reports have no human reporter attached.
      prisma.report.count({ where: { status: 'PENDING', reporterId: null } }),
    ]);

    const bySeverity = { critical: 0, high: 0, medium: 0, low: 0 };
    for (const cat of pendingByCategory) {
      bySeverity[CATEGORY_SEVERITY[cat.category] ?? 'low'] += cat._count;
    }

    return actionSuccess({
      total,
      pending,
      ...bySeverity,
      resolvedToday,
      autoModActions: autoModCount,
    });
  } catch (error) {
    logger.error('[getReportStats]', error);
    return INTERNAL_ERROR;
  }
}

export async function getReportWithContext(reportId: string) {
  const parsed = reportIdSchema.safeParse({ reportId });
  if (!parsed.success) {
    return INVALID_INPUT;
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
            thread: { select: { id: true, name: true, slug: true, messageCount: true } },
          },
        },
        reporter: { select: { id: true, name: true, email: true, createdAt: true } },
      },
    });

    if (!report) {
      return { data: null, error: 'Report not found', ok: false, errorCode: 'NOT_FOUND' };
    }

    const senderId = report.message.senderId!;

    const [surroundingMessages, violationHistory, similarReports, userBanCount, userReportCount] =
      await Promise.all([
        // ±5 minutes around the reported message, so moderators see the exchange
        // it happened in rather than the line in isolation.
        prisma.message.findMany({
          where: {
            threadId: report.message.thread.id,
            createdAt: {
              gte: new Date(report.message.createdAt.getTime() - 5 * 60 * 1000),
              lte: new Date(report.message.createdAt.getTime() + 5 * 60 * 1000),
            },
            deletedAt: null,
          },
          include: { sender: { select: { id: true, name: true } } },
          orderBy: { createdAt: 'asc' },
          take: 10,
        }),
        prisma.userBan.findMany({
          where: { userId: senderId },
          select: { id: true, reason: true, createdAt: true, isActive: true, expiresAt: true },
          orderBy: { createdAt: 'desc' },
          take: 5,
        }),
        prisma.report.findMany({
          where: { messageId: report.messageId, id: { not: parsed.data.reportId } },
          select: { id: true, category: true, status: true, createdAt: true },
        }),
        prisma.userBan.count({ where: { userId: senderId } }),
        prisma.report.count({ where: { message: { senderId }, status: 'RESOLVED' } }),
      ]);

    const accountAgeDays = Math.floor(
      (Date.now() -
        new Date(report.message.sender?.createdAt ?? report.message.createdAt).getTime()) /
        (1000 * 60 * 60 * 24)
    );

    // Rough heuristic shown as a hint, not an automated decision: age earns
    // trust slowly, prior bans and upheld reports burn it fast.
    const trustScore = Math.max(
      0,
      Math.min(100, 50 + accountAgeDays * 0.5 - userBanCount * 20 - userReportCount * 5)
    );

    return actionSuccess({
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
          senderName: m.sender?.name,
          createdAt: m.createdAt,
          isReported: m.id === report.messageId,
        })),
      },
      reportedUserProfile: {
        id: report.message.sender?.id ?? 'unknown',
        name: report.message.sender?.name ?? null,
        email: report.message.sender?.email ?? 'unknown',
        createdAt: report.message.sender?.createdAt ?? report.message.createdAt,
        status: report.message.sender?.status ?? 'ACTIVE',
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
    });
  } catch (error) {
    logger.error('[getReportWithContext]', error);
    return INTERNAL_ERROR;
  }
}

export async function updateReportStatusAction(reportId: string, status: 'RESOLVED' | 'DISMISSED') {
  const validation = updateReportStatusSchema.safeParse({ reportId, status });
  if (!validation.success) {
    return INVALID_INPUT;
  }

  try {
    const session = await requireModerationRole();

    await prisma.report.update({
      where: { id: validation.data.reportId },
      data: {
        status: validation.data.status as 'RESOLVED' | 'DISMISSED',
        // Re-opening a report (back to PENDING) clears the resolver.
        resolvedBy: status === 'RESOLVED' || status === 'DISMISSED' ? session.user.id : null,
      },
    });

    await executeAuditAndRevalidate({
      action: 'REPORT_STATUS_UPDATED',
      entityType: 'Report',
      entityId: validation.data.reportId,
      userId: session.user.id,
      details: { status: validation.data.status },
    });

    return actionSuccess(null);
  } catch (error) {
    logger.error('[updateReportStatusAction]', error);
    return INTERNAL_ERROR;
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
    return INVALID_INPUT;
  }

  const { reportId, action, note, notifyReporter, duration } = parsed.data;

  try {
    const session = await requireModerationRole();

    const report = await prisma.report.findUnique({
      where: { id: reportId },
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

    const removesMessage = action !== 'DISMISS';
    const restrictsAccount = action === 'SUSPEND_USER' || action === 'BAN_USER';
    const banExpiresAt =
      action === 'SUSPEND_USER' && duration
        ? new Date(Date.now() + (SUSPENSION_DURATIONS_MS[duration] ?? 24 * 60 * 60 * 1000))
        : null;

    await prisma.$transaction(async (tx) => {
      await tx.report.update({
        where: { id: reportId },
        data: {
          status: action === 'DISMISS' ? 'DISMISSED' : 'RESOLVED',
          resolution: note,
          resolvedBy: session.user.id,
          // firstResponseAt feeds the moderation SLA, so only stamp it once.
          ...(report.status === 'PENDING' && !report.firstResponseAt
            ? { firstResponseAt: new Date() }
            : {}),
        },
      });

      if (removesMessage) {
        await tx.message.update({
          where: { id: report.messageId },
          data: { deletedAt: new Date() },
        });
      }

      if (restrictsAccount) {
        await tx.userBan.create({
          data: {
            userId: report.message.senderId,
            bannedBy: session.user.id,
            reason: note,
            isActive: true,
            expiresAt: banExpiresAt,
          },
        });

        await tx.user.update({
          where: { id: report.message.senderId! },
          data: { status: action === 'BAN_USER' ? 'BANNED' : 'SUSPENDED' },
        });
      }
    });

    if (report.message.senderId) {
      if (action === 'WARN_USER') {
        await createNotification({
          userId: report.message.senderId,
          type: 'SYSTEM',
          title: 'Official Warning',
          message: `Your message has been removed for violating community guidelines. Reason: ${note}`,
          data: { reportId, threadSlug: report.message.thread.slug },
        });
      } else if (restrictsAccount) {
        await createNotification({
          userId: report.message.senderId,
          type: 'SYSTEM',
          title: action === 'BAN_USER' ? 'Account Banned' : 'Account Suspended',
          message:
            action === 'BAN_USER'
              ? `Your account has been permanently banned. Reason: ${note}`
              : `Your account has been suspended until ${
                  banExpiresAt?.toLocaleDateString() ?? 'indefinitely'
                }. Reason: ${note}`,
          data: { reportId, duration },
        });
      }
    }

    if (notifyReporter && report.reporterId) {
      await createNotification({
        userId: report.reporterId,
        type: 'SYSTEM',
        title: 'Report Updated',
        message:
          action === 'DISMISS'
            ? 'Your report has been reviewed. No violation was found.'
            : 'Thank you for your report. Action has been taken.',
        data: { reportId },
      });
    }

    await executeAuditAndRevalidate({
      action: 'REPORT_RESOLVED',
      entityType: 'Report',
      entityId: reportId,
      userId: session.user.id,
      details: { action, note, duration },
    });

    return actionSuccess({ message: `Report ${action === 'DISMISS' ? 'dismissed' : 'resolved'} successfully` });
  } catch (error) {
    logger.error('[resolveReport]', error);
    if (error instanceof AppError) {
      return { data: null, error: error.message, ok: false, errorCode: error.code as ActionErrorCode };
    }
    return INTERNAL_ERROR;
  }
}
