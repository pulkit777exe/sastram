import { logger } from '@/lib/infrastructure/logger';
import type { MentionNotificationPayload } from '@/modules/messages/ports/side-effects';

export interface ThreadMessagePayload {
  id: string;
  content: string;
  senderId: string;
  senderName: string | null;
  senderImage: string | null | undefined;
  createdAt: Date | string;
  threadId: string;
  parentId: string | null;
  depth: number;
  likeCount: number;
  replyCount: number;
  isAiResponse: boolean;
  isComplete?: boolean;
  truncated?: boolean;
  reactions: unknown[];
  attachments: unknown[];
}

export function emitThreadMessage(threadId: string, message: ThreadMessagePayload): void {
  logger.debug('[ws:noop] emitThreadMessage', { threadId, messageId: message.id });
}

export function emitMessageDeleted(threadId: string, messageId: string, deletedBy?: string): void {
  logger.debug('[ws:noop] emitMessageDeleted', { threadId, messageId, deletedBy });
}

export function emitMessageEdited(threadId: string, messageId: string, content: string): void {
  logger.debug('[ws:noop] emitMessageEdited', { threadId, messageId });
}

export function emitPinUpdate(
  threadId: string,
  messageIdOrPayload: string | { messageId: string; isPinned: boolean },
  isPinned?: boolean
): void {
  const messageId = typeof messageIdOrPayload === 'string' ? messageIdOrPayload : messageIdOrPayload.messageId;
  logger.debug('[ws:noop] emitPinUpdate', { threadId, messageId });
}

export function emitReactionUpdate(
  threadId: string,
  messageIdOrPayload: string | { messageId: string; reactionType: string; count: number },
  emoji?: string,
  count?: number
): void {
  const messageId = typeof messageIdOrPayload === 'string' ? messageIdOrPayload : messageIdOrPayload.messageId;
  logger.debug('[ws:noop] emitReactionUpdate', { threadId, messageId });
}

export function emitTypingIndicator(
  threadId: string,
  userId: string,
  userName: string,
  isTyping: boolean
): void {
  // no-op: typing indicators disabled without WebSocket
}

export function emitMentionNotification(
  threadId: string,
  payload: MentionNotificationPayload
): void {
  logger.debug('[ws:noop] emitMentionNotification', { threadId });
}
