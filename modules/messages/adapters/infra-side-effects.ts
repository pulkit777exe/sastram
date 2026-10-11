import { sendMentionNotification } from '@/lib/services/email';
import { enqueueInlineJob } from '@/lib/services/queue';
import { randomUUID } from 'node:crypto';
import { dispatch } from '@/modules/notifications/dispatcher';
import { recordActivity } from '@/modules/activity/repository';
import { revalidatePath } from 'next/cache';
import type { MessageSideEffectsPort } from '@/modules/messages/ports/side-effects';

export const infraMessageSideEffects: MessageSideEffectsPort = {
  async sendMentionEmail({ toEmail, mentionedByName, threadName, contentPreview, threadUrl }) {
    await sendMentionNotification(toEmail, mentionedByName, threadName, contentPreview, threadUrl);
  },
  async enqueueAiInline(args) {
    // Quota + spend were already consumed by the enqueueing caller
    // (queueAiInlineIfRequested pre-flights both) — stamp the request-scoped
    // idempotency key so the worker skips re-consumption (no double-billing).
    await enqueueInlineJob({ ...args, alreadyBilled: randomUUID() });
  },
  async createBulkNotifications(notifications) {
    // Dispatcher is best-effort; fan out per notification to preserve category/title variance
    for (const n of notifications) {
      await dispatch({
        recipients: { userIds: [n.userId] },
        category: n.type,
        title: n.title,
        message: n.message,
        data: n.data as Record<string, unknown> | null,
      });
    }
  },
  recordActivity(args) {
    return recordActivity(args);
  },
  revalidateThreadPage(slug) {
    if (slug) revalidatePath(`/dashboard/threads/${slug}`);
  },
  revalidateDashboard() {
    revalidatePath('/dashboard');
  },
};
