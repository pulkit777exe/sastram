/**
 * Message domain types
 */

import type { UserStatus } from '@prisma/client';
import type { ReactionSummary } from '@/modules/reactions/types';

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
 * Extends the flat Message type with children and collapse state.
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
