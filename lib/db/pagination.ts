export type CursorPaginationParams<TCursor> = {
  take?: number;
  cursor?: TCursor | null;
};

export type CursorPaginationResult<TItem, TCursor> = {
  items: TItem[];
  nextCursor: TCursor | null;
};

export type OffsetPaginationResult<TItem> = {
  items: TItem[];
  total: number;
  hasMore: boolean;
};

/**
 * Build a consistent offset-based pagination response.
 * Usage: return paginatedResponse(items, total, offset, limit);
 */
export function paginatedResponse<T>(
  items: T[],
  total: number,
  offset: number,
  limit: number
): OffsetPaginationResult<T> {
  return {
    items,
    total,
    hasMore: offset + limit < total,
  };
}

/**
 * Compute hasMore for offset-based pagination.
 */
export function computeHasMore(offset: number, limit: number, total: number): boolean {
  return offset + limit < total;
}

/**
 * Create an empty pagination response for error/fallback cases.
 */
export function emptyPagination<T>(): OffsetPaginationResult<T> {
  return {
    items: [],
    total: 0,
    hasMore: false,
  };
}
