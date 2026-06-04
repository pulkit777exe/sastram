import type { Role, UserStatus, ProfilePrivacy } from '@prisma/client';

/**
 * User domain types
 */

export interface UserProfile {
  id: string;
  name: string | null;
  email: string;
  image: string | null;
  avatarUrl: string | null;
  bannerUrl: string | null;
  bio: string | null;
  location: string | null;
  website: string | null;
  twitter: string | null;
  github: string | null;
  linkedin: string | null;
  status: UserStatus;
  role: Role;
  profilePrivacy: ProfilePrivacy;
  reputationPoints: number;
  followerCount: number;
  followingCount: number;
  isPro: boolean;
  lastSeenAt: Date | null;
  createdAt: Date;
  updatedAt: Date;
}
