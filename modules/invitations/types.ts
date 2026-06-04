/**
 * Invitation domain types
 */

export interface ThreadInvitation {
  id: string;
  threadId: string;
  senderId: string;
  email: string;
  status: string;
  token: string;
  expiresAt: Date | null;
  createdAt: Date;
  thread: {
    slug: string;
    name: string;
  };
  sender: {
    name: string | null;
    email: string;
  };
}
