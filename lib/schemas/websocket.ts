import { z } from "zod";

/**
 * Base payload schema - all WebSocket messages must have a sectionId
 */
const basePayloadSchema = z.object({
  sectionId: z.string().cuid("Invalid section ID"),
});

/**
 * NEW_MESSAGE event payload
 */
const newMessagePayloadSchema = basePayloadSchema.extend({
  id: z.string().cuid(),
  content: z.string().min(1).max(1000),
  senderId: z.string().cuid(),
  senderName: z.string(),
  senderAvatar: z.string().url().nullable().optional(),
  createdAt: z.coerce.date(),
  parentId: z.string().cuid().optional(),
  mentions: z.array(z.string().cuid()).optional(),
  attachments: z
    .array(
      z.object({
        id: z.string().cuid(),
        url: z.string().url(),
        type: z.enum(["IMAGE", "GIF", "FILE", "VIDEO"]),
        name: z.string().nullable(),
        size: z.number().int().positive().nullable(),
      })
    )
    .optional(),
});

/**
 * MESSAGE_DELETED event payload
 */
const messageDeletedPayloadSchema = basePayloadSchema.extend({
  messageId: z.string().cuid(),
  deletedBy: z.string().cuid(),
});

/**
 * USER_TYPING event payload
 */
const userTypingPayloadSchema = basePayloadSchema.extend({
  userId: z.string().cuid(),
  userName: z.string(),
});

/**
 * USER_STOPPED_TYPING event payload
 */
const userStoppedTypingPayloadSchema = basePayloadSchema.extend({
  userId: z.string().cuid(),
});

/**
 * MESSAGE_QUEUED event payload
 */
const messageQueuedPayloadSchema = basePayloadSchema.extend({
  messageId: z.string().cuid(),
  queuedFor: z.string().cuid(),
});

/**
 * MENTION_NOTIFICATION event payload
 */
const mentionNotificationPayloadSchema = basePayloadSchema.extend({
  messageId: z.string().cuid(),
  mentionedUserId: z.string().cuid(),
  mentionedBy: z.string().cuid(),
  mentionedByName: z.string(),
  content: z.string(),
  parentId: z.string().cuid().optional(),
});

/**
 * ERROR event payload (sent by server)
 */
const errorPayloadSchema = z.object({
  error: z.string(),
  details: z.string().optional(),
});

/**
 * Discriminated union of all WebSocket message types
 */
export const websocketMessageSchema = z.discriminatedUnion("type", [
  z.object({
    type: z.literal("NEW_MESSAGE"),
    payload: newMessagePayloadSchema,
  }),
  z.object({
    type: z.literal("MESSAGE_DELETED"),
    payload: messageDeletedPayloadSchema,
  }),
  z.object({
    type: z.literal("USER_TYPING"),
    payload: userTypingPayloadSchema,
  }),
  z.object({
    type: z.literal("USER_STOPPED_TYPING"),
    payload: userStoppedTypingPayloadSchema,
  }),
  z.object({
    type: z.literal("MESSAGE_QUEUED"),
    payload: messageQueuedPayloadSchema,
  }),
  z.object({
    type: z.literal("MENTION_NOTIFICATION"),
    payload: mentionNotificationPayloadSchema,
  }),
  z.object({
    type: z.literal("ERROR"),
    payload: errorPayloadSchema,
  }),
]);

/**
 * Type-safe WebSocket message type
 */
export type WebSocketMessage = z.infer<typeof websocketMessageSchema>;

/**
 * Individual event type schemas for specific validation
 */
export const websocketSchemas = {
  newMessage: z.object({
    type: z.literal("NEW_MESSAGE"),
    payload: newMessagePayloadSchema,
  }),
  messageDeleted: z.object({
    type: z.literal("MESSAGE_DELETED"),
    payload: messageDeletedPayloadSchema,
  }),
  userTyping: z.object({
    type: z.literal("USER_TYPING"),
    payload: userTypingPayloadSchema,
  }),
  userStoppedTyping: z.object({
    type: z.literal("USER_STOPPED_TYPING"),
    payload: userStoppedTypingPayloadSchema,
  }),
  messageQueued: z.object({
    type: z.literal("MESSAGE_QUEUED"),
    payload: messageQueuedPayloadSchema,
  }),
  mentionNotification: z.object({
    type: z.literal("MENTION_NOTIFICATION"),
    payload: mentionNotificationPayloadSchema,
  }),
  error: z.object({ type: z.literal("ERROR"), payload: errorPayloadSchema }),
} as const;

/**
 * Validate incoming WebSocket message
 */
export function validateWebSocketMessage(data: unknown) {
  return websocketMessageSchema.safeParse(data);
}
