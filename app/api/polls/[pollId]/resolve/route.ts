import { NextRequest, NextResponse } from 'next/server';
import { requireSessionOrThrow } from '@/modules/auth';
import { ok, fail, withErrorHandling, HTTP_STATUS, errorCodeToStatus } from '@/lib/utils/api-response';
import { resolveMarketPollAction } from '@/modules/polls/actions';
import { rateLimit } from '@/lib/services/rate-limit';

export const POST = withErrorHandling(async (request: NextRequest, context?: { params: Promise<Record<string, string>> }) => {
  const session = await requireSessionOrThrow();
  const { success } = await rateLimit({ key: `poll-resolve:${session.user.id}`, type: 'api' });
  if (!success) return NextResponse.json(fail('RATE_LIMITED', 'Too many resolve attempts'), { status: HTTP_STATUS.RATE_LIMITED });

  const params = await context?.params;
  const pollId = params?.pollId;
  if (!pollId) return NextResponse.json(fail('BAD_REQUEST', 'pollId required'), { status: HTTP_STATUS.BAD_REQUEST });

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json(fail('VALIDATION_ERROR', 'Invalid JSON body'), { status: HTTP_STATUS.BAD_REQUEST });
  }
  const resolvedOptionIndex = (body as { resolvedOptionIndex?: unknown }).resolvedOptionIndex;

  // The Poll Market resolve invariant (existence, market-ness, active,
  // bounds, manage rights) lives in the action — this route owns transport
  // only. Shape failures come back VALIDATION_ERROR (400), never 500.
  const result = await resolveMarketPollAction({ pollId, resolvedOptionIndex: resolvedOptionIndex as number });
  if (!result.ok) {
    const code = result.errorCode ?? 'INTERNAL_ERROR';
    return NextResponse.json(fail(code, result.error ?? 'Failed to resolve poll'), {
      status: errorCodeToStatus(code),
    });
  }
  return NextResponse.json(ok(result.data));
});
