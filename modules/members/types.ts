import type { UserStatus } from '@prisma/client';

/**
 * Member domain types
 */

export interface ThreadMember {
  id: string;
  userId: string;
  threadId: string;
  role: 'OWNER' | 'MODERATOR' | 'MEMBER';
  status: 'ACTIVE' | 'INVITED' | 'LEFT' | 'REMOVED';
  joinedAt: Date;
  user: {
    id: string;
    name: string | null;
    email: string;
    image: string | null;
    status: UserStatus;
    lastSeenAt?: Date | null;
  };
}

// Legacy alias
export type SectionMember = ThreadMember;
