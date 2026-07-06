import type { Role, UserStatus } from '@prisma/client';

/**
 * User domain types
 */

export interface UserProfile {
  id: string;
  name: string | null;
  email: string;
  bio: string | null;
  image: string | null;
  bannerUrl: string | null;
  location: string | null;
  website: string | null;
  twitter: string | null;
  github: string | null;
  linkedin: string | null;
  role: Role;
  status: UserStatus;
  createdAt: Date;
  lastSeenAt?: Date | null;
}
