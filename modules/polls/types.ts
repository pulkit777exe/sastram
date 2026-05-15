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
