import { NextRequest, NextResponse } from 'next/server';
import { ok, fail, HTTP_STATUS } from '@/lib/utils/api-response';
import { getCollection, deleteCollection } from '@/modules/collections/repository';
import { withCollectionsHandler, parseRouteId } from '@/modules/collections/handler';
import { collectionIdSchema } from '@/modules/collections/schemas';
import { clampLimit } from '@/lib/db/pagination';

// The collection page probes with take 51 and export uses take 100; the raw
// API had no cap and could scan a user's entire collection. Default 50, hard
// ceiling 100 (same MAX_LIMIT as lib/db/pagination).
const DEFAULT_ITEMS_LIMIT = 50;
const MAX_ITEMS_LIMIT = 100;

function parseItemsWindow(request: NextRequest): { take: number; skip: number } {
  const params = new URL(request.url).searchParams;
  const rawLimit = Number(params.get('limit'));
  const rawOffset = Number(params.get('offset'));
  return {
    take: clampLimit(Number.isFinite(rawLimit) && rawLimit > 0 ? rawLimit : null, {
      default: DEFAULT_ITEMS_LIMIT,
      max: MAX_ITEMS_LIMIT,
    }),
    skip: Number.isFinite(rawOffset) && rawOffset > 0 ? Math.floor(rawOffset) : 0,
  };
}

export const GET = withCollectionsHandler(async (request: NextRequest, session, context) => {
  const id = await parseRouteId(context, collectionIdSchema);

  const { take, skip } = parseItemsWindow(request);
  const collection = await getCollection(id, session.user.id, { take, skip });
  if (!collection) return NextResponse.json(fail('NOT_FOUND', 'Collection not found'), { status: HTTP_STATUS.NOT_FOUND });
  return NextResponse.json(ok(collection));
});

export const DELETE = withCollectionsHandler(async (_: NextRequest, session, context) => {
  const id = await parseRouteId(context, collectionIdSchema);

  await deleteCollection(id, session.user.id);
  return NextResponse.json(ok({ ok: true }));
});
