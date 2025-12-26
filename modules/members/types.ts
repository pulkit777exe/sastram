/**
 * Member domain types
 */

import { SectionRole, MemberStatus } from "@prisma/client";

export interface SectionMember {
  id: string;
  sectionId: string;
  userId: string;
  role: SectionRole;
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

