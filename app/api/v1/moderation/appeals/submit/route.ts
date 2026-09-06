import { NextRequest, NextResponse } from 'next/server';
import { requireSessionOrThrow } from '@/modules/auth';
import {ok, fail, HTTP_STATUS} from '@/lib/utils/api-response';
import { submitAppeal } from '@/modules/appeals/actions';
import { rateLimit } from '@/lib/services/rate-limit';
import { logger } from '@/lib/infrastructure/logger';
import { z } from 'zod';

const submitAppealSchema = z.object({
  reason: z.string().min(1, 'reason is required').max(2000),
  reportId: z.string().optional(),
});

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

    const body = await request.json();
    const validation = submitAppealSchema.safeParse(body);
    if (!validation.success) {
      return NextResponse.json(fail('VALIDATION_ERROR', 'Invalid input', validation.error.issues), { status: HTTP_STATUS.BAD_REQUEST });
    }

    const { reason, reportId } = validation.data;

    const formData = new FormData();
    formData.append('reason', reason);
    if (reportId) {
      formData.append('reportId', reportId);
    }

    const result = await submitAppeal(formData);

    if (result.error) {
      return NextResponse.json(fail('INTERNAL_ERROR', result.error), { status: HTTP_STATUS.INTERNAL });
    }

    return NextResponse.json(ok({ appeal: { reason, reportId } }));
  } catch (error) {
    logger.error('[appeals/submit] POST failed', error);
    return NextResponse.json(fail('INTERNAL_ERROR', 'Failed to submit appeal'), {
      status: HTTP_STATUS.INTERNAL,
    });
  }
}
