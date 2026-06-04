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
  userId: string;
  badgeId: string;
  earnedAt: Date;
}
