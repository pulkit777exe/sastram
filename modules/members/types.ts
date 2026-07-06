import type { SectionRole, MemberStatus, UserStatus } from '@prisma/client';

/**
 * Member domain types
 */

export interface ThreadMember {
  id: string;
  userId: string;
  sectionId: string;
  role: SectionRole;
  status: MemberStatus;
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
