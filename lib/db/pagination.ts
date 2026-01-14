import type { Prisma } from "@prisma/client";
import { prisma } from "@/lib/infrastructure/prisma";

export type CursorPaginationParams<TCursor> = {
  take?: number;
  cursor?: TCursor | null;
};

export type CursorPaginationResult<TItem, TCursor> = {
  items: TItem[];
  nextCursor: TCursor | null;
};

export async function paginateSections<TSelect extends Prisma.SectionSelect>(
  params: {
    where?: Prisma.SectionWhereInput;
    orderBy?: Prisma.SectionOrderByWithRelationInput;
    select: TSelect;
  } & CursorPaginationParams<{ id: string }>
): Promise<CursorPaginationResult<Prisma.SectionGetPayload<{ select: TSelect }>, { id: string }>> {
  const take = params.take ?? 20;

  const items = await prisma.section.findMany({
    where: params.where,
    orderBy: params.orderBy ?? { createdAt: "desc" },
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
    nextCursor = { id: (nextItem as any).id };
  }

  return {
    items: items as any,
    nextCursor,
  };
}

