/**
 * Badges domain types
 */

export interface UserBadge {
  id: string;
  name: string;
  description: string;
  icon: string | null;
  color: string;
  criteria: any;
  createdAt: Date;
}

export interface UserBadgeEarned {
  id: string;
  userId: string;
  badgeId: string;
  earnedAt: Date;
}

