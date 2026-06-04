import { ThreadRole, MemberStatus, UserStatus } from '@prisma/client';

/**
 * Member domain types
 */

export interface ThreadMember {
  id: string;
  threadId: string;
  userId: string;
  role: ThreadRole;
  status: MemberStatus;
  joinedAt: Date;
  user: {
    id: string;
    name: string | null;
    email: string;
    image: string | null;
    status: UserStatus;
    lastSeenAt: Date | null;
  };
}
