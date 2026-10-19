import { auth, isAuthApiError } from '@/lib/services/auth';
import { NextRequest, NextResponse } from 'next/server';
import {ok, fail, HTTP_STATUS} from '@/lib/utils/api-response';
import { handleError } from '@/lib/utils/errors';
import { logger } from '@/lib/infrastructure/logger';
import { rateLimit } from '@/lib/services/rate-limit';
import { getRequestIp } from '@/lib/utils/request-ip';
import { z } from 'zod';

const sendVerificationOtpSchema = z.object({
  email: z.string().email('Invalid email address'),
  type: z.enum(['email-verification', 'forget-password', 'change-email', 'sign-in']).optional(),
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

  const validation = sendVerificationOtpSchema.safeParse(body);
  if (!validation.success) {
    return NextResponse.json(fail('VALIDATION_ERROR', 'Invalid email address'), { status: HTTP_STATUS.BAD_REQUEST });
  }

  try {
    const data = await auth.api.sendVerificationOTP({
      body: {
        email: validation.data.email,
        type: validation.data.type || 'email-verification',
      },
    });
    return NextResponse.json(ok(data));
  } catch (error) {
    if (isAuthApiError(error) && error.statusCode < HTTP_STATUS.INTERNAL) {
      return NextResponse.json(fail('INTERNAL_ERROR', 'Failed to send verification code'), { status: HTTP_STATUS.BAD_REQUEST });
    }
    logger.error('[send-verification-otp] unexpected failure', error);
    const handled = handleError(error);
    return NextResponse.json(fail(handled.code ?? 'INTERNAL_ERROR', handled.message), { status: handled.statusCode });
  }
}
