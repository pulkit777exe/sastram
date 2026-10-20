const FALLBACK_IP = 'unknown';

/**
 * Shared IP extraction for rate-limit keys.
 *
 * Prefer the platform-authored `x-real-ip`. If only `x-forwarded-for` is
 * present, use the right-most hop: that address was appended by the trusted
 * proxy, while the left-most value is client-controlled and lets a caller
 * rotate rate-limit buckets at will.
 */
export function getRequestIp(req: { headers: Headers }): string {
  const realIpHeader = req.headers.get('x-real-ip');
  if (realIpHeader !== null) {
    const trimmedRealIp = realIpHeader.trim();
    if (trimmedRealIp.length > 0) return trimmedRealIp;
  }

  const forwardedHeader = req.headers.get('x-forwarded-for');
  if (forwardedHeader !== null && forwardedHeader.length > 0) {
    const hops = forwardedHeader
      .split(',')
      .map((hop) => hop.trim())
      .filter((hop) => hop.length > 0);
    const nearestProxyIp = hops[hops.length - 1];
    if (nearestProxyIp !== undefined) return nearestProxyIp;
  }

  return FALLBACK_IP;
}
