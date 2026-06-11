import { auth } from '@/lib/services/auth';
import { NextRequest, NextResponse } from 'next/server';
import { ok, fail } from '@/lib/utils/api-response';
import { logger } from '@/lib/infrastructure/logger';
import { rateLimit } from '@/lib/services/rate-limit';
import { z } from 'zod';

const checkVerificationOtpSchema = z.object({
  email: z.string().email('Invalid email address'),
  otp: z.string().min(1, 'OTP is required'),
  type: z.enum(['email-verification', 'forget-password', 'change-email', 'sign-in']).optional(),
});

export async function POST(request: NextRequest) {
  try {
    const ip = request.headers.get('x-forwarded-for')?.split(',')[0]?.trim() ?? 'unknown';
    const rateLimitResult = await rateLimit({ key: `otp-check:${ip}`, type: 'auth' });
    if (!rateLimitResult.success) {
      return NextResponse.json(fail('RATE_LIMITED', 'Too many attempts. Please try again later.'), { status: 429 });
    }

    const body = await request.json();
    const validation = checkVerificationOtpSchema.safeParse(body);
    if (!validation.success) {
      return NextResponse.json(fail('VALIDATION_ERROR', 'Email and OTP are required'), { status: 400 });
    }

    const data = await auth.api.checkVerificationOTP({
      body: {
        ...validation.data,
        type: validation.data.type || 'sign-in',
      },
    });
    return NextResponse.json(ok(data));
  } catch (error) {
    logger.error('[check-verification-otp]', error);
    return NextResponse.json(fail('VALIDATION_ERROR', 'Verification failed'), { status: 400 });
  }
}
