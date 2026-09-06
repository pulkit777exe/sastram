const FALLBACK_IP = 'unknown';

/**
 * Shared IP extraction — Vercel free: x-forwarded-for + x-real-ip fallback.
 * Single seam for all rate-limit key building.
 */
export function getRequestIp(req: { headers: Headers }): string {
  const forwardedHeader = req.headers.get('x-forwarded-for');
  if (forwardedHeader !== null && forwardedHeader.length > 0) {
    const firstIp = forwardedHeader.split(',')[0]?.trim();
    if (firstIp !== undefined && firstIp.length > 0) return firstIp;
  }
  const realIpHeader = req.headers.get('x-real-ip');
  if (realIpHeader !== null) {
    const trimmedRealIp = realIpHeader.trim();
    if (trimmedRealIp.length > 0) return trimmedRealIp;
  }
  return FALLBACK_IP;
}
