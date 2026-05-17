import { auth } from '@/lib/services/auth';
import { NextRequest, NextResponse } from 'next/server';
import { rateLimit } from '@/lib/services/rate-limit';
import { z } from 'zod';

const sendVerificationOtpSchema = z.object({
  email: z.string().email('Invalid email address'),
  type: z.enum(['email-verification', 'forget-password', 'change-email', 'sign-in']).optional(),
});

export async function POST(request: NextRequest) {
  const ip = request.headers.get('x-forwarded-for') ?? 'unknown';
  const rateLimitResult = await rateLimit(ip);
  if (!rateLimitResult.success) {
    return NextResponse.json(
      { error: 'Too many requests. Please try again later.' },
      { status: 429 }
    );
  }

  const body = await request.json();
  const validation = sendVerificationOtpSchema.safeParse(body);
  if (!validation.success) {
    return NextResponse.json(
      { error: 'Invalid email address' },
      { status: 400 }
    );
  }

  try {
    const data = await auth.api.sendVerificationOTP({
      body: {
        email: validation.data.email,
        type: validation.data.type || 'email-verification',
      },
    });
    return NextResponse.json(data, { status: 200 });
  } catch (error) {
    return NextResponse.json(
      { error: 'Failed to send verification code' },
      { status: 400 }
    );
  }
}
