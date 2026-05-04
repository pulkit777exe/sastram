import { publishThreadEvent } from '@/lib/infrastructure/redis-pubsub';
import { logger } from '@/lib/infrastructure/logger';
import { websocketSchemas } from '@/lib/schemas/websocket';

export interface ThreadMessagePayload {
  id: string;
  content: string;
  senderId: string;
  senderName: string | null;
  senderAvatar: string | null | undefined;
  createdAt: Date | string;
  sectionId: string;
  parentId: string | null;
  depth: number;
  likeCount: number;
  replyCount: number;
  isAiResponse: boolean;
  isComplete?: boolean;
  reactions: unknown[];
  attachments: unknown[];
}

interface MentionNotificationPayload {
  messageId: string;
  mentionedUserId: string;
  mentionedBy: string;
  mentionedByName: string;
  sectionId: string;
  content: string;
  parentId?: string;
}

interface ReactionUpdatePayload {
  messageId: string;
  reactionType: string;
  count: number;
}

interface PinUpdatePayload {
  messageId: string;
  isPinned: boolean;
}

function validateAndLog(
  event:
    | 'NEW_MESSAGE'
    | 'MESSAGE_DELETED'
    | 'MENTION_NOTIFICATION'
    | 'REACTION_UPDATE'
    | 'PIN_UPDATE',
  payload: unknown
): boolean {
  const parser =
    event === 'NEW_MESSAGE'
      ? websocketSchemas.newMessage
      : event === 'MESSAGE_DELETED'
        ? websocketSchemas.messageDeleted
        : event === 'MENTION_NOTIFICATION'
          ? websocketSchemas.mentionNotification
          : event === 'REACTION_UPDATE'
            ? websocketSchemas.reactionUpdate
            : websocketSchemas.pinUpdate;

  const result = parser.safeParse({ type: event, payload });
  if (result.success) return true;

  logger.error(`[${event}] payload validation failed`, {
    issues: result.error.issues,
  });
  return false;
}

export function emitThreadMessage(sectionId: string, message: ThreadMessagePayload): void {
  // Fire-and-forget — streaming callbacks can't await
  const payload = {
    ...message,
    // Serialize Date to ISO string for safe JSON transport
    createdAt:
      message.createdAt instanceof Date ? message.createdAt.toISOString() : message.createdAt,
    senderAvatar: message.senderAvatar ?? null,
    parentId: message.parentId ?? undefined,
    depth: message.depth ?? 0,
    likeCount: message.likeCount ?? 0,
    replyCount: message.replyCount ?? 0,
    isAiResponse: message.isAiResponse ?? false,
    reactions: message.reactions ?? [],
    attachments: message.attachments ?? [],
    isComplete: message.isComplete ?? false,
  };

  if (!validateAndLog('NEW_MESSAGE', payload)) return;

  void publishThreadEvent(sectionId, {
    type: 'NEW_MESSAGE',
    sectionId,
    payload,
  }).catch((err) => {
    logger.error('[emitThreadMessage] Redis publish failed', {
      error: err instanceof Error ? err.message : String(err),
      sectionId,
      messageId: message.id,
    });
  });
}

export function emitMessageDeleted(sectionId: string, messageId: string, deletedBy?: string): void {
  const payload = { messageId, ...(deletedBy ? { deletedBy } : {}) };
  if (!validateAndLog('MESSAGE_DELETED', payload)) return;

  void publishThreadEvent(sectionId, {
    type: 'MESSAGE_DELETED',
    sectionId,
    payload,
  }).catch((err) => {
    logger.error('[emitMessageDeleted] Redis publish failed', {
      error: err instanceof Error ? err.message : String(err),
    });
  });
}

export function emitPinUpdate(
  sectionId: string,
  messageIdOrPayload: string | PinUpdatePayload,
  isPinned?: boolean
): void {
  const payload =
    typeof messageIdOrPayload === 'string'
      ? { messageId: messageIdOrPayload, isPinned: Boolean(isPinned) }
      : messageIdOrPayload;

  if (!validateAndLog('PIN_UPDATE', payload)) return;

  void publishThreadEvent(sectionId, {
    type: 'PIN_UPDATE',
    sectionId,
    payload: { ...payload },
  }).catch((err) => {
    logger.error('[emitPinUpdate] Redis publish failed', {
      error: err instanceof Error ? err.message : String(err),
    });
  });
}

export function emitReactionUpdate(
  sectionId: string,
  messageIdOrPayload: string | ReactionUpdatePayload,
  emoji?: string,
  count?: number
): void {
  const payload =
    typeof messageIdOrPayload === 'string'
      ? {
          messageId: messageIdOrPayload,
          reactionType: emoji ?? '',
          count: count ?? 0,
        }
      : messageIdOrPayload;

  if (!validateAndLog('REACTION_UPDATE', payload)) return;

  void publishThreadEvent(sectionId, {
    type: 'REACTION_UPDATE' as never,
    sectionId,
    payload: { ...payload },
  }).catch((err) => {
    logger.error('[emitReactionUpdate] Redis publish failed', {
      error: err instanceof Error ? err.message : String(err),
    });
  });
}

export function emitTypingIndicator(
  sectionId: string,
  userId: string,
  userName: string,
  isTyping: boolean
): void {
  void publishThreadEvent(sectionId, {
    type: isTyping ? ('USER_TYPING' as never) : ('USER_STOPPED_TYPING' as never),
    sectionId,
    payload: { userId, userName, sectionId },
  }).catch((err) => {
    logger.error('[emitTypingIndicator] Redis publish failed', {
      error: err instanceof Error ? err.message : String(err),
    });
  });
}

export function emitMentionNotification(
  sectionId: string,
  payload: MentionNotificationPayload
): void {
  const normalizedPayload = {
    ...payload,
    parentId: payload.parentId ?? undefined,
  };

  if (!validateAndLog('MENTION_NOTIFICATION', normalizedPayload)) return;

  void publishThreadEvent(sectionId, {
    type: 'MENTION_NOTIFICATION' as never,
    sectionId,
    payload: normalizedPayload,
  }).catch((err) => {
    logger.error('[emitMentionNotification] Redis publish failed', {
      error: err instanceof Error ? err.message : String(err),
    });
  });
}
