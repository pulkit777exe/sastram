/**
 * Badges domain types
 */

export interface BadgeCriteria {
  type: 'message_count' | 'thread_count' | 'reaction_count' | 'streak_days';
  threshold: number;
}

export interface UserBadge {
  id: string;
  name: string;
  description: string;
  icon: string | null;
  color: string;
  criteria: BadgeCriteria;
  createdAt: Date;
}

export interface UserBadgeEarned {
  userId: string;
  badgeId: string;
  earnedAt: Date;
}
