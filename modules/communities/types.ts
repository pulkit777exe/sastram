/**
 * Community domain types
 */

export interface CommunitySummary {
  id: string;
  slug: string;
  title: string;
  description?: string | null;
  visibility: string;
  threadCount: number;
  memberCount?: number;
  createdAt: Date;
}

export interface CommunityDetail extends CommunitySummary {
  threads: import('@/modules/threads/types').ThreadSummary[];
  creator: {
    id: string;
    name: string | null;
    image: string | null;
  };
}
