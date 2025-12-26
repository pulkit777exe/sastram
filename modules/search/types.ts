/**
 * Search domain types
 */

export interface SearchResults<T> {
  items: T[];
  total: number;
  hasMore: boolean;
}

