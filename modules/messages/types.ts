import type { UserStatus } from '@prisma/client';
import type { ReactionSummary } from '@/modules/reactions/types';
import type { Message } from '@/lib/types/index';

/**
 * Message domain types
 */

export interface AttachmentInfo {
  id: string;
  url: string;
  type: string;
  name?: string | null;
  mimeType?: string | null;
  size?: bigint | string | null;
}

export interface MessageWithDetails {
  id: string;
  content: string;
  createdAt: Date;
  updatedAt: Date;
  senderId: string | null;
  threadId: string;
  parentId: string | null;
  depth: number;
  isEdited: boolean;
  isPinned: boolean;
  likeCount: number;
  replyCount: number;
  isAiResponse: boolean;
  deletedAt?: Date | null;
  sender: {
    id: string;
    name: string | null;
    image: string | null;
    status: UserStatus;
  } | null;
  attachments: AttachmentInfo[];
  reactions?: ReactionSummary[];
  replyCountDisplay?: number;
  replies?: MessageWithDetails[];
}

/**
 * A message node in the nested reply tree.
 * Extends the flat Message type with children and collapse state.
 */
export interface MessageNode extends Message {
  children: MessageNode[];
  isCollapsed: boolean;
  likeCount: number;
  replyCount: number;
  isAiResponse: boolean;
}

export interface MessageEditHistory {
  id: string;
  content: string;
  editedAt: Date;
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
