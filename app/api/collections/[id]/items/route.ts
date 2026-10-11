import { NextRequest, NextResponse } from 'next/server';
import { ok, fail, HTTP_STATUS } from '@/lib/utils/api-response';
import { addToCollection, removeFromCollection } from '@/modules/collections/repository';
import { prismaCollectionPolicy } from '@/modules/collections/policy';
import { withCollectionsHandler } from '@/modules/collections/handler';
import { savePayloadSchema, collectionIdSchema, itemIdSchema } from '@/modules/collections/schemas';

export const POST = withCollectionsHandler(async (request: NextRequest, session, context) => {
  const { id } = await context!.params;
  const parsedId = collectionIdSchema.safeParse(id);
  if (!parsedId.success) return NextResponse.json(fail('VALIDATION_ERROR', 'Invalid collection id'), { status: HTTP_STATUS.BAD_REQUEST });

  let raw: unknown;
  try {
    raw = await request.json();
  } catch {
    return NextResponse.json(fail('VALIDATION_ERROR', 'Invalid JSON body'), { status: HTTP_STATUS.BAD_REQUEST });
  }
  const parsed = savePayloadSchema.safeParse(raw);
  if (!parsed.success) {
    const msg = parsed.error.issues[0]?.message ?? 'Invalid input';
    return NextResponse.json(fail('VALIDATION_ERROR', msg, parsed.error.issues), { status: HTTP_STATUS.BAD_REQUEST });
  }

  await prismaCollectionPolicy.assertCollectionOwner(parsedId.data, session.user.id);
  await prismaCollectionPolicy.assertCanAddRef(parsed.data, session.user.id, session.user.role);
  const item = await addToCollection(parsedId.data, parsed.data.threadId, parsed.data.sessionId, parsed.data.messageId, parsed.data.metadata);
  return NextResponse.json(ok(item), { status: 201 });
});

// NOTE (behavior fix): this handler runs behind the default
// `requireEnabled: true` gate. It previously skipped the collections-enabled
// check entirely (live divergence) — saves to a disabled feature now 403
// instead of succeeding.
export const DELETE = withCollectionsHandler(async (request: NextRequest, session, context) => {
  const { id } = await context!.params;
  const parsedColId = collectionIdSchema.safeParse(id);
  if (!parsedColId.success) return NextResponse.json(fail('VALIDATION_ERROR', 'Invalid collection id'), { status: HTTP_STATUS.BAD_REQUEST });
  const { searchParams } = new URL(request.url);
  const itemId = searchParams.get('itemId');
  if (!itemId) return NextResponse.json(fail('BAD_REQUEST', 'itemId required'), { status: HTTP_STATUS.BAD_REQUEST });
  const parsedItemId = itemIdSchema.safeParse(itemId);
  if (!parsedItemId.success) return NextResponse.json(fail('VALIDATION_ERROR', 'Invalid itemId'), { status: HTTP_STATUS.BAD_REQUEST });
  // Single policy read maps the IDOR cases: 404 missing / 403 other owner /
  // 400 item lives in a different collection.
  const owned = await prismaCollectionPolicy.assertItemInCollection(parsedItemId.data, parsedColId.data, session.user.id);
  await removeFromCollection({ id: owned.id, collectionId: owned.collectionId });
  return NextResponse.json(ok({ ok: true }));
});
