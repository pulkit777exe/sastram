const FALLBACK_PATH = '/dashboard';
const INTERNAL_ORIGIN = 'https://sastram.internal';

/**
 * Returns a same-origin path or the fallback. Protocol-relative (`//evil.com`)
 * and backslash-normalized (`/\evil.com`) targets are rejected because a
 * browser treats them as absolute URLs, turning post-login redirects into an
 * open redirect.
 */
export function safeRedirectPath(
  candidate: string | null | undefined,
  fallback: string = FALLBACK_PATH
): string {
  if (candidate === null || candidate === undefined) return fallback;

  const value = candidate.trim();
  if (!value.startsWith('/') || value.startsWith('//')) return fallback;

  try {
    const url = new URL(value, INTERNAL_ORIGIN);
    if (url.origin !== INTERNAL_ORIGIN) return fallback;
    return `${url.pathname}${url.search}${url.hash}`;
  } catch {
    return fallback;
  }
}
