import { NextRequest, NextResponse } from 'next/server';
import { requireSessionOrThrow } from '@/modules/auth';
import { ok, fail, withErrorHandling, HTTP_STATUS } from '@/lib/utils/api-response';
import { removeFromCollectionOwned } from '@/modules/collections/repository';
import { isCollectionsEnabled } from '@/modules/collections/enabled';
import { z } from 'zod';

const addSchema = z.object({ threadId: z.string().cuid().optional(), sessionId: z.string().cuid().optional(), messageId: z.string().cuid().optional(), metadata: z.unknown().optional() }).refine((d) => d.threadId || d.sessionId || d.messageId || d.metadata, 'threadId or sessionId or messageId or metadata required');
const itemIdSchema = z.string().cuid();

export const POST = withErrorHandling(async (request: NextRequest, context?: { params: Promise<Record<string, string>> }) => {
  const session = await requireSessionOrThrow();
  if (!(await isCollectionsEnabled(session.user.id))) {
    return NextResponse.json(fail('FEATURE_DISABLED', 'Collections is disabled'), { status: HTTP_STATUS.FORBIDDEN });
  }
  const { id } = await context!.params;
  const parsedId = z.string().cuid().safeParse(id);
  if (!parsedId.success) return NextResponse.json(fail('VALIDATION_ERROR', 'Invalid collection id'), { status: HTTP_STATUS.BAD_REQUEST });
  const body = addSchema.parse(await request.json());
  const item = await (await import('@/modules/collections/repository')).addToCollectionOwned(parsedId.data, session.user.id, session.user.role, body.threadId, body.sessionId, body.messageId, body.metadata);
  return NextResponse.json(ok(item), { status: 201 });
});

export const DELETE = withErrorHandling(async (request: NextRequest, _context?: { params: Promise<Record<string, string>> }) => {
  const session = await requireSessionOrThrow();
  const { searchParams } = new URL(request.url);
  const itemId = searchParams.get('itemId');
  if (!itemId) return NextResponse.json(fail('BAD_REQUEST', 'itemId required'), { status: HTTP_STATUS.BAD_REQUEST });
  const parsedItemId = itemIdSchema.safeParse(itemId);
  if (!parsedItemId.success) return NextResponse.json(fail('VALIDATION_ERROR', 'Invalid itemId'), { status: HTTP_STATUS.BAD_REQUEST });
  await removeFromCollectionOwned(parsedItemId.data, session.user.id);
  return NextResponse.json(ok({ ok: true }));
});
