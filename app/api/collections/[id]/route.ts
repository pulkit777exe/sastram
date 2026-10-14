import { NextRequest, NextResponse } from 'next/server';
import { ok, fail, HTTP_STATUS } from '@/lib/utils/api-response';
import { getCollection, deleteCollection } from '@/modules/collections/repository';
import { withCollectionsHandler, parseRouteId } from '@/modules/collections/handler';
import { collectionIdSchema } from '@/modules/collections/schemas';

export const GET = withCollectionsHandler(async (_: NextRequest, session, context) => {
  const id = await parseRouteId(context, collectionIdSchema);

  const collection = await getCollection(id, session.user.id);
  if (!collection) return NextResponse.json(fail('NOT_FOUND', 'Collection not found'), { status: HTTP_STATUS.NOT_FOUND });
  return NextResponse.json(ok(collection));
});

export const DELETE = withCollectionsHandler(async (_: NextRequest, session, context) => {
  const id = await parseRouteId(context, collectionIdSchema);

  await deleteCollection(id, session.user.id);
  return NextResponse.json(ok({ ok: true }));
});
