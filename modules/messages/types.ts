import type { UserStatus } from '@prisma/client';
import type { ReactionSummary } from '@/modules/reactions/types';
import type { Message } from '@/lib/types/index';

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
  claims?: Array<{
    id: string;
    messageId: string;
    position: number;
    text: string;
    status: 'OPEN' | 'CONFIRMED' | 'DISPUTED' | 'CONTESTED';
    sourceLabel: string | null;
    sourceUrl: string | null;
    excerpt: string | null;
    confidence: number | null;
    confirmCount: number;
    disputeCount: number;
  }>;
}

export interface MessageNode extends Message {
  children: MessageNode[];
  isCollapsed: boolean;
  likeCount: number;
  replyCount: number;
  isAiResponse: boolean;
}
