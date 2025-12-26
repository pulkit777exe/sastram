/**
 * Invitation domain types
 */

export interface ThreadInvitation {
  id: string;
  threadId: string;
  senderId: string;
  email: string;
  message: string | null;
  status: string;
  token: string | null;
  expiresAt: Date | null;
  createdAt: Date;
  updatedAt: Date;
  thread: {
    slug: string;
    name: string;
  };
  sender: {
    name: string | null;
    email: string;
  };
}

