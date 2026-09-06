import { NextRequest, NextResponse } from 'next/server';
import { ok, fail, HTTP_STATUS } from '@/lib/utils/api-response';
import { searchThreads, searchMessages, searchUsers } from '@/modules/search/repository';
import { requireSessionOrThrow } from '@/modules/auth';
import { logger } from '@/lib/infrastructure/logger';
import { rateLimit } from '@/lib/services/rate-limit';
import { AppError } from '@/lib/utils/errors';

async function authenticateRequest() {
  return requireSessionOrThrow();
}

async function checkRateLimitOrThrow(session: { user: { id: string } }): Promise<NextResponse | null> {
  const rateLimitResult = await rateLimit(`search:${session.user.id}`);
  if (!rateLimitResult.success) {
    return NextResponse.json(fail('RATE_LIMITED', 'Too many requests. Please try again later.'), { status: HTTP_STATUS.RATE_LIMITED });
  }
  return null;
}

function parseQueryParams(searchParams: URLSearchParams) {
  const rawQ = searchParams.get('q');
  const type = searchParams.get('type') || 'threads';
  const threadId = searchParams.get('threadId') || undefined;
  const rawLimit = Number(searchParams.get('limit') ?? NaN);
  const rawOffset = Number(searchParams.get('offset') ?? NaN);

  let limit: number;
  if (Number.isFinite(rawLimit) && rawLimit > 0) {
    limit = Math.min(Math.floor(rawLimit), 100);
  } else {
    limit = 20;
  }

  let offset: number;
  if (Number.isFinite(rawOffset) && rawOffset >= 0) {
    offset = Math.floor(rawOffset);
  } else {
    offset = 0;
  }

  return { q: rawQ, type, threadId, limit, offset };
}

function validateSearchParams(q: string | null, type: string): NextResponse | null {
  if (q === null || q.trim().length === 0) {
    return NextResponse.json(fail('VALIDATION_ERROR', 'Missing query parameter: q'), { status: HTTP_STATUS.BAD_REQUEST });
  }
  if (q.trim().length > 200) {
    return NextResponse.json(fail('VALIDATION_ERROR', 'Query too long (max 200 characters)'), { status: HTTP_STATUS.BAD_REQUEST });
  }
  if (!['threads', 'messages', 'users'].includes(type)) {
    return NextResponse.json(
      fail('VALIDATION_ERROR', `Invalid type: ${type}. Must be one of: threads, messages, users`),
      { status: HTTP_STATUS.BAD_REQUEST }
    );
  }
  return null;
}

async function handleSearchByType(
  type: string,
  q: string,
  threadId: string | undefined,
  limit: number,
  offset: number,
  session: { user: { id: string; role: unknown } }
) {
  if (type === 'threads') {
    const result = await searchThreads(q, limit, offset, undefined, session.user.id, session.user.role as never);
    return NextResponse.json(ok(result));
  }
  if (type === 'messages') {
    const result = await searchMessages(q, threadId, limit, offset, session.user.id, session.user.role as never);
    return NextResponse.json(ok(result));
  }
  if (type === 'users') {
    const result = await searchUsers(q, limit, offset);
    return NextResponse.json(ok(result));
  }
  return NextResponse.json(
    fail('VALIDATION_ERROR', `Invalid type: ${type}. Must be one of: threads, messages, users`),
    { status: HTTP_STATUS.BAD_REQUEST }
  );
}

export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url);
    const { q, type, threadId, limit, offset } = parseQueryParams(searchParams);

    const validationError = validateSearchParams(q, type);
    if (validationError) return validationError;

    const session = await authenticateRequest();

    const rateLimitError = await checkRateLimitOrThrow(session);
    if (rateLimitError) return rateLimitError;

    return handleSearchByType(type, q as string, threadId, limit, offset, session);
  } catch (error) {
    const isAuth = AppError.isAppError(error) && error.code === 'AUTH_REQUIRED';
    if (!isAuth) logger.error('[search] GET failed', error);
    let code: string;
    let msg: string;
    let status: number;
    if (isAuth) {
      code = 'AUTH_REQUIRED';
      msg = 'Unauthorized';
      status = HTTP_STATUS.UNAUTHORIZED;
    } else {
      code = 'INTERNAL_ERROR';
      msg = 'Search failed';
      status = HTTP_STATUS.INTERNAL;
    }
    return NextResponse.json(fail(code, msg), { status });
  }
}
