import { auth, isAuthApiError } from '@/lib/services/auth';
import { NextRequest, NextResponse } from 'next/server';
import {ok, fail, HTTP_STATUS} from '@/lib/utils/api-response';
import { handleError } from '@/lib/utils/errors';
import { logger } from '@/lib/infrastructure/logger';
import { rateLimit } from '@/lib/services/rate-limit';
import { getRequestIp } from '@/lib/utils/request-ip';
import { z } from 'zod';

const resetOtpSchema = z.object({
  email: z.string().email('Invalid email address'),
  otp: z.string().min(1, 'OTP is required'),
  password: z.string().min(8, 'Password must be at least 8 characters'),
});

export async function POST(request: NextRequest) {
  try {
    const ip = getRequestIp(request);
    const rateLimitResult = await rateLimit({ key: `otp-reset:${ip}`, type: 'auth' });
    if (!rateLimitResult.success) {
      return NextResponse.json(fail('RATE_LIMITED', 'Too many attempts. Please try again later.'), { status: HTTP_STATUS.RATE_LIMITED });
    }

    const body = await request.json();
    const validation = resetOtpSchema.safeParse(body);
    if (!validation.success) {
      return NextResponse.json(fail('VALIDATION_ERROR', 'Email, OTP, and password are required'), { status: HTTP_STATUS.BAD_REQUEST });
    }

    const data = await auth.api.resetPasswordEmailOTP({
      body: validation.data,
    });
    return NextResponse.json(ok(data));
  } catch (error) {
    if (isAuthApiError(error) && error.statusCode < HTTP_STATUS.INTERNAL) {
      return NextResponse.json(fail('VALIDATION_ERROR', 'Password reset failed'), { status: HTTP_STATUS.BAD_REQUEST });
    }
    logger.error('[reset-otp] unexpected failure', error);
    const handled = handleError(error);
    return NextResponse.json(fail(handled.code ?? 'INTERNAL_ERROR', handled.message), { status: handled.statusCode });
  }
}
