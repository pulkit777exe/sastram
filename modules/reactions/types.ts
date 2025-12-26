/**
 * Reaction domain types
 */

export interface ReactionSummary {
  emoji: string;
  count: number;
  users: Array<{
    id: string;
    name: string | null;
    image: string | null;
  }>;
}

