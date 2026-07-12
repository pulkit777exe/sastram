/**
 * WebSocket domain types
 */

export type WebSocketEventType =
  | 'NEW_MESSAGE'
  | 'MESSAGE_DELETED'
  | 'MESSAGE_EDITED'
  | 'MESSAGE_QUEUED'
  | 'MENTION_NOTIFICATION'
  | 'REACTION_UPDATE'
  | 'PIN_UPDATE';
