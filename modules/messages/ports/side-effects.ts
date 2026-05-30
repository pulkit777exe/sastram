export interface MentionNotificationPayload {
  messageId: string;
  mentionedUserId: string;
  mentionedBy: string;
  mentionedByName: string;
  threadId: string;
  content: string;
  parentId?: string;
}

export interface MessageBroadcastPayload {
  id: string;
  content: string;
  senderId: string;
  senderName: string;
  senderAvatar: string | null | undefined;
  createdAt: Date;
  threadId: string;
  parentId: string | null;
  depth: number;
  likeCount: number;
  replyCount: number;
  isAiResponse: boolean;
  reactions: unknown[];
  attachments: Array<{
    id: string;
    url: string;
    type: string;
    name: string | null;
    size: number | null;
  }>;
}

export interface MessageSideEffectsPort {
  emitThreadMessage: (threadId: string, payload: MessageBroadcastPayload) => void;
  emitMentionNotification: (threadId: string, payload: MentionNotificationPayload) => void;
  emitMessageDeleted: (threadId: string, messageId: string, userId?: string) => void;
  emitPinUpdate: (threadId: string, payload: { messageId: string; isPinned: boolean }) => void;
  sendMentionEmail: (args: {
    toEmail: string;
    mentionedByName: string;
    threadName: string;
    contentPreview: string;
    threadUrl: string;
  }) => Promise<void>;
  enqueueAiInline: (args: {
    messageId: string;
    threadId: string;
    query: string;
    userId: string;
  }) => Promise<void>;
}
