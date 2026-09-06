import { NextRequest, NextResponse } from 'next/server';
import { requireSessionOrThrow } from '@/modules/auth';
import { ok, fail, withErrorHandling, HTTP_STATUS } from '@/lib/utils/api-response';
import { getCollection, deleteCollection } from '@/modules/collections/repository';

export const GET = withErrorHandling(async (_: NextRequest, context?: { params: Promise<Record<string, string>> }) => {
  const session = await requireSessionOrThrow();
  const { id } = await context!.params;
  const collection = await getCollection(id, session.user.id);
  if (!collection) return NextResponse.json(fail('NOT_FOUND', 'Not found'), { status: HTTP_STATUS.NOT_FOUND });
  return NextResponse.json(ok(collection));
});

export const DELETE = withErrorHandling(async (_: NextRequest, context?: { params: Promise<Record<string, string>> }) => {
  const session = await requireSessionOrThrow();
  const { id } = await context!.params;
  await deleteCollection(id, session.user.id);
  return NextResponse.json(ok({ ok: true }));
});
