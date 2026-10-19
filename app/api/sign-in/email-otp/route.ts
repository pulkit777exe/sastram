import { auth, isAuthApiError } from '@/lib/services/auth';
import { NextRequest, NextResponse } from 'next/server';
import {ok, fail, HTTP_STATUS} from '@/lib/utils/api-response';
import { handleError } from '@/lib/utils/errors';
import { logger } from '@/lib/infrastructure/logger';
import { rateLimit } from '@/lib/services/rate-limit';
import { getRequestIp } from '@/lib/utils/request-ip';
import { z } from 'zod';

const signInOtpSchema = z.object({
  email: z.string().email('Invalid email address'),
  otp: z.string().min(1, 'OTP is required'),
});

export async function POST(request: NextRequest) {
  const ip = getRequestIp(request);
  const rateLimitResult = await rateLimit({ key: ip, type: 'auth' });
  if (!rateLimitResult.success) {
    return NextResponse.json(fail('RATE_LIMITED', 'Too many requests. Please try again later.'), { status: HTTP_STATUS.RATE_LIMITED });
  }

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json(fail('VALIDATION_ERROR', 'Invalid JSON body'), { status: HTTP_STATUS.BAD_REQUEST });
  }

  const validation = signInOtpSchema.safeParse(body);
  if (!validation.success) {
    return NextResponse.json(fail('VALIDATION_ERROR', 'Invalid input', validation.error.issues), { status: HTTP_STATUS.BAD_REQUEST });
  }

  try {
    const data = await auth.api.signInEmailOTP({
      body: validation.data,
    });
    return NextResponse.json(ok(data));
  } catch (error) {
    if (isAuthApiError(error) && error.statusCode < HTTP_STATUS.INTERNAL) {
      return NextResponse.json(fail('AUTH_REQUIRED', 'Invalid email or OTP'), { status: HTTP_STATUS.UNAUTHORIZED });
    }
    logger.error('[sign-in:email-otp] unexpected failure', error);
    const handled = handleError(error);
    return NextResponse.json(fail(handled.code ?? 'INTERNAL_ERROR', handled.message), { status: handled.statusCode });
  }
}
