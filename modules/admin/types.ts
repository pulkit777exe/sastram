/**
 * Admin domain types
 */

export interface AdminStats {
  totalUsers: number;
  totalThreads: number;
  totalMessages: number;
  totalCommunities: number;
  activeUsers24h: number;
  pendingReports: number;
}

export interface AdminDashboardData {
  communities: Array<{
    id: string;
    title: string;
    slug: string;
    description: string | null;
    threadCount: number;
  }>;
  threads: Array<{
    id: string;
    name: string;
    slug: string;
    description: string | null;
    messageCount: number;
    activeUsers: number;
  }>;
}

