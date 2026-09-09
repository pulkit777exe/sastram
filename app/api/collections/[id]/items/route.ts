import { NextRequest, NextResponse } from 'next/server';
import { requireSessionOrThrow } from '@/modules/auth';
import { ok, withErrorHandling } from '@/lib/utils/api-response';
import { removeFromCollectionOwned } from '@/modules/collections/repository';
import { z } from 'zod';

const addSchema = z.object({ threadId: z.string().cuid().optional(), sessionId: z.string().cuid().optional() }).refine((d) => d.threadId || d.sessionId, 'threadId or sessionId required');

export const POST = withErrorHandling(async (request: NextRequest, context?: { params: Promise<Record<string, string>> }) => {
  const session = await requireSessionOrThrow();
  const { id } = await context!.params;
  const parsedId = z.string().cuid().safeParse(id);
  if (!parsedId.success) return NextResponse.json({ error: 'Invalid collection id' }, { status: 400 });
  const body = addSchema.parse(await request.json());
  const item = await (await import('@/modules/collections/repository')).addToCollectionOwned(parsedId.data, session.user.id, session.user.role, body.threadId, body.sessionId);
  return NextResponse.json(ok(item), { status: 201 });
});

export const DELETE = withErrorHandling(async (request: NextRequest) => {
  const session = await requireSessionOrThrow();
  const { searchParams } = new URL(request.url);
  const itemId = searchParams.get('itemId');
  if (!itemId) return NextResponse.json({ error: 'itemId required' }, { status: 400 });
  await removeFromCollectionOwned(itemId, session.user.id);
  return NextResponse.json(ok({ ok: true }));
});
