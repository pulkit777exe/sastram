import { NextRequest, NextResponse } from 'next/server';
import { ok } from '@/lib/utils/api-response';
import { addToCollection, removeFromCollection } from '@/modules/collections/repository';
import { prismaCollectionPolicy } from '@/modules/collections/policy';
import { withCollectionsHandler, parseRouteId, parseJsonBody, parseQueryParam } from '@/modules/collections/handler';
import { savePayloadSchema, collectionIdSchema, itemIdSchema } from '@/modules/collections/schemas';

export const POST = withCollectionsHandler(async (request: NextRequest, session, context) => {
  const id = await parseRouteId(context, collectionIdSchema);
  const body = await parseJsonBody(request, savePayloadSchema);

  await prismaCollectionPolicy.assertCollectionOwner(id, session.user.id);
  await prismaCollectionPolicy.assertCanAddRef(body, session.user.id, session.user.role);
  const item = await addToCollection(id, body.threadId, body.sessionId, body.messageId, body.metadata);
  return NextResponse.json(ok(item), { status: 201 });
});

// NOTE (behavior fix): this handler runs behind the default
// `requireEnabled: true` gate. It previously skipped the collections-enabled
// check entirely (live divergence) — saves to a disabled feature now 403
// instead of succeeding.
export const DELETE = withCollectionsHandler(async (request: NextRequest, session, context) => {
  const id = await parseRouteId(context, collectionIdSchema);
  const { searchParams } = new URL(request.url);
  const itemId = parseQueryParam(searchParams, 'itemId', itemIdSchema);
  // Single policy read maps the IDOR cases: 404 missing / 403 other owner /
  // 400 item lives in a different collection.
  const owned = await prismaCollectionPolicy.assertItemInCollection(itemId, id, session.user.id);
  await removeFromCollection({ id: owned.id, collectionId: owned.collectionId });
  return NextResponse.json(ok({ ok: true }));
});
