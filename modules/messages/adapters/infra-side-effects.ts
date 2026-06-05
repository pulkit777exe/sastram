import {
  emitThreadMessage,
  emitMessageDeleted,
  emitPinUpdate,
  emitReactionUpdate,
  emitMentionNotification,
} from '@/modules/ws';
import { sendMentionNotification } from '@/lib/services/email';
import { getAiInlineQueue } from '@/lib/infrastructure/bullmq';
import type { MessageSideEffectsPort } from '@/modules/messages/ports/side-effects';

export const infraMessageSideEffects: MessageSideEffectsPort = {
  emitThreadMessage,
  emitMentionNotification,
  emitMessageDeleted,
  emitPinUpdate,
  async sendMentionEmail({ toEmail, mentionedByName, threadName, contentPreview, threadUrl }) {
    await sendMentionNotification(toEmail, mentionedByName, threadName, contentPreview, threadUrl);
  },
  async enqueueAiInline({ messageId, threadId, query, userId }) {
    await getAiInlineQueue().add('ai-inline-process', {
      messageId,
      threadId,
      query,
      userId,
    });
  },
};
