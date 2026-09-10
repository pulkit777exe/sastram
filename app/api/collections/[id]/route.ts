import { NextRequest, NextResponse } from 'next/server';
import { requireSessionOrThrow } from '@/modules/auth';
import { ok, fail, withErrorHandling, HTTP_STATUS } from '@/lib/utils/api-response';
import { getCollection, deleteCollection } from '@/modules/collections/repository';
import { isCollectionsEnabled } from '@/modules/collections/enabled';
import { z } from 'zod';

const idSchema = z.string().cuid();

export const GET = withErrorHandling(async (_: NextRequest, context?: { params: Promise<Record<string, string>> }) => {
  const session = await requireSessionOrThrow();
  if (!(await isCollectionsEnabled(session.user.id))) {
    return NextResponse.json(fail('FEATURE_DISABLED', 'Collections is disabled'), { status: HTTP_STATUS.FORBIDDEN });
  }
  const { id } = await context!.params;

  const idParsed = idSchema.safeParse(id);
  if (!idParsed.success) {
    return NextResponse.json(fail('VALIDATION_ERROR', 'Invalid collection id'), { status: HTTP_STATUS.BAD_REQUEST });
  }

  const collection = await getCollection(id, session.user.id);
  if (!collection) return NextResponse.json(fail('NOT_FOUND', 'Collection not found'), { status: HTTP_STATUS.NOT_FOUND });
  return NextResponse.json(ok(collection));
});

export const DELETE = withErrorHandling(async (_: NextRequest, context?: { params: Promise<Record<string, string>> }) => {
  const session = await requireSessionOrThrow();
  if (!(await isCollectionsEnabled(session.user.id))) {
    return NextResponse.json(fail('FEATURE_DISABLED', 'Collections is disabled'), { status: HTTP_STATUS.FORBIDDEN });
  }
  const { id } = await context!.params;

  const idParsed = idSchema.safeParse(id);
  if (!idParsed.success) {
    return NextResponse.json(fail('VALIDATION_ERROR', 'Invalid collection id'), { status: HTTP_STATUS.BAD_REQUEST });
  }

  await deleteCollection(id, session.user.id);
  return NextResponse.json(ok({ ok: true }));
});
