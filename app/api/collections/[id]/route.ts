import { NextRequest, NextResponse } from 'next/server';
import { ok, fail, HTTP_STATUS } from '@/lib/utils/api-response';
import { getCollection, deleteCollection } from '@/modules/collections/repository';
import { withCollectionsHandler } from '@/modules/collections/handler';
import { collectionIdSchema } from '@/modules/collections/schemas';

export const GET = withCollectionsHandler(async (_: NextRequest, session, context) => {
  const { id } = await context!.params;

  const idParsed = collectionIdSchema.safeParse(id);
  if (!idParsed.success) {
    return NextResponse.json(fail('VALIDATION_ERROR', 'Invalid collection id'), { status: HTTP_STATUS.BAD_REQUEST });
  }

  const collection = await getCollection(idParsed.data, session.user.id);
  if (!collection) return NextResponse.json(fail('NOT_FOUND', 'Collection not found'), { status: HTTP_STATUS.NOT_FOUND });
  return NextResponse.json(ok(collection));
});

export const DELETE = withCollectionsHandler(async (_: NextRequest, session, context) => {
  const { id } = await context!.params;

  const idParsed = collectionIdSchema.safeParse(id);
  if (!idParsed.success) {
    return NextResponse.json(fail('VALIDATION_ERROR', 'Invalid collection id'), { status: HTTP_STATUS.BAD_REQUEST });
  }

  await deleteCollection(idParsed.data, session.user.id);
  return NextResponse.json(ok({ ok: true }));
});
