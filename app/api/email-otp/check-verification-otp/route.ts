import { auth } from '@/lib/services/auth';
import { NextRequest, NextResponse } from 'next/server';

export async function POST(request: NextRequest) {
  const { email, otp, type } = await request.json();
  const data = await auth.api.checkVerificationOTP({
    body: {
      email,
      type: type || 'sign-in',
      otp,
    },
  });
  return NextResponse.json(data, { status: 200 });
}
