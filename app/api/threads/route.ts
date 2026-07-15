import { NextRequest, NextResponse } from 'next/server';
import { listThreads } from '@/modules/threads/repository';
import { ok, fail } from '@/lib/utils/api-response';
import { requireSessionOrThrow } from '@/modules/auth/session';
import { logger } from '@/lib/infrastructure/logger';

export async function GET(request: NextRequest) {
  const requestId = request.headers.get('x-request-id') ?? '';

  try {
    const session = await requireSessionOrThrow();
    const threads = await listThreads({ memberUserId: session.user.id });
    return NextResponse.json(ok(threads, requestId));
  } catch (error) {
    const isAuth = error instanceof Error && error.message.includes('Unauthorized');
    if (!isAuth) logger.error('[threads] GET failed', error);
    return NextResponse.json(
      fail(isAuth ? 'AUTH_REQUIRED' : 'INTERNAL_ERROR', isAuth ? 'Unauthorized' : 'Failed to load threads', undefined, requestId),
      { status: isAuth ? 401 : 500 }
    );
  }
}
