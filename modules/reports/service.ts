import { logger } from '@/lib/infrastructure/logger';
import { prisma } from '@/lib/infrastructure/prisma';
import { createNotification } from '@/modules/notifications';
import { executeAuditAndRevalidate } from '@/modules/moderation/executors';
import { AppError } from '@/lib/utils/errors';

const SUSPENSION_DURATIONS_MS: Record<string, number> = {
  '1h': 60 * 60 * 1000,
  '6h': 6 * 60 * 60 * 1000,
  '24h': 24 * 60 * 60 * 1000,
  '3d': 3 * 24 * 60 * 60 * 1000,
  '7d': 7 * 24 * 60 * 60 * 1000,
  '30d': 30 * 24 * 60 * 60 * 1000,
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
    throw new AppError('NOT_FOUND', 'Report not found');
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
        resolvedBy: resolverId,
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
          bannedBy: resolverId,
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
    userId: resolverId,
    details: { action, note, duration },
  });

  return { message: `Report ${action === 'DISMISS' ? 'dismissed' : 'resolved'} successfully` };
}
