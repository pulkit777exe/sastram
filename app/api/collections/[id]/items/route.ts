import { NextRequest, NextResponse } from 'next/server';
import { requireSessionOrThrow } from '@/modules/auth';
import { ok, fail, withErrorHandling, HTTP_STATUS } from '@/lib/utils/api-response';
import { removeFromCollectionOwned } from '@/modules/collections/repository';
import { isCollectionsEnabled } from '@/modules/collections/enabled';
import { rateLimit } from '@/lib/services/rate-limit';
import { z } from 'zod';

const addSchema = z.object({ threadId: z.string().cuid().optional(), sessionId: z.string().cuid().optional(), messageId: z.string().cuid().optional(), metadata: z.unknown().optional() }).refine((d) => d.threadId || d.sessionId || d.messageId || d.metadata, 'threadId or sessionId or messageId or metadata required');
const itemIdSchema = z.string().cuid();

export const POST = withErrorHandling(async (request: NextRequest, context?: { params: Promise<Record<string, string>> }) => {
  const session = await requireSessionOrThrow();
  const rl = await rateLimit({ key: `collections:${session.user.id}`, type: 'api' });
  if (!rl.success) return NextResponse.json(fail('RATE_LIMITED', 'Too many requests'), { status: HTTP_STATUS.RATE_LIMITED });
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

export const DELETE = withErrorHandling(async (request: NextRequest, context?: { params: Promise<Record<string, string>> }) => {
  const session = await requireSessionOrThrow();
  const rl = await rateLimit({ key: `collections:${session.user.id}`, type: 'api' });
  if (!rl.success) return NextResponse.json(fail('RATE_LIMITED', 'Too many requests'), { status: HTTP_STATUS.RATE_LIMITED });
  const { id } = await context!.params;
  const parsedColId = z.string().cuid().safeParse(id);
  if (!parsedColId.success) return NextResponse.json(fail('VALIDATION_ERROR', 'Invalid collection id'), { status: HTTP_STATUS.BAD_REQUEST });
  const { searchParams } = new URL(request.url);
  const itemId = searchParams.get('itemId');
  if (!itemId) return NextResponse.json(fail('BAD_REQUEST', 'itemId required'), { status: HTTP_STATUS.BAD_REQUEST });
  const parsedItemId = itemIdSchema.safeParse(itemId);
  if (!parsedItemId.success) return NextResponse.json(fail('VALIDATION_ERROR', 'Invalid itemId'), { status: HTTP_STATUS.BAD_REQUEST });
  // Verify collection ownership and that item belongs to this collection (IDOR hardening)
  const { prisma } = await import('@/lib/infrastructure/prisma');
  const item = await prisma.collectionItem.findUnique({ where: { id: parsedItemId.data }, select: { collectionId: true, collection: { select: { userId: true } } } });
  if (!item) return NextResponse.json(fail('NOT_FOUND', 'Item not found'), { status: HTTP_STATUS.NOT_FOUND });
  if (item.collection.userId !== session.user.id) return NextResponse.json(fail('FORBIDDEN', 'Forbidden'), { status: HTTP_STATUS.FORBIDDEN });
  if (item.collectionId !== parsedColId.data) return NextResponse.json(fail('VALIDATION_ERROR', 'Item does not belong to this collection'), { status: HTTP_STATUS.BAD_REQUEST });
  await removeFromCollectionOwned(parsedItemId.data, session.user.id);
  return NextResponse.json(ok({ ok: true }));
});
