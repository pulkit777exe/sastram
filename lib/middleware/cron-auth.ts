import { NextRequest, NextResponse } from 'next/server';
import crypto from 'crypto';

const HTTP_UNAUTHORIZED = 401;
const HTTP_SERVICE_UNAVAILABLE = 503;

/** Returns an error response when the request should be rejected, else null. */
export function verifyCronAuth(req: NextRequest): NextResponse | null {
  const cronSecret = process.env.CRON_SECRET;
  const authHeader = req.headers.get('authorization');

  if (cronSecret === undefined || cronSecret === null || cronSecret.length === 0) {
    // Unset in production means the endpoint is wide open — refuse to serve.
    if (process.env.NODE_ENV === 'production') {
      return NextResponse.json({ error: 'Server misconfiguration' }, { status: HTTP_SERVICE_UNAVAILABLE });
    }
    return null;
  }

  const expectedAuthHeader = `Bearer ${cronSecret}`;
  const unauthorizedResponse = NextResponse.json({ error: 'Unauthorized' }, { status: HTTP_UNAUTHORIZED });

  // timingSafeEqual throws on length mismatch, so that's checked first — the
  // length of a bearer token isn't itself a secret.
  if (authHeader === null || authHeader.length !== expectedAuthHeader.length) {
    return unauthorizedResponse;
  }

  const isValidToken = crypto.timingSafeEqual(Buffer.from(authHeader), Buffer.from(expectedAuthHeader));
  if (!isValidToken) {
    return unauthorizedResponse;
  }

  return null;
}
