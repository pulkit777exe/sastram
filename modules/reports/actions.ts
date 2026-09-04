'use server';

import { logger } from '@/lib/infrastructure/logger';
import { prisma } from '@/lib/infrastructure/prisma';
import { requireSession } from '@/modules/auth';
import { z } from 'zod';
import { REPORT_STATUS, REPORT_CATEGORY_LABELS } from '@/lib/config/constants';
import { createReportSchema, updateReportStatusSchema, resolveReportSchema } from './schemas';
import { dispatch } from '@/modules/notifications/dispatcher';
import { requireRole, requireModerationRole } from '@/modules/policy';
import { executeAuditAndRevalidate } from '@/modules/audit';
import type { ReportCategory, ReportStatus, Role } from '@prisma/client';
import { requireThreadAccessOrThrow } from '@/lib/thread-access';
import { actionSuccess } from '@/lib/actions/result';
import { AppError } from '@/lib/utils/errors';
import type { ActionErrorCode } from '@/lib/actions/result';
import { resolveReport as resolveReportService } from './service';

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

// ── Shared select constants ────────────────────────────────────────────────
const REPORT_SENDER_SELECT = {
  id: true,
  name: true,
  email: true,
  image: true,
  status: true,
  createdAt: true,
} as const;

const REPORT_THREAD_SELECT = {
  id: true,
  name: true,
  slug: true,
} as const;

const REPORT_CONTEXT_THREAD_SELECT = {
  id: true,
  name: true,
  slug: true,
  messageCount: true,
} as const;

const REPORT_REPORTER_SELECT = {
  id: true,
  name: true,
  email: true,
} as const;

const REPORT_REPORTER_WITH_DATE_SELECT = {
  id: true,
  name: true,
  email: true,
  createdAt: true,
} as const;

const MESSAGE_FOR_REPORT_SELECT = {
  id: true,
  content: true,
  senderId: true,
  threadId: true,
  thread: { select: { name: true, slug: true } },
} as const;

// ── Error helpers ──────────────────────────────────────────────────────────
function toActionErrorCode(code: string | undefined): ActionErrorCode {
  switch (code) {
    case 'AUTH_REQUIRED':
    case 'FORBIDDEN':
    case 'VALIDATION_ERROR':
    case 'NOT_FOUND':
    case 'RATE_LIMITED':
    case 'CONFLICT':
    case 'INTERNAL_ERROR':
      return code;
    default:
      return 'INTERNAL_ERROR';
  }
}

function isValidReportStatus(value: string): value is ReportStatus {
  return value === REPORT_STATUS.PENDING || value === REPORT_STATUS.RESOLVED || value === REPORT_STATUS.DISMISSED;
}

function buildReportWhereClause(status?: string): { status?: ReportStatus } {
  if (status && isValidReportStatus(status)) {
    return { status };
  }
  return {};
}

// ── Notification helpers ───────────────────────────────────────────────────
function getModeratorNotificationLabel(isAutoMod?: boolean): string {
  if (isAutoMod) {
    return 'Auto-mod flagged';
  }
  return 'New report';
}

async function notifyModerators(opts: {
  reportId: string;
  category: string;
  messagePreview: string;
  threadName: string;
  isAutoMod?: boolean;
}) {
  const label = getModeratorNotificationLabel(opts.isAutoMod);
  const autoModFlag = opts.isAutoMod === true;
  await dispatch({
    recipients: { roles: ['MODERATOR', 'ADMIN'] },
    category: 'SYSTEM',
    title: `${label}: ${opts.category}`,
    message: `Reported in "${opts.threadName}": ${opts.messagePreview.substring(0, 120)}`,
    data: { reportId: opts.reportId, autoMod: autoModFlag },
  });
}

const reportFiltersSchema = z.object({
  status: z.string().optional(),
  limit: z.number().int().positive().max(100).optional(),
  offset: z.number().int().nonnegative().optional(),
});

const reportIdSchema = z.object({
  reportId: z.string().cuid(),
});

// ── createReport helpers ───────────────────────────────────────────────────
async function findDuplicateReport(messageId: string, reporterId: string) {
  return prisma.report.findFirst({ where: { messageId, reporterId } });
}

async function fetchMessageForReport(messageId: string) {
  return prisma.message.findUnique({ where: { id: messageId }, select: MESSAGE_FOR_REPORT_SELECT });
}

function isOwnMessage(senderId: string | null, reporterId: string): boolean {
  return senderId === reporterId;
}

function toReportCategory(value: string): ReportCategory {
  switch (value) {
    case 'SPAM':
    case 'HARASSMENT':
    case 'MISINFORMATION':
    case 'ADULT_CONTENT':
    case 'OTHER':
      return value;
    default:
      return 'OTHER';
  }
}

async function persistReportRecord(params: {
  messageId: string;
  reporterId: string;
  category: ReportCategory;
  details?: string;
}) {
  return prisma.report.create({
    data: {
      messageId: params.messageId,
      reporterId: params.reporterId,
      category: params.category,
      details: params.details,
      status: REPORT_STATUS.PENDING,
    },
  });
}

async function validateAndFetchReportContext(messageId: string, reporterId: string, reporterRole: string) {
  const existing = await findDuplicateReport(messageId, reporterId);
  if (existing !== null) {
    return { error: { data: null, error: 'You have already reported this message', ok: false, errorCode: 'CONFLICT' } as const };
  }
  const message = await fetchMessageForReport(messageId);
  if (message === null) {
    return { error: { data: null, error: 'Message not found', ok: false, errorCode: 'NOT_FOUND' } as const };
  }
  await requireThreadAccessOrThrow(message.threadId, reporterId, reporterRole as Role);
  if (isOwnMessage(message.senderId, reporterId)) {
    return { error: { data: null, error: 'You cannot report your own message', ok: false, errorCode: 'FORBIDDEN' } as const };
  }
  return { message };
}

export async function createReport(data: { messageId: string; category: string; details?: string }) {
  const validation = createReportSchema.safeParse(data);
  if (!validation.success) {
    return INVALID_INPUT;
  }

  const { messageId, category, details } = validation.data;

  try {
    const session = await requireSession();
    const fetched = await validateAndFetchReportContext(messageId, session.user.id, session.user.role);
    if ('error' in fetched) return fetched.error;

    const report = await persistReportRecord({
      messageId,
      reporterId: session.user.id,
      category: toReportCategory(category),
      details,
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
      messagePreview: fetched.message.content ?? '',
      threadName: fetched.message.thread.name,
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

// ── getReports helpers ─────────────────────────────────────────────────────
async function fetchReports(where: { status?: ReportStatus }, limit: number, offset: number) {
  return prisma.report.findMany({
    where,
    include: {
      message: {
        include: {
          sender: { select: REPORT_SENDER_SELECT },
          thread: { select: REPORT_THREAD_SELECT },
        },
      },
      reporter: { select: REPORT_REPORTER_SELECT },
    },
    orderBy: { createdAt: 'desc' },
    take: limit,
    skip: offset,
  });
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

    const reports = await fetchReports(buildReportWhereClause(parsed.data.status), limit, offset);

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
      prisma.report.count({ where: { status: 'PENDING', reporterId: null } }),
    ]);

    const bySeverity = buildSeverityBreakdown(pendingByCategory);

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

function buildSeverityBreakdown(
  pendingByCategory: Array<{ category: string; _count: number }>
): Record<'critical' | 'high' | 'medium' | 'low', number> {
  const bySeverity = { critical: 0, high: 0, medium: 0, low: 0 };
  for (const cat of pendingByCategory) {
    const severity = CATEGORY_SEVERITY[cat.category] ?? 'low';
    bySeverity[severity] += cat._count;
  }
  return bySeverity;
}

// ── getReportWithContext helpers ───────────────────────────────────────────
async function fetchReportWithRelations(reportId: string) {
  return prisma.report.findUnique({
    where: { id: reportId },
    include: {
      message: {
        include: {
          sender: { select: REPORT_SENDER_SELECT },
          thread: { select: REPORT_CONTEXT_THREAD_SELECT },
        },
      },
      reporter: { select: REPORT_REPORTER_WITH_DATE_SELECT },
    },
  });
}

async function fetchReportContext(report: NonNullable<Awaited<ReturnType<typeof fetchReportWithRelations>>>, reportId: string) {
  const senderId = report.message.senderId!;
  return Promise.all([
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
      where: { messageId: report.messageId, id: { not: reportId } },
      select: { id: true, category: true, status: true, createdAt: true },
    }),
    prisma.userBan.count({ where: { userId: senderId } }),
    prisma.report.count({ where: { message: { senderId }, status: 'RESOLVED' } }),
  ]);
}

function calculateTrustScore(accountAgeDays: number, banCount: number, reportCount: number): number {
  const raw = 50 + accountAgeDays * 0.5 - banCount * 20 - reportCount * 5;
  return Math.max(0, Math.min(100, raw));
}

function mapSurroundingMessages(
  messages: Awaited<ReturnType<typeof fetchReportContext>>[0],
  reportedMessageId: string
) {
  return messages.map((m) => ({
    id: m.id,
    content: m.content,
    senderId: m.senderId,
    senderName: m.sender?.name,
    createdAt: m.createdAt,
    isReported: m.id === reportedMessageId,
  }));
}

function mapViolationHistory(history: Awaited<ReturnType<typeof fetchReportContext>>[1]) {
  return history.map((v) => ({
    id: v.id,
    action: getViolationActionLabel(v.isActive),
    reason: v.reason,
    createdAt: v.createdAt,
  }));
}

function getViolationActionLabel(isActive: boolean): string {
  return isActive ? 'Active Ban' : 'Past Ban';
}

export async function getReportWithContext(reportId: string) {
  const parsed = reportIdSchema.safeParse({ reportId });
  if (!parsed.success) {
    return INVALID_INPUT;
  }

  try {
    await requireRole(['ADMIN']);

    const report = await fetchReportWithRelations(parsed.data.reportId);

    if (report === null) {
      return { data: null, error: 'Report not found', ok: false, errorCode: 'NOT_FOUND' };
    }

    const [surroundingMessages, violationHistory, similarReports, userBanCount, userReportCount] =
      await fetchReportContext(report, parsed.data.reportId);

    const senderCreatedAt = report.message.sender?.createdAt ?? report.message.createdAt;
    const accountAgeDays = Math.floor((Date.now() - new Date(senderCreatedAt).getTime()) / (1000 * 60 * 60 * 24));
    const trustScore = calculateTrustScore(accountAgeDays, userBanCount, userReportCount);
    const categoryLabel = REPORT_CATEGORY_LABELS[report.category as keyof typeof REPORT_CATEGORY_LABELS];

    return actionSuccess({
      ...report,
      categoryLabel,
      threadContext: {
        threadTitle: report.message.thread.name,
        threadSlug: report.message.thread.slug,
        messageCount: report.message.thread.messageCount,
        surroundingMessages: mapSurroundingMessages(surroundingMessages, report.messageId),
      },
      reportedUserProfile: {
        id: report.message.sender?.id ?? 'unknown',
        email: report.message.sender?.email ?? 'unknown',
        name: report.message.sender?.name ?? null,
        createdAt: report.message.sender?.createdAt ?? report.message.createdAt,
        status: report.message.sender?.status ?? 'ACTIVE',
        trustScore: Math.round(trustScore),
        violationHistory: mapViolationHistory(violationHistory),
      },
      similarReports,
      reportCount: similarReports.length + 1,
    });
  } catch (error) {
    logger.error('[getReportWithContext]', error);
    return INTERNAL_ERROR;
  }
}

function getResolvedBy(status: string, userId: string): string | null {
  const isResolving = status === 'RESOLVED' || status === 'DISMISSED';
  return isResolving ? userId : null;
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
        status: validation.data.status,
        resolvedBy: getResolvedBy(validation.data.status, session.user.id),
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

  try {
    const session = await requireModerationRole();

    const result = await resolveReportService({
      ...parsed.data,
      resolverId: session.user.id,
    });

    return actionSuccess({ message: result.message });
  } catch (error) {
    logger.error('[resolveReport]', error);
    if (AppError.isAppError(error)) {
      const errorCode = toActionErrorCode(error.code);
      return { data: null, error: error.message, ok: false, errorCode };
    }
    return INTERNAL_ERROR;
  }
}
