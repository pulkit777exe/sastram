/**
 * Message domain types — single source of truth for Message, Sender, Attachment.
 */

import type { User as PrismaUser, Reaction as PrismaReaction, UserStatus } from '@prisma/client';
import type { ReactionSummary } from '@/modules/reactions/types';

// ---------------------------------------------------------------------------
// Shared primitives
// ---------------------------------------------------------------------------

export type Sender = Pick<PrismaUser, 'id' | 'name' | 'image'>;

export interface Attachment {
  id: string;
  name: string | null;
  url: string;
  type: string;
  size: number | null;
  messageId?: string;
}

export type Reaction = PrismaReaction;

// ---------------------------------------------------------------------------
// Message
// ---------------------------------------------------------------------------

export interface Message {
  id: string;
  content: string;
  threadId: string;
  senderId: string;
  parentId: string | null;
  depth: number;
  isEdited: boolean;
  isPinned: boolean;
  likeCount: number;
  replyCount: number;
  isAiResponse: boolean;
  createdAt: Date;
  updatedAt: Date;
  deletedAt: Date | null;

  sender: Sender;
  thread: {
    id: string;
    name: string;
    slug: string;
  };
  attachments: Attachment[];
  reactions?: Reaction[];
  readReceipts?: ReadReceipt[];
  replies?: Message[];
}

// ---------------------------------------------------------------------------
// ReadReceipt (kept here because Message references it directly)
// ---------------------------------------------------------------------------

export interface ReadReceipt {
  id: string;
  threadId: string;
  userId: string;
  lastReadMessageId: string;
  readAt: Date;
  createdAt: Date;
  updatedAt: Date;
}

// ---------------------------------------------------------------------------
// MessageWithDetails — extends Message with richer sender for detail views
// ---------------------------------------------------------------------------

export interface AttachmentInfo {
  id: string;
  url: string;
  type: string;
  name: string | null;
  mimeType: string | null;
  size: number | null;
}

export interface MessageWithDetails {
  id: string;
  content: string;
  threadId: string;
  senderId: string;
  parentId: string | null;
  depth: number;
  isEdited: boolean;
  isPinned: boolean;
  likeCount: number;
  replyCount: number;
  isAiResponse: boolean;
  createdAt: Date;
  updatedAt: Date;
  deletedAt: Date | null;
  sender: {
    id: string;
    name: string | null;
    image: string | null;
    status: UserStatus;
  };
  reactions?: ReactionSummary[];
  attachments?: AttachmentInfo[];
  replies?: MessageWithDetails[];
}

/**
 * A message node in the nested reply tree.
 */
export interface MessageNode {
  id: string;
  content: string;
  createdAt: Date;
  updatedAt: Date;
  senderId: string;
  threadId: string;
  parentId: string | null;
  depth: number;
  isEdited: boolean;
  isPinned: boolean;
  likeCount: number;
  replyCount: number;
  isAiResponse: boolean;
  deletedAt: Date | null;
  sender: {
    id: string;
    name: string | null;
    image: string | null;
    status?: UserStatus;
  };
  children: MessageNode[];
  isCollapsed: boolean;
  reactions?: unknown[];
  attachments?: unknown[];
  replies?: MessageNode[];
}

export interface PostMessageResult {
  id: string;
  content: string;
  senderId: string;
  senderName: string;
  senderImage: string | null;
  createdAt: Date;
  threadId: string;
}
