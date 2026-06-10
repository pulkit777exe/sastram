import { NextRequest, NextResponse } from 'next/server';
import crypto from 'crypto';

export function verifyCronAuth(req: NextRequest): NextResponse | null {
  const secret = process.env.CRON_SECRET;
  const authHeader = req.headers.get('authorization');

  if (!secret) {
    if (process.env.NODE_ENV === 'production') {
      return NextResponse.json({ error: 'Server misconfiguration' }, { status: 503 });
    }
    return null;
  }

  const expected = `Bearer ${secret}`;
  if (!authHeader || authHeader.length !== expected.length) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const a = Buffer.from(authHeader);
  const b = Buffer.from(expected);
  if (!crypto.timingSafeEqual(a, b)) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  return null;
}
