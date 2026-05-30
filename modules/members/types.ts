/**
 * Member domain types
 */

import { ThreadRole, MemberStatus } from '@prisma/client';

export interface ThreadMember {
  id: string;
  threadId: string;
  userId: string;
  role: ThreadRole;
  status: MemberStatus;
  joinedAt: Date;
  updatedAt: Date;
  user: {
    id: string;
    name: string | null;
    email: string;
    image: string | null;
  };
}
