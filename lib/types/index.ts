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
  factCheckStatus?: string | null;
  truncated?: boolean;
  createdAt: Date;
  updatedAt: Date;
  deletedAt: Date | null;

  // Null once the author is soft-deleted; render as a deleted/anonymous user.
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

export interface Reaction {
  id: string;
  emoji: string;
  messageId: string;
  userId: string;
  createdAt: Date;
}

export interface ReadReceipt {
  id: string;
  threadId: string;
  lastReadMessageId: string | null;
  userId: string;
  readAt: Date;
  createdAt: Date;
  updatedAt: Date;
}

/** How the @sai inline reply for a just-posted message will be delivered. */
export type AiInlineDelivery = 'streaming' | 'queued' | 'limited' | null;

export interface AiInlineMeta {
  aiInline?: AiInlineDelivery;
}
