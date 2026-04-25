import { auth } from '@/lib/services/auth';
import { NextRequest, NextResponse } from 'next/server';
import { rateLimit } from '@/lib/rate-limit';

export async function POST(request: NextRequest) {
  const ip = request.headers.get('x-forwarded-for') ?? 'unknown';
  const rateLimitResult = await rateLimit(ip);
  if (!rateLimitResult.success) {
    return NextResponse.json(
      { error: 'Too many requests. Please try again later.' },
      { status: 429 }
    );
  }

  const { email } = await request.json();
  const data = await auth.api.forgetPasswordEmailOTP({
    body: {
      email,
    },
  });
  return NextResponse.json(data, { status: 200 });
}
