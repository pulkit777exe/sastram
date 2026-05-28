import { auth } from '@/lib/services/auth';
import { NextRequest, NextResponse } from 'next/server';
import { ok, fail } from '@/lib/utils/api-response';
import { logger } from '@/lib/infrastructure/logger';
import { z } from 'zod';

const resetOtpSchema = z.object({
  email: z.string().email('Invalid email address'),
  otp: z.string().min(1, 'OTP is required'),
  password: z.string().min(8, 'Password must be at least 8 characters'),
});

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const validation = resetOtpSchema.safeParse(body);
    if (!validation.success) {
      return NextResponse.json(fail('VALIDATION_ERROR', 'Email, OTP, and password are required'), { status: 400 });
    }

    const data = await auth.api.resetPasswordEmailOTP({
      body: validation.data,
    });
    return NextResponse.json(ok(data));
  } catch (error) {
    logger.error('[reset-otp]', error);
    return NextResponse.json(fail('VALIDATION_ERROR', 'Password reset failed'), { status: 400 });
  }
}
