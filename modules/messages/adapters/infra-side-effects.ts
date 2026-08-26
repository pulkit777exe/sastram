import { sendMentionNotification } from '@/lib/services/email';
import { enqueueInlineJob } from '@/lib/services/queue';
import { createBulkNotifications } from '@/modules/notifications/repository';
import { recordActivity } from '@/modules/activity/repository';
import { revalidatePath } from 'next/cache';
import type { MessageSideEffectsPort } from '@/modules/messages/ports/side-effects';

export const infraMessageSideEffects: MessageSideEffectsPort = {
  async sendMentionEmail({ toEmail, mentionedByName, threadName, contentPreview, threadUrl }) {
    await sendMentionNotification(toEmail, mentionedByName, threadName, contentPreview, threadUrl);
  },
  async enqueueAiInline(args) {
    await enqueueInlineJob(args);
  },
  async createBulkNotifications(notifications) {
    await createBulkNotifications(notifications);
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
