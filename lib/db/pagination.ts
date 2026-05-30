import type { Prisma } from '@prisma/client';
import { prisma } from '@/lib/infrastructure/prisma';

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

async function paginateThreads<TSelect extends Prisma.ThreadSelect>(
  params: {
    where?: Prisma.ThreadWhereInput;
    orderBy?: Prisma.ThreadOrderByWithRelationInput;
    select: TSelect;
  } & CursorPaginationParams<{ id: string }>
): Promise<CursorPaginationResult<Prisma.ThreadGetPayload<{ select: TSelect }>, { id: string }>> {
  const take = params.take ?? 20;

  const items = await prisma.thread.findMany({
    where: params.where,
    orderBy: params.orderBy ?? { createdAt: 'desc' },
    take: take + 1,
    ...(params.cursor
      ? {
          cursor: { id: params.cursor.id },
          skip: 1,
        }
      : {}),
    select: params.select,
  });

  let nextCursor: { id: string } | null = null;
  if (items.length > take) {
    const nextItem = items.pop()!;
    nextCursor = { id: (nextItem as { id: string }).id };
  }

  return {
    items,
    nextCursor,
  };
}
