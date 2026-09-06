import { NextRequest, NextResponse } from 'next/server';
import { listThreads } from '@/modules/threads/repository';
import { ok, fail, HTTP_STATUS } from '@/lib/utils/api-response';
import { requireSessionOrThrow } from '@/modules/auth';
import { logger } from '@/lib/infrastructure/logger';
import { AppError } from '@/lib/utils/errors';

export async function GET(request: NextRequest) {
  const requestId = request.headers.get('x-request-id') ?? '';

  try {
    const session = await authenticateRequest();
    const threads = await handleListThreads(session);
    return NextResponse.json(ok(threads, requestId));
  } catch (error) {
    const isAuth = AppError.isAppError(error) && error.code === 'AUTH_REQUIRED';
    if (!isAuth) logger.error('[threads] GET failed', error);
    let code: string;
    let message: string;
    let status: number;
    if (isAuth) {
      code = 'AUTH_REQUIRED';
      message = 'Unauthorized';
      status = HTTP_STATUS.UNAUTHORIZED;
    } else {
      code = 'INTERNAL_ERROR';
      message = 'Failed to load threads';
      status = HTTP_STATUS.INTERNAL;
    }
    return NextResponse.json(fail(code, message, undefined, requestId), { status });
  }
}

async function authenticateRequest() {
  return requireSessionOrThrow();
}

async function handleListThreads(session: Awaited<ReturnType<typeof requireSessionOrThrow>>) {
  return listThreads({
    memberUserId: session.user.id,
    memberRole: session.user.role,
  });
}
