import { NextRequest, NextResponse } from 'next/server';
import { ok, fail, HTTP_STATUS } from '@/lib/utils/api-response';
import { z } from 'zod';
import { requireSessionOrThrow } from '@/modules/auth';
import { logger } from '@/lib/infrastructure/logger';
import { AppError } from '@/lib/utils/errors';
import {
  listThreadedSessions,
  listUserSearchSessions,
  getSearchSession,
  softDeleteSearchSession,
} from '@/modules/ai-search/repository';

export const maxDuration = 30;

const idSchema = z.object({ id: z.string().min(1) });

async function authenticateRequest() {
  return requireSessionOrThrow();
}

function parseListParams(url: URL) {
  const rawLimit = url.searchParams.get('limit');
  const limitRaw = rawLimit ?? '20';
  const limit = Number(limitRaw);

  const rawCursor = url.searchParams.get('cursor');
  let cursor: string | null;
  if (rawCursor !== null && rawCursor !== '') {
    cursor = rawCursor;
  } else {
    cursor = null;
  }

  const rawThreaded = url.searchParams.get('threaded');
  const threaded = rawThreaded === '1';

  let safeLimit: number;
  if (Number.isFinite(limit) && limit > 0) {
    if (limit > 50) {
      safeLimit = 50;
    } else {
      safeLimit = limit;
    }
  } else {
    safeLimit = 20;
  }

  return { safeLimit, cursor, threaded };
}

function handleAuthError(error: unknown): NextResponse | null {
  if (AppError.isAppError(error) && error.code === 'AUTH_REQUIRED') {
    return NextResponse.json(fail('AUTH_REQUIRED', 'Authentication required'), {
      status: HTTP_STATUS.UNAUTHORIZED,
      headers: { 'Cache-Control': 'no-store' },
    });
  }
  return null;
}

export async function GET(request: NextRequest) {
  try {
    const session = await authenticateRequest();

    const url = new URL(request.url);
    const rawSingle = url.searchParams.get('id');
    let single: string | null;
    if (rawSingle !== null && rawSingle !== '') {
      single = rawSingle;
    } else {
      single = null;
    }

    if (single !== null) {
      const parsed = idSchema.safeParse({ id: single });
      if (!parsed.success) {
        return NextResponse.json(fail('VALIDATION_ERROR', 'Invalid session id'), { status: HTTP_STATUS.BAD_REQUEST });
      }
      const record = await getSearchSession(session.user.id, parsed.data.id);
      if (!record) {
        return NextResponse.json(fail('NOT_FOUND', 'Session not found'), { status: HTTP_STATUS.NOT_FOUND });
      }
      return NextResponse.json(ok(record), { headers: { 'Cache-Control': 'no-store' } });
    }

    const { safeLimit, cursor, threaded } = parseListParams(url);

    let result;
    if (threaded) {
      result = await listThreadedSessions(session.user.id, { limit: safeLimit, cursor });
    } else {
      result = await listUserSearchSessions(session.user.id, { limit: safeLimit, cursor });
    }

    return NextResponse.json(ok(result), { headers: { 'Cache-Control': 'no-store' } });
  } catch (error) {
    const authResponse = handleAuthError(error);
    if (authResponse) return authResponse;
    logger.error('[search-history GET]', error);
    return NextResponse.json(fail('INTERNAL_ERROR', 'Failed to load search history.'), { status: HTTP_STATUS.INTERNAL });
  }
}

export async function DELETE(request: NextRequest) {
  try {
    const session = await authenticateRequest();

    const url = new URL(request.url);
    const rawId = url.searchParams.get('id');
    let idForValidation: string;
    if (rawId !== null) {
      idForValidation = rawId;
    } else {
      idForValidation = '';
    }

    const parsed = idSchema.safeParse({ id: idForValidation });
    if (!parsed.success) {
      return NextResponse.json(fail('VALIDATION_ERROR', 'Invalid session id'), { status: HTTP_STATUS.BAD_REQUEST });
    }

    const deleted = await softDeleteSearchSession(session.user.id, parsed.data.id);
    if (!deleted) {
      return NextResponse.json(fail('NOT_FOUND', 'Session not found'), { status: HTTP_STATUS.NOT_FOUND });
    }
    return NextResponse.json(ok({ deleted: true }), { headers: { 'Cache-Control': 'no-store' } });
  } catch (error) {
    const authResponse = handleAuthError(error);
    if (authResponse) return authResponse;
    return NextResponse.json(fail('INTERNAL_ERROR', 'Failed to delete search history.'), { status: HTTP_STATUS.INTERNAL });
  }
}
