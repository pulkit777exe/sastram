/**
 * Shared IP extraction — Vercel free: x-forwarded-for + x-real-ip fallback.
 * Single seam for all rate-limit key building.
 */
export function getRequestIp(req: { headers: Headers }): string {
  const forwarded = req.headers.get('x-forwarded-for');
  if (forwarded) {
    const first = forwarded.split(',')[0]?.trim();
    if (first) return first;
  }
  const realIp = req.headers.get('x-real-ip')?.trim();
  if (realIp) return realIp;
  return 'unknown';
}
