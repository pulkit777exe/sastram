/**
 * Bookmarks domain types
 */

export interface Bookmark {
  id: string;
  userId: string;
  threadId: string;
  createdAt: Date;
}

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
      avatarUrl: string | null;
    };
  }>;
  total: number;
  hasMore: boolean;
}

