import { NextRequest, NextResponse } from 'next/server';
import { ok, fail, HTTP_STATUS } from '@/lib/utils/api-response';
import { createCollection, getUserCollections, getUserCollectionsLight } from '@/modules/collections/repository';
import { withCollectionsHandler } from '@/modules/collections/handler';
import { createCollectionSchema } from '@/modules/collections/schemas';

export const GET = withCollectionsHandler(async (request, session) => {
  const url = new URL(request.url);
  const light = url.searchParams.get('light') === '1';
  const collections = light ? await getUserCollectionsLight(session.user.id) : await getUserCollections(session.user.id);
  const res = NextResponse.json(ok(collections));
  // Private, short-lived cache — saves DB on hover spam, still respects user isolation
  res.headers.set('Cache-Control', 'private, max-age=10, stale-while-revalidate=30');
  return res;
});

// NOTE: previously hand-rolled the guard preamble but never imported
// `rateLimit` / `isCollectionsEnabled` (runtime ReferenceError on every POST).
// Now on the shared seam — same guard order, no behavior change.
export const POST = withCollectionsHandler(async (request: NextRequest, session) => {
  let raw: unknown;
  try {
    raw = await request.json();
  } catch {
    return NextResponse.json(fail('VALIDATION_ERROR', 'Invalid JSON body'), { status: HTTP_STATUS.BAD_REQUEST });
  }

  const parsed = createCollectionSchema.safeParse(raw);
  if (!parsed.success) {
    const msg = parsed.error.issues[0]?.message ?? 'Invalid input';
    return NextResponse.json(fail('VALIDATION_ERROR', msg, parsed.error.issues), { status: HTTP_STATUS.BAD_REQUEST });
  }

  const collection = await createCollection(session.user.id, parsed.data.title);
  return NextResponse.json(ok(collection), { status: 201 });
});
