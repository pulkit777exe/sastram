/**
 * Reputation domain types
 */

export interface UserReputation {
  id: string;
  userId: string;
  points: number;
  level: number;
  updatedAt: Date;
}

