import type { User as PrismaUser, Reaction as PrismaReaction } from '@prisma/client';

export type Sender = Pick<PrismaUser, 'id' | 'name' | 'image'>;

export interface Attachment {
  id: string;
  name: string | null;
  url: string;
  type: string;
  size: number | null;
  messageId?: string;
}

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

export interface Conversation {
  id: string;
  name: string;
  avatar: string;
  lastMessage: string;
  timestamp: string;
  unread: number;
  online: boolean;
  type: 'channel' | 'dm';
}

export type Reaction = PrismaReaction;

export interface ReadReceipt {
  id: string;
  messageId: string;
  userId: string;
  readAt: Date;
}

