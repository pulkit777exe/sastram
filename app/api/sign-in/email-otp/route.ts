import { auth } from '@/lib/services/auth';
import { NextRequest, NextResponse } from 'next/server';
import { ok, fail } from '@/lib/utils/api-response';
import { rateLimit } from '@/lib/services/rate-limit';
import { z } from 'zod';

const signInOtpSchema = z.object({
  email: z.string().email('Invalid email address'),
  otp: z.string().min(1, 'OTP is required'),
});

export async function POST(request: NextRequest) {
  const ip = request.headers.get('x-forwarded-for') ?? 'unknown';
  const rateLimitResult = await rateLimit(ip);
  if (!rateLimitResult.success) {
    return NextResponse.json(fail('RATE_LIMITED', 'Too many requests. Please try again later.'), { status: 429 });
  }

  const body = await request.json();
  const validation = signInOtpSchema.safeParse(body);
  if (!validation.success) {
    return NextResponse.json(fail('VALIDATION_ERROR', 'Invalid input', validation.error.issues), { status: 400 });
  }

  try {
    const data = await auth.api.signInEmailOTP({
      body: validation.data,
    });
    return NextResponse.json(ok(data));
  } catch (error) {
    return NextResponse.json(fail('AUTH_REQUIRED', 'Invalid email or OTP'), { status: 401 });
  }
}
