import { prisma } from '@/lib/infrastructure/prisma';
import { Prisma } from '@prisma/client';
import { dispatch } from '@/modules/notifications/dispatcher';
import { executeAuditAndRevalidate } from '@/modules/audit';
import { AppError } from '@/lib/utils/errors';

const REPORT_FOR_RESOLUTION_INCLUDE = {
  message: {
    include: {
      sender: { select: { id: true, name: true, email: true } },
      thread: { select: { id: true, name: true, slug: true } },
    },
  },
  reporter: { select: { id: true, name: true, email: true } },
} as const;

const H = 60 * 60 * 1000;

function getBanExpiresAt(action: string, duration?: string): Date | null {
  if (action !== 'SUSPEND_USER' || !duration) return null;
  const durationMs = SUSPENSION_DURATIONS_MS[duration] ?? 24 * H;
  return new Date(Date.now() + durationMs);
}

function getUserStatusForAction(action: string): 'BANNED' | 'SUSPENDED' {
  return action === 'BAN_USER' ? 'BANNED' : 'SUSPENDED';
}

function getRestrictionNotification(action: string, note: string, banExpiresAt: Date | null) {
  if (action === 'BAN_USER') {
    return { title: 'Account Banned', message: `Your account has been permanently banned. Reason: ${note}` };
  }
  const until = banExpiresAt?.toLocaleDateString() ?? 'indefinitely';
  return { title: 'Account Suspended', message: `Your account has been suspended until ${until}. Reason: ${note}` };
}

function getReporterMessage(action: string): string {
  if (action === 'DISMISS') return 'Your report has been reviewed. No violation was found.';
  return 'Thank you for your report. Action has been taken.';
}

function getResultMessage(action: string): string {
  return action === 'DISMISS' ? 'Report dismissed successfully' : 'Report resolved successfully';
}

async function fetchReportForResolution(reportId: string) {
  const report = await prisma.report.findUnique({
    where: { id: reportId },
    include: REPORT_FOR_RESOLUTION_INCLUDE,
  });
  if (!report) throw new AppError('Report not found', 'NOT_FOUND', 404);
  return report;
}

async function applyReportResolutionTransaction(
  reportId: string,
  reportMessageId: string,
  senderId: string | null,
  resolverId: string,
  note: string,
  action: string,
  resolvedStatus: string,
  isFirstResponse: boolean,
  banExpiresAt: Date | null,
  removesMessage: boolean,
  restrictsAccount: boolean
) {
  await prisma.$transaction(async (tx) => {
    const reportUpdateData: Prisma.ReportUpdateInput = {
      status: resolvedStatus as Prisma.ReportUpdateInput['status'],
      resolution: note,
      resolvedBy: resolverId,
    };
    if (isFirstResponse) {
      reportUpdateData.firstResponseAt = new Date();
    }
    await tx.report.update({ where: { id: reportId }, data: reportUpdateData });
    if (removesMessage) {
      await tx.message.update({ where: { id: reportMessageId }, data: { deletedAt: new Date() } });
    }
    if (restrictsAccount && senderId) {
      await tx.userBan.create({
        data: { userId: senderId, bannedBy: resolverId, reason: note, isActive: true, expiresAt: banExpiresAt },
      });
      await tx.user.update({ where: { id: senderId }, data: { status: getUserStatusForAction(action) } });
    }
  });
}

async function dispatchResolutionNotifications(
  report: Awaited<ReturnType<typeof fetchReportForResolution>>,
  action: string,
  note: string,
  banExpiresAt: Date | null,
  duration: string | undefined,
  notifyReporter: boolean
) {
  if (report.message.senderId) {
    if (action === 'WARN_USER') {
      await dispatch({
        recipients: { userIds: [report.message.senderId] },
        category: 'SYSTEM',
        title: 'Official Warning',
        message: `Your message has been removed for violating community guidelines. Reason: ${note}`,
        data: { reportId: report.id, threadSlug: report.message.thread.slug },
      });
    } else if (action === 'SUSPEND_USER' || action === 'BAN_USER') {
      const { title, message } = getRestrictionNotification(action, note, banExpiresAt);
      await dispatch({
        recipients: { userIds: [report.message.senderId] },
        category: 'SYSTEM',
        title,
        message,
        data: { reportId: report.id, duration },
      });
    }
  }
  if (notifyReporter && report.reporterId) {
    await dispatch({
      recipients: { userIds: [report.reporterId] },
      category: 'SYSTEM',
      title: 'Report Updated',
      message: getReporterMessage(action),
      data: { reportId: report.id },
    });
  }
}

const SUSPENSION_DURATIONS_MS: Record<string, number> = {
  '1h': H,
  '6h': 6 * H,
  '24h': 24 * H,
  '3d': 3 * 24 * H,
  '7d': 7 * 24 * H,
  '30d': 30 * 24 * H,
};

export async function resolveReport(params: {
  reportId: string;
  action: 'DISMISS' | 'REMOVE_MESSAGE' | 'WARN_USER' | 'SUSPEND_USER' | 'BAN_USER';
  note: string;
  notifyReporter: boolean;
  duration?: string;
  resolverId: string;
}): Promise<{ message: string }> {
  const { reportId, action, note, notifyReporter, duration, resolverId } = params;

  const report = await fetchReportForResolution(reportId);

  const removesMessage = action !== 'DISMISS';
  const restrictsAccount = action === 'SUSPEND_USER' || action === 'BAN_USER';
  const banExpiresAt = getBanExpiresAt(action, duration);
  const isFirstResponse = report.status === 'PENDING' && report.firstResponseAt === null;
  const resolvedStatus = action === 'DISMISS' ? 'DISMISSED' : 'RESOLVED';

  await applyReportResolutionTransaction(
    reportId,
    report.messageId,
    report.message.senderId,
    resolverId,
    note,
    action,
    resolvedStatus,
    isFirstResponse,
    banExpiresAt,
    removesMessage,
    restrictsAccount
  );

  await dispatchResolutionNotifications(report, action, note, banExpiresAt, duration, notifyReporter);

  await executeAuditAndRevalidate({
    action: 'REPORT_RESOLVED',
    entityType: 'Report',
    entityId: reportId,
    userId: resolverId,
    details: { action, note, duration },
  });

  return { message: getResultMessage(action) };
}
