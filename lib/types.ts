export interface User {
  id: string;
  name: string | null;
  email: string;
  image: string | null;
}

export interface Sender {
  name: string | null;
  image: string | null;
}

export interface Attachment {
  id: string;
  name: string | null;
  url: string;
  type: string;
}

export interface Message {
  id: string;
  content: string;
  createdAt: Date;
  senderId: string;
  sender: Sender;
  attachments: Attachment[];
}

export interface Topic {
  id: string;
  name: string;
  description: string | null;
  icon: string | null;
  createdAt: Date;
}

export interface WebSocketMessage {
  type: "NEW_MESSAGE" | "USER_JOINED" | "USER_LEFT";
  payload: {
    sectionId: string;
    [key: string]: unknown;
  };
}

export interface Conversation {
  id: string;
  name: string;
  avatar: string;
  lastMessage: string;
  timestamp: string;
  unread: number;
  online: boolean;
  type: "channel" | "dm";
}

export interface ChatMessage {
  id: string;
  sender: string;
  content: string;
  timestamp: string;
  avatar: string | null;
  isOwn: boolean;
  status: "sent" | "delivered" | "read";
  attachments?: Attachment[];
}

export interface AttachmentInput {
  url: string;
  type: string;
  name: string | null;
  size: number | null;
}

export type ActionResponse<T = unknown> = {
  success: boolean;
  data?: T;
  error?: string;
};
