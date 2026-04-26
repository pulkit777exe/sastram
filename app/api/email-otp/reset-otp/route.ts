import { auth } from '@/lib/services/auth';
import { NextRequest, NextResponse } from 'next/server';

export async function POST(request: NextRequest) {
  try {
    const { email, otp, password } = await request.json();

    if (!email || !otp || !password) {
      return NextResponse.json({ error: 'Email, OTP, and password are required' }, { status: 400 });
    }

    const data = await auth.api.resetPasswordEmailOTP({
      body: {
        email,
        otp,
        password,
      },
    });
    return NextResponse.json(data, { status: 200 });
  } catch (error) {
    console.error('[reset-otp]', error);
    return NextResponse.json(
      { error: error instanceof Error ? error.message : 'Password reset failed' },
      { status: 400 }
    );
  }
}
