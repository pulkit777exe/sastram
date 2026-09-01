import { NextRequest, NextResponse } from 'next/server';
import { ok, fail } from '@/lib/utils/api-response';
import { searchThreads, searchMessages, searchUsers } from '@/modules/search/repository';
import { requireSessionOrThrow } from '@/modules/auth';
import { logger } from '@/lib/infrastructure/logger';
import { rateLimit } from '@/lib/services/rate-limit';
import { AppError } from '@/lib/utils/errors';

export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url);
    const q = searchParams.get('q');
    const type = searchParams.get('type') || 'threads';
    const threadId = searchParams.get('threadId') || undefined;
    const rawLimit = Number(searchParams.get('limit'));
    const rawOffset = Number(searchParams.get('offset'));
    const limit = Math.min(Number.isFinite(rawLimit) && rawLimit > 0 ? Math.floor(rawLimit) : 20, 100);
    const offset = Number.isFinite(rawOffset) && rawOffset >= 0 ? Math.floor(rawOffset) : 0;

    if (!q || q.trim().length === 0) {
      return NextResponse.json(fail('VALIDATION_ERROR', 'Missing query parameter: q'), { status: 400 });
    }

    if (q.trim().length > 200) {
      return NextResponse.json(fail('VALIDATION_ERROR', 'Query too long (max 200 characters)'), { status: 400 });
    }

    if (!['threads', 'messages', 'users'].includes(type)) {
      return NextResponse.json(
        fail('VALIDATION_ERROR', `Invalid type: ${type}. Must be one of: threads, messages, users`),
        { status: 400 }
      );
    }

    const session = await requireSessionOrThrow();

    const rateLimitResult = await rateLimit(`search:${session.user.id}`);
    if (!rateLimitResult.success) {
      return NextResponse.json(fail('RATE_LIMITED', 'Too many requests. Please try again later.'), { status: 429 });
    }

    switch (type) {
      case 'threads': {
        const result = await searchThreads(q, limit, offset, undefined, session.user.id, session.user.role);
        return NextResponse.json(ok(result));
      }
      case 'messages': {
        const result = await searchMessages(q, threadId, limit, offset, session.user.id, session.user.role);
        return NextResponse.json(ok(result));
      }
      case 'users': {
        const result = await searchUsers(q, limit, offset);
        return NextResponse.json(ok(result));
      }
      default:
        return NextResponse.json(
          fail('VALIDATION_ERROR', `Invalid type: ${type}. Must be one of: threads, messages, users`),
          { status: 400 }
        );
    }
  } catch (error) {
    const isAuth = AppError.isAppError(error) && error.code === 'AUTH_REQUIRED';
    if (!isAuth) logger.error('[search] GET failed', error);
    return NextResponse.json(
      fail(isAuth ? 'AUTH_REQUIRED' : 'INTERNAL_ERROR', isAuth ? 'Unauthorized' : 'Search failed'),
      { status: isAuth ? 401 : 500 }
    );
  }
}
