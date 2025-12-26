/**
 * Polls domain types
 */

export interface Poll {
  id: string;
  threadId: string;
  question: string;
  options: string[];
  isActive: boolean;
  expiresAt: Date | null;
  createdAt: Date;
  updatedAt: Date;
}

export interface PollVote {
  id: string;
  pollId: string;
  userId: string;
  optionIndex: number;
  createdAt: Date;
}

export interface PollResults {
  poll: {
    id: string;
    question: string;
    options: string[];
    isActive: boolean;
    expiresAt: Date | null;
    totalVotes: number;
  };
  results: Array<{
    option: string;
    index: number;
    votes: number;
    percentage: number;
  }>;
}

