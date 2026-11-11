import { NextRequest, NextResponse } from 'next/server';
import { ok, fail, HTTP_STATUS } from '@/lib/utils/api-response';
import { searchThreads, searchMessages, searchUsers } from '@/modules/search/repository';
import { getSession } from '@/modules/auth';
import { logger } from '@/lib/infrastructure/logger';
import { rateLimit } from '@/lib/services/rate-limit';
import { getRequestIp } from '@/lib/utils/request-ip';

async function checkRateLimitOrThrow(key: string): Promise<NextResponse | null> {
  const rateLimitResult = await rateLimit(`search:${key}`);
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

function validateSearchParams(q: string | null, type: string, threadId?: string): NextResponse | null {
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
  if (threadId !== undefined && threadId !== null && threadId !== '' && !/^c[a-z0-9]{24}$/.test(threadId)) {
    return NextResponse.json(fail('VALIDATION_ERROR', 'Invalid threadId'), { status: HTTP_STATUS.BAD_REQUEST });
  }
  return null;
}

async function handleSearchByType(
  type: string,
  q: string,
  threadId: string | undefined,
  limit: number,
  offset: number,
  viewer: { id: string; role: unknown } | null
) {
  if (type === 'threads') {
    const result = await searchThreads(q, limit, offset, undefined, viewer?.id, viewer?.role as never);
    return NextResponse.json(ok(result));
  }
  if (type === 'messages') {
    const result = await searchMessages(q, threadId, limit, offset, viewer?.id, viewer?.role as never);
    return NextResponse.json(ok(result));
  }
  if (type === 'users') {
    const result = await searchUsers(q, limit, offset, viewer?.id);
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

    const validationError = validateSearchParams(q, type, threadId);
    if (validationError) return validationError;

    const session = await getSession();
    const viewer = session?.user ? { id: session.user.id, role: session.user.role } : null;
    const rateKey = viewer?.id ?? getRequestIp(request);

    const rateLimitError = await checkRateLimitOrThrow(rateKey);
    if (rateLimitError) return rateLimitError;

    return handleSearchByType(type, q as string, threadId, limit, offset, viewer);
  } catch (error) {
    logger.error('[search] GET failed', error);
    return NextResponse.json(fail('INTERNAL_ERROR', 'Search failed'), { status: HTTP_STATUS.INTERNAL });
  }
}
