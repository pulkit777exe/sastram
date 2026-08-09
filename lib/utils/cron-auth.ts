import { NextRequest, NextResponse } from 'next/server';
import crypto from 'crypto';

/** Returns an error response when the request should be rejected, else null. */
export function verifyCronAuth(req: NextRequest): NextResponse | null {
  const secret = process.env.CRON_SECRET;
  const authHeader = req.headers.get('authorization');

  if (!secret) {
    // Unset in production means the endpoint is wide open — refuse to serve.
    if (process.env.NODE_ENV === 'production') {
      return NextResponse.json({ error: 'Server misconfiguration' }, { status: 503 });
    }
    return null;
  }

  const expected = `Bearer ${secret}`;
  const unauthorized = NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  // timingSafeEqual throws on length mismatch, so that's checked first — the
  // length of a bearer token isn't itself a secret.
  if (!authHeader || authHeader.length !== expected.length) {
    return unauthorized;
  }

  if (!crypto.timingSafeEqual(Buffer.from(authHeader), Buffer.from(expected))) {
    return unauthorized;
  }

  return null;
}
