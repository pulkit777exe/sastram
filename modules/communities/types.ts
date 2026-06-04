/**
 * Community domain types
 */

export interface CommunitySummary {
  id: string;
  slug: string;
  title: string;
  description: string | null;
  visibility: string;
  threadCount: number;
  memberCount: number | null;
  createdAt: Date;
}
