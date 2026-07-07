import type { InvitationStatus } from '@prisma/client';

/**
 * Invitation domain types
 */

export interface ThreadInvitation {
  id: string;
  threadId: string;
  senderId: string;
  email: string;
  status: InvitationStatus;
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
