import { NextRequest, NextResponse } from 'next/server';
import { requireSessionOrThrow } from '@/modules/auth';
import { ok, fail, HTTP_STATUS, errorCodeToStatus } from '@/lib/utils/api-response';
import { submitAppeal } from '@/modules/appeals/actions';
import { rateLimit } from '@/lib/services/rate-limit';
import { logger } from '@/lib/infrastructure/logger';

export async function POST(request: NextRequest) {
  try {
    let session;
    try {
      session = await requireSessionOrThrow();
    } catch {
      return NextResponse.json(fail('AUTH_REQUIRED', 'Unauthorized'), { status: HTTP_STATUS.UNAUTHORIZED });
    }

    const rateLimitResult = await rateLimit({ key: `appeal:${session.user.id}`, type: 'api' });
    if (!rateLimitResult.success) {
      return NextResponse.json(fail('RATE_LIMITED', 'Too many requests. Please try again later.'), { status: HTTP_STATUS.RATE_LIMITED });
    }

    let body: { reason?: unknown; reportId?: unknown };
    try {
      body = await request.json();
    } catch {
      return NextResponse.json(fail('VALIDATION_ERROR', 'Invalid JSON body'), { status: HTTP_STATUS.BAD_REQUEST });
    }

    // No route-level schema: the Appeal module owns the invariant
    // (reason min 10, reportId cuid). Validation failures come back as
    // VALIDATION_ERROR and map to 400 below — never 500.
    const result = await submitAppeal({
      reason: typeof body.reason === 'string' ? body.reason : '',
      reportId: typeof body.reportId === 'string' ? body.reportId : undefined,
    });

    if (result.error) {
      const code = result.errorCode ?? 'INTERNAL_ERROR';
      return NextResponse.json(fail(code, result.error), { status: errorCodeToStatus(code) });
    }

    return NextResponse.json(ok({ appeal: { reason: body.reason, reportId: body.reportId ?? null } }));
  } catch (error) {
    logger.error('[appeals/submit] POST failed', error);
    return NextResponse.json(fail('INTERNAL_ERROR', 'Failed to submit appeal'), {
      status: HTTP_STATUS.INTERNAL,
    });
  }
}
