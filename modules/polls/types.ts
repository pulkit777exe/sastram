export interface PollResults {
  poll: {
    id: string;
    question: string;
    options: string[];
    isActive: boolean;
    expiresAt: Date | null;
    totalVotes: number;
    isMarket?: boolean;
    resolvedOptionIndex?: number | null;
    marketResolvedAt?: Date | null;
  };
  results: Array<{
    option: string;
    index: number;
    votes: number;
    percentage: number;
  }>;
}
