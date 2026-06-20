/**
 * Re-export barrel for types used across multiple modules.
 *
 * Canonical definitions live in their owning module:
 *   - Message, Sender, Attachment, Reaction, ReadReceipt → modules/messages/types
 *   - Conversation → modules/chat/types
 *   - TypingIndicator, WebSocketEventType → modules/ws/types
 *
 * Import from the owning module directly when possible.
 * This barrel exists so cross-cutting code (hooks, components, tests)
 * can import shared types from a single stable path.
 */

export type {
  Sender,
  Attachment,
  Message,
  Reaction,
  ReadReceipt,
} from '@/modules/messages/types';

export type { Conversation } from '@/modules/chat/types';

export type { TypingIndicator, WebSocketEventType } from '@/modules/ws/types';
