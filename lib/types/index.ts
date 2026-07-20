export interface User {
  id: string;
  name: string | null;
  email: string;
  image: string | null;
}

export interface Sender {
  id: string;
  name: string | null;
  image: string | null;
}

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
  senderId: string | null;
  parentId: string | null;
  depth: number;
  isEdited: boolean;
  isPinned: boolean;
  likeCount: number;
  replyCount: number;
  isAiResponse: boolean;
  truncated?: boolean;
  createdAt: Date;
  updatedAt: Date;
  deletedAt: Date | null;

  sender: Sender | null;
  thread: {
    id: string;
    name: string;
    slug: string;
  };
  attachments: Attachment[];
  reactions?: Reaction[];
  readReceipts?: ReadReceipt[];
  replies?: Message[];
  poll?: Poll | null;
}

export interface Poll {
  id: string;
  threadId: string;
  question: string;
  options: string[];
  isActive: boolean;
  expiresAt: Date | null;
  createdAt: Date;
  votes?: PollVote[];
}

export interface PollVote {
  id: string;
  pollId: string;
  userId: string;
  optionIndex: number;
  createdAt: Date;
}

export interface Topic {
  id: string;
  name: string;
  description: string | null;
  icon: string | null;
  createdAt: Date;
}

export interface WebSocketMessage {
  type: WebSocketEventType;
  payload: {
    sectionId: string;
    [key: string]: unknown;
  };
}

export type WebSocketEventType =
  | 'NEW_MESSAGE'
  | 'MESSAGE_DELETED'
  | 'MESSAGE_EDITED'
  | 'MESSAGE_QUEUED'
  | 'MENTION_NOTIFICATION'
  | 'REACTION_UPDATE'
  | 'PIN_UPDATE';

export interface MentionData {
  messageId: string;
  mentionedUserId: string;
  mentionedBy: string;
  mentionedByName: string;
  sectionId: string;
  content: string;
  parentId?: string;
}

export interface AttachmentInput {
  url: string;
  type: string;
  name: string | null;
  size: number | null;
}

export interface Reaction {
  id: string;
  emoji: string;
  messageId: string;
  userId: string;
  createdAt: Date;
}

export interface ReadReceipt {
  id: string;
  lastReadMessageId: string;
  userId: string;
  readAt: Date;
}

export type ActionResponse<T = unknown> = {
  data: T | null;
  error: string | null;
};
