import {
  emitThreadMessage,
  emitMessageDeleted,
  emitMessageEdited,
  emitPinUpdate,
  emitReactionUpdate,
  emitMentionNotification,
} from '@/modules/ws';
import { sendMentionNotification } from '@/lib/services/email';
import { enqueueInlineJob } from '@/lib/services/queue';
import type { MessageSideEffectsPort } from '@/modules/messages/ports/side-effects';

export const infraMessageSideEffects: MessageSideEffectsPort = {
  emitThreadMessage,
  emitMentionNotification,
  emitMessageDeleted,
  emitMessageEdited,
  emitPinUpdate,
  async sendMentionEmail({ toEmail, mentionedByName, threadName, contentPreview, threadUrl }) {
    await sendMentionNotification(toEmail, mentionedByName, threadName, contentPreview, threadUrl);
  },
  async enqueueAiInline({ messageId, threadId, query, userId }) {
    await enqueueInlineJob({ messageId, threadId, query, userId });
  },
};
