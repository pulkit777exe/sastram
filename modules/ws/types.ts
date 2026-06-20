/**
 * WebSocket domain types
 */

export type WebSocketEventType =
  | 'NEW_MESSAGE'
  | 'MESSAGE_DELETED'
  | 'MESSAGE_EDITED'
  | 'USER_TYPING'
  | 'USER_STOPPED_TYPING'
  | 'MESSAGE_QUEUED'
  | 'MENTION_NOTIFICATION'
  | 'REACTION_UPDATE'
  | 'PIN_UPDATE';

export interface TypingIndicator {
  userId: string;
  userName: string;
  threadId?: string;
  timestamp?: number;
}
