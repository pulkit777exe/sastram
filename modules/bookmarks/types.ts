/**
 * Bookmarks domain types
 */

export interface BookmarkedThreadsResponse {
  bookmarks: Array<{
    id: string;
    name: string;
    slug: string;
    description: string | null;
    messageCount: number;
    memberCount: number;
    createdAt: Date;
    updatedAt: Date;
    creator: {
      id: string;
      name: string | null;
      email: string;
      image: string | null;
    };
  }>;
  total: number;
  hasMore: boolean;
}
