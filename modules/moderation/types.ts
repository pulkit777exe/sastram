/**
 * Moderation domain types
 */

export interface BannedUser {
  id: string;
  userId: string;
  bannedBy: string;
  reason: string;
  customReason: string | null;
  threadId: string | null;
  isActive: boolean;
  expiresAt: Date | null;
  createdAt: Date;
  user: {
    id: string;
    name: string | null;
    email: string;
    image: string | null;
    status: string;
  };
  issuer: {
    id: string;
    name: string | null;
    email: string;
  };
  thread: {
    id: string;
    name: string;
    slug: string;
  } | null;
}

export interface MessageDetails {
  id: string;
  content: string;
  createdAt: Date;
  sender: {
    id: string;
    name: string | null;
    email: string;
    image: string | null;
    role: string;
    status: string;
    createdAt: Date;
  };
  section: {
    id: string;
    name: string;
    slug: string;
  };
  attachments: Array<{
    id: string;
    url: string;
    type: string;
  }>;
  parent?: {
    id: string;
    content: string;
    sender: {
      name: string | null;
    };
  };
  reactions: Array<{
    emoji: string;
    user: {
      name: string | null;
      image: string | null;
    };
  }>;
  reports: Array<{
    id: string;
    reason: string;
    reporter: {
      name: string | null;
      email: string;
    };
  }>;
  editHistory: Array<{
    content: string;
    editedAt: Date;
  }>;
}

