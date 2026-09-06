import { NextRequest, NextResponse } from 'next/server';
import { requireSessionOrThrow } from '@/modules/auth';
import { ok, withErrorHandling } from '@/lib/utils/api-response';
import { addToCollection, removeFromCollection } from '@/modules/collections/repository';
import { z } from 'zod';

const addSchema = z.object({ threadId: z.string().cuid().optional(), sessionId: z.string().cuid().optional() }).refine((d) => d.threadId || d.sessionId, 'threadId or sessionId required');

export const POST = withErrorHandling(async (request: NextRequest, context?: { params: Promise<Record<string, string>> }) => {
  await requireSessionOrThrow();
  const { id } = await context!.params;
  const body = addSchema.parse(await request.json());
  // ensure collection belongs to user via add (FK will fail if not)
  const item = await addToCollection(id, body.threadId, body.sessionId);
  return NextResponse.json(ok(item), { status: 201 });
});

export const DELETE = withErrorHandling(async (request: NextRequest) => {
  const { searchParams } = new URL(request.url);
  const itemId = searchParams.get('itemId');
  if (!itemId) return NextResponse.json({ error: 'itemId required' }, { status: 400 });
  await removeFromCollection(itemId);
  return NextResponse.json(ok({ ok: true }));
});
