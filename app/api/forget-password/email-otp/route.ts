import { auth } from '@/lib/services/auth';
import { NextRequest, NextResponse } from 'next/server';
import { rateLimit } from '@/lib/rate-limit';

export async function POST(request: NextRequest) {
  try {
    const ip = request.headers.get('x-forwarded-for') ?? 'unknown';
    const rateLimitResult = await rateLimit(ip);
    if (!rateLimitResult.success) {
      return NextResponse.json(
        { error: 'Too many requests. Please try again later.' },
        { status: 429 }
      );
    }

    const { email } = await request.json();

    if (!email) {
      return NextResponse.json({ error: 'Email is required' }, { status: 400 });
    }

    const data = await auth.api.forgetPasswordEmailOTP({
      body: {
        email,
      },
    });
    return NextResponse.json(data, { status: 200 });
  } catch (error) {
    console.error('[forget-password:email-otp]', error);
    return NextResponse.json(
      { error: error instanceof Error ? error.message : 'Failed to send reset code' },
      { status: 400 }
    );
  }
}
