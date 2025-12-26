/**
 * Message domain types
 */

export interface MessageWithDetails {
  id: string;
  content: string;
  createdAt: Date;
  updatedAt: Date;
  senderId: string;
  sectionId: string;
  parentId: string | null;
  depth: number;
  isEdited: boolean;
  isPinned: boolean;
  sender: {
    id: string;
    name: string | null;
    image: string | null;
  };
  attachments: Array<{
    id: string;
    url: string;
    type: string;
    name: string | null;
  }>;
  reactions?: Array<{
    emoji: string;
    count: number;
    users: Array<{ id: string; name: string | null }>;
  }>;
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
  senderAvatar: string | null;
  createdAt: Date;
  sectionId: string;
}

