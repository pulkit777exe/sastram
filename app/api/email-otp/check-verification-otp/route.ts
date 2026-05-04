import { auth } from '@/lib/services/auth';
import { NextRequest, NextResponse } from 'next/server';

export async function POST(request: NextRequest) {
  try {
    const { email, otp, type } = await request.json();
    
    if (!email || !otp) {
      return NextResponse.json({ error: 'Email and OTP are required' }, { status: 400 });
    }

    const data = await auth.api.checkVerificationOTP({
      body: {
        email,
        type: type || 'sign-in',
        otp,
      },
    });
    return NextResponse.json(data, { status: 200 });
  } catch (error) {
    console.error('[check-verification-otp]', error);
    return NextResponse.json(
      { error: error instanceof Error ? error.message : 'Verification failed' },
      { status: 400 }
    );
  }
}
