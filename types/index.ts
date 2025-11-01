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

export interface Message {
  id: string;
  conversationId: string;
  senderId: string;
  sender: string;
  content: string;
  timestamp: string;
  avatar: string;
  isOwn: boolean;
  status?: "sent" | "delivered" | "read";
}

export interface User {
  id: string;
  name: string;
  email: string;
  avatar?: string;
}
