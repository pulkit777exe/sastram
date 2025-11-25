export interface CommunitySummary {
  id: string;
  slug: string;
  title: string;
  description?: string | null;
  threadCount: number;
}
