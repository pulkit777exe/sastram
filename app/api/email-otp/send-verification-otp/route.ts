import { auth } from '@/lib/services/auth';
import { NextRequest, NextResponse } from 'next/server';
import { ok, fail } from '@/lib/utils/api-response';
import { rateLimit } from '@/lib/services/rate-limit';
import { z } from 'zod';

const sendVerificationOtpSchema = z.object({
  email: z.string().email('Invalid email address'),
  type: z.enum(['email-verification', 'forget-password', 'change-email', 'sign-in']).optional(),
});

export async function POST(request: NextRequest) {
  const ip = request.headers.get('x-forwarded-for') ?? 'unknown';
  const rateLimitResult = await rateLimit({ key: ip, type: 'auth' });
  if (!rateLimitResult.success) {
    return NextResponse.json(fail('RATE_LIMITED', 'Too many requests. Please try again later.'), { status: 429 });
  }

  const body = await request.json();
  const validation = sendVerificationOtpSchema.safeParse(body);
  if (!validation.success) {
    return NextResponse.json(fail('VALIDATION_ERROR', 'Invalid email address'), { status: 400 });
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
    return NextResponse.json(fail('INTERNAL_ERROR', 'Failed to send verification code'), { status: 400 });
  }
}
