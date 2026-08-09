import { sendMentionNotification } from '@/lib/services/email';
import { enqueueInlineJob } from '@/lib/services/queue';
import type { MessageSideEffectsPort } from '@/modules/messages/ports/side-effects';

export const infraMessageSideEffects: MessageSideEffectsPort = {
  async sendMentionEmail({ toEmail, mentionedByName, threadName, contentPreview, threadUrl }) {
    await sendMentionNotification(toEmail, mentionedByName, threadName, contentPreview, threadUrl);
  },
  async enqueueAiInline(args) {
    await enqueueInlineJob(args);
  },
};
