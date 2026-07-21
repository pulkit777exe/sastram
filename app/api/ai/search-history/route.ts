import { NextRequest, NextResponse } from 'next/server';
import { ok, fail } from '@/lib/utils/api-response';
import { z } from 'zod';
import { requireSessionOrThrow } from '@/modules/auth';
import {
  listThreadedSessions,
  listUserSearchSessions,
  getSearchSession,
  softDeleteSearchSession,
} from '@/modules/ai-search/repository';

export const maxDuration = 30;

const idSchema = z.object({ id: z.string().min(1) });

export async function GET(request: NextRequest) {
  try {
    let session;
    try {
      session = await requireSessionOrThrow();
    } catch {
      return NextResponse.json(fail('AUTH_REQUIRED', 'Authentication required'), { status: 401, headers: { 'Cache-Control': 'no-store' } });
    }

    const url = new URL(request.url);
    const single = url.searchParams.get('id');

    if (single) {
      const parsed = idSchema.safeParse({ id: single });
      if (!parsed.success) {
        return NextResponse.json(fail('VALIDATION_ERROR', 'Invalid session id'), { status: 400 });
      }
      // Ownership is enforced inside getSearchSession (userId + id) — returns
      // 404 (not 500) for missing or foreign session ids (harness §8 IDOR).
      const record = await getSearchSession(session.user.id, parsed.data.id);
      if (!record) {
        return NextResponse.json(fail('NOT_FOUND', 'Session not found'), { status: 404 });
      }
      return NextResponse.json(ok(record), { headers: { 'Cache-Control': 'no-store' } });
    }

    const limit = Number(url.searchParams.get('limit') ?? '20');
    const cursor = url.searchParams.get('cursor') || null;
    const threaded = url.searchParams.get('threaded') === '1';

    const safeLimit = Number.isFinite(limit) && limit > 0 ? Math.min(limit, 50) : 20;

    const result = threaded
      ? await listThreadedSessions(session.user.id, { limit: safeLimit, cursor })
      : await listUserSearchSessions(session.user.id, { limit: safeLimit, cursor });

    return NextResponse.json(ok(result), { headers: { 'Cache-Control': 'no-store' } });
  } catch (error) {
    console.error('[search-history GET] error', error);
    return NextResponse.json(fail('INTERNAL_ERROR', 'Failed to load search history.'), { status: 500 });
  }
}

export async function DELETE(request: NextRequest) {
  try {
    let session;
    try {
      session = await requireSessionOrThrow();
    } catch {
      return NextResponse.json(fail('AUTH_REQUIRED', 'Authentication required'), { status: 401, headers: { 'Cache-Control': 'no-store' } });
    }

    const url = new URL(request.url);
    const id = url.searchParams.get('id');
    const parsed = idSchema.safeParse({ id: id ?? '' });
    if (!parsed.success) {
      return NextResponse.json(fail('VALIDATION_ERROR', 'Invalid session id'), { status: 400 });
    }

    // Ownership enforced (userId + id) — only soft-deletes the user's own rows.
    const deleted = await softDeleteSearchSession(session.user.id, parsed.data.id);
    if (!deleted) {
      return NextResponse.json(fail('NOT_FOUND', 'Session not found'), { status: 404 });
    }
    return NextResponse.json(ok({ deleted: true }), { headers: { 'Cache-Control': 'no-store' } });
  } catch (error) {
    return NextResponse.json(fail('INTERNAL_ERROR', 'Failed to delete search history.'), { status: 500 });
  }
}
