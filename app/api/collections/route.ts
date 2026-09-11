import { NextRequest, NextResponse } from 'next/server';
import { requireSessionOrThrow } from '@/modules/auth';
import { ok, fail, withErrorHandling, HTTP_STATUS } from '@/lib/utils/api-response';
import { createCollection, getUserCollections, getUserCollectionsLight } from '@/modules/collections/repository';
import { isCollectionsEnabled } from '@/modules/collections/enabled';
import { rateLimit } from '@/lib/services/rate-limit';
import { z } from 'zod';

const createSchema = z.object({ title: z.string().min(1).max(100).trim() });

export const GET = withErrorHandling(async (request: NextRequest) => {
  const session = await requireSessionOrThrow();
  const rl = await rateLimit({ key: `collections:${session.user.id}`, type: 'api' });
  if (!rl.success) return NextResponse.json(fail('RATE_LIMITED', 'Too many requests'), { status: HTTP_STATUS.RATE_LIMITED });
  if (!(await isCollectionsEnabled(session.user.id))) {
    return NextResponse.json(fail('FEATURE_DISABLED', 'Collections is disabled'), { status: HTTP_STATUS.FORBIDDEN });
  }
  const url = new URL(request.url);
  const light = url.searchParams.get('light') === '1';
  const collections = light ? await getUserCollectionsLight(session.user.id) : await getUserCollections(session.user.id);
  const res = NextResponse.json(ok(collections));
  // Private, short-lived cache — saves DB on hover spam, still respects user isolation
  res.headers.set('Cache-Control', 'private, max-age=10, stale-while-revalidate=30');
  return res;
});

export const POST = withErrorHandling(async (request: NextRequest) => {
  const session = await requireSessionOrThrow();
  const rl = await rateLimit({ key: `collections:${session.user.id}`, type: 'api' });
  if (!rl.success) return NextResponse.json(fail('RATE_LIMITED', 'Too many requests'), { status: HTTP_STATUS.RATE_LIMITED });
  if (!(await isCollectionsEnabled(session.user.id))) {
    return NextResponse.json(fail('FEATURE_DISABLED', 'Collections is disabled'), { status: HTTP_STATUS.FORBIDDEN });
  }

  let raw: unknown;
  try {
    raw = await request.json();
  } catch {
    return NextResponse.json(fail('VALIDATION_ERROR', 'Invalid JSON body'), { status: HTTP_STATUS.BAD_REQUEST });
  }

  const parsed = createSchema.safeParse(raw);
  if (!parsed.success) {
    const msg = parsed.error.issues[0]?.message ?? 'Invalid input';
    return NextResponse.json(fail('VALIDATION_ERROR', msg, parsed.error.issues), { status: HTTP_STATUS.BAD_REQUEST });
  }

  const collection = await createCollection(session.user.id, parsed.data.title);
  return NextResponse.json(ok(collection), { status: 201 });
});
