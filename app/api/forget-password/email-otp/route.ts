import { auth, isAuthApiError } from '@/lib/services/auth';
import { NextRequest, NextResponse } from 'next/server';
import {ok, fail, HTTP_STATUS} from '@/lib/utils/api-response';
import { handleError } from '@/lib/utils/errors';
import { rateLimit } from '@/lib/services/rate-limit';
import { logger } from '@/lib/infrastructure/logger';
import { getRequestIp } from '@/lib/utils/request-ip';
import { z } from 'zod';

const forgetPasswordOtpSchema = z.object({
  email: z.string().email('Invalid email address'),
});

export async function POST(request: NextRequest) {
  try {
    const ip = getRequestIp(request);
    const rateLimitResult = await rateLimit({ key: ip, type: 'auth' });
    if (!rateLimitResult.success) {
      return NextResponse.json(fail('RATE_LIMITED', 'Too many requests. Please try again later.'), { status: HTTP_STATUS.RATE_LIMITED });
    }

    const body = await request.json();
    const validation = forgetPasswordOtpSchema.safeParse(body);
    if (!validation.success) {
      return NextResponse.json(fail('VALIDATION_ERROR', 'Invalid email address'), { status: HTTP_STATUS.BAD_REQUEST });
    }

    const data = await auth.api.forgetPasswordEmailOTP({
      body: validation.data,
    });
    return NextResponse.json(ok(data));
  } catch (error) {
    if (isAuthApiError(error) && error.statusCode < HTTP_STATUS.INTERNAL) {
      return NextResponse.json(fail('INTERNAL_ERROR', 'Failed to send reset code'), { status: HTTP_STATUS.BAD_REQUEST });
    }
    logger.error('[forget-password:email-otp] unexpected failure', error);
    const handled = handleError(error);
    return NextResponse.json(fail(handled.code ?? 'INTERNAL_ERROR', handled.message), { status: handled.statusCode });
  }
}
