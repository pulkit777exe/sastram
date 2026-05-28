import { auth } from '@/lib/services/auth';
import { NextRequest, NextResponse } from 'next/server';
import { ok, fail } from '@/lib/utils/api-response';
import { logger } from '@/lib/infrastructure/logger';
import { z } from 'zod';

const checkVerificationOtpSchema = z.object({
  email: z.string().email('Invalid email address'),
  otp: z.string().min(1, 'OTP is required'),
  type: z.enum(['email-verification', 'forget-password', 'change-email', 'sign-in']).optional(),
});

export async function POST(request: NextRequest) {
  try {
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
