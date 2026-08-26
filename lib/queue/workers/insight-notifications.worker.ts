import { logger } from '@/lib/infrastructure/logger';
import { NotificationType } from '@prisma/client';
import { notifyMultipleUsers } from '@/modules/notifications';
import type { AIInsightNotificationJobData, AIConflictResult } from '../types';

async function sendAIInsightNotifications(
  subscriberIds: string[],
  threadId: string,
  threadName: string,
  oldScore?: number,
  newScore?: number,
  isOutdated?: boolean,
  conflictResult?: AIConflictResult,
) {
  logger.info(`Sending AI insight notifications for thread: ${threadId}`);

  const notifications: Array<{ title: string; message: string; data: Record<string, unknown> }> = [];

  // Only a meaningful swing is worth interrupting subscribers over.
  if (oldScore != null && newScore != null && Math.abs(newScore - oldScore) >= 20) {
    notifications.push({
      title: `Resolution score updated for "${threadName}"`,
      message: `The resolution score for this thread has changed from ${oldScore} to ${newScore}.`,
      data: { threadId, threadName, oldScore, newScore, type: 'resolution_score_change' },
    });
  }

  if (isOutdated) {
    notifications.push({
      title: `Thread "${threadName}" may be outdated`,
      message: "This thread hasn't been updated in over a week and may contain outdated information.",
      data: { threadId, threadName, type: 'thread_outdated' },
    });
  }

  if (conflictResult?.hasConflict) {
    notifications.push({
      title: `Conflict detected in "${threadName}"`,
      message: conflictResult.reason || 'A conflict has been detected in this thread.',
      data: {
        threadId,
        threadName,
        conflictingMessages: conflictResult.conflictingMessages,
        type: 'conflict_detected',
      },
    });
  }

  for (const { title, message, data } of notifications) {
    await notifyMultipleUsers(subscriberIds, NotificationType.AI_INSIGHT, title, message, data);
  }

  return { notificationsSent: notifications.length };
}

export async function handleAIInsightNotificationsJob(data: AIInsightNotificationJobData) {
  logger.info('[worker:ai] ai-insight-notifications job');
  const { subscriberIds, threadId, threadName, oldScore, newScore, isOutdated, conflictResult } =
    data;
  if (!subscriberIds || !threadId || !threadName) {
    throw new Error('Missing required fields: subscriberIds, threadId, and threadName');
  }
  return sendAIInsightNotifications(
    subscriberIds,
    threadId,
    threadName,
    oldScore,
    newScore,
    isOutdated,
    conflictResult,
  );
}
