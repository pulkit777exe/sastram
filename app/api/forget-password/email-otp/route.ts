import { auth } from '@/lib/services/auth';
import { NextRequest, NextResponse } from 'next/server';
import { ok, fail } from '@/lib/utils/api-response';
import { rateLimit } from '@/lib/services/rate-limit';
import { logger } from '@/lib/infrastructure/logger';
import { z } from 'zod';

const forgetPasswordOtpSchema = z.object({
  email: z.string().email('Invalid email address'),
});

export async function POST(request: NextRequest) {
  try {
    const ip = request.headers.get('x-forwarded-for') ?? 'unknown';
    const rateLimitResult = await rateLimit({ key: ip, type: 'auth' });
    if (!rateLimitResult.success) {
      return NextResponse.json(fail('RATE_LIMITED', 'Too many requests. Please try again later.'), { status: 429 });
    }

    const body = await request.json();
    const validation = forgetPasswordOtpSchema.safeParse(body);
    if (!validation.success) {
      return NextResponse.json(fail('VALIDATION_ERROR', 'Invalid email address'), { status: 400 });
    }

    const data = await auth.api.forgetPasswordEmailOTP({
      body: validation.data,
    });
    return NextResponse.json(ok(data));
  } catch (error) {
    logger.error('[forget-password:email-otp]', error);
    return NextResponse.json(fail('INTERNAL_ERROR', 'Failed to send reset code'), { status: 400 });
  }
}
