import type { NextRequest } from 'next/server';
import { NextResponse } from 'next/server';
import { env } from '@/lib/config/env';
import { rateLimit } from '@/lib/services/rate-limit';

const PUBLIC_PATHS = [
  '/',
  '/pricing',
  '/terms',
  '/login',
  '/forgot-password',
  '/api-docs',
  '/banned',
  '/api/auth',
  '/api/email-otp',
  '/api/sign-in',
  '/api/forget-password',
  '/api/cron',
];

function isPublicPath(pathname: string): boolean {
  return PUBLIC_PATHS.some((path) => {
    if (path === '/') {
      return pathname === '/';
    }
    return pathname === path || pathname.startsWith(`${path}/`);
  });
}

function isPublicThreadPath(pathname: string): boolean {
  const segments = pathname.split('/').filter(Boolean);
  return segments.length === 2;
}

const isProd = process.env.NODE_ENV === 'production';

// Whether to send the CSP as Report-Only (observe violations, don't block).
// Defaults to Report-Only so the nonce can be validated against real traffic
// via /api/csp-report before flipping to enforcing (CSP_REPORT_ONLY=false).
// The one Next.js bootstrap inline script currently lacks the nonce and will
// show as a violation under Report-Only but still executes; address before
// enforcing (see docs/BACKLOG.md O1a).
const CSP_REPORT_ONLY = process.env.CSP_REPORT_ONLY !== 'false';

function buildCsp(nonce: string): string {
  return [
    "default-src 'self'",
    // Nonce-based script-src: drop 'unsafe-inline' so injected scripts without the
    // per-request nonce are blocked (mitigates XSS). Next.js tags its own inline
    // framework scripts with this nonce automatically.
    `script-src-elem 'self' 'nonce-${nonce}'${isProd ? '' : " 'unsafe-eval'"} https://va.vercel-scripts.com https://cdn.jsdelivr.net https://cdnjs.cloudflare.com`,
    `script-src 'self' 'nonce-${nonce}'${isProd ? '' : " 'unsafe-eval'"} https://va.vercel-scripts.com https://cdn.jsdelivr.net https://cdnjs.cloudflare.com`,
    "style-src 'self' 'unsafe-inline' https://fonts.googleapis.com",
    "img-src 'self' data: blob: https: http:",
    "connect-src 'self' https://api.gemini.google.com https://api.openai.com https://api.exa.ai https://api.tavily.com https://*.upstash.io wss: ws:",
    "font-src 'self' data: https://fonts.gstatic.com",
    "frame-ancestors 'none'",
    "base-uri 'self'",
    "form-action 'self'",
    "upgrade-insecure-requests",
    'report-uri /api/csp-report',
  ].join('; ');
}

const SECURITY_HEADERS: Record<string, string> = {
  'X-Frame-Options': 'DENY',
  'X-Content-Type-Options': 'nosniff',
  'Referrer-Policy': 'strict-origin-when-cross-origin',
  'X-DNS-Prefetch-Control': 'off',
  'Permissions-Policy': 'camera=(), microphone=(), geolocation=(), payment=()',
};

const PRODUCTION_HEADERS = {
  'Strict-Transport-Security': 'max-age=63072000; includeSubDomains; preload',
};

function getClientIp(request: NextRequest): string {
  const forwarded = request.headers.get('x-forwarded-for');
  if (forwarded) return forwarded.split(',')[0]?.trim() ?? 'unknown';
  const cfIp = request.headers.get('cf-connecting-ip');
  if (cfIp) return cfIp;
  const realIp = request.headers.get('x-real-ip');
  if (realIp) return realIp;
  return 'unknown';
}

function applySecurityHeaders(response: NextResponse, nonce: string): NextResponse {
  for (const [key, value] of Object.entries(SECURITY_HEADERS)) {
    response.headers.set(key, value);
  }
  const csp = buildCsp(nonce);
  response.headers.set(
    CSP_REPORT_ONLY ? 'Content-Security-Policy-Report-Only' : 'Content-Security-Policy',
    csp
  );
  if (env.NODE_ENV === 'production') {
    for (const [key, value] of Object.entries(PRODUCTION_HEADERS)) {
      response.headers.set(key, value);
    }
  }
  return response;
}

export default async function proxy(request: NextRequest) {
  const { pathname, search } = request.nextUrl;
  const requestId = request.headers.get('x-request-id') ?? crypto.randomUUID();
  const nonce = crypto.randomUUID().replace(/-/g, '');

  const isPublic = isPublicPath(pathname);
  const sessionCookie = request.cookies.get('better-auth.session_token');

  if (!sessionCookie && !isPublic && !isPublicThreadPath(pathname)) {
    const loginUrl = new URL('/login', request.url);
    loginUrl.searchParams.set('reason', 'unauthorized');
    loginUrl.searchParams.set('redirect', `${pathname}${search}`);
    const response = NextResponse.redirect(loginUrl);
    response.headers.set('x-request-id', requestId);
    return applySecurityHeaders(response, nonce);
  }

  if (sessionCookie && pathname === '/login') {
    const response = NextResponse.redirect(new URL('/dashboard', request.url));
    response.headers.set('x-request-id', requestId);
    return applySecurityHeaders(response, nonce);
  }

  if (!isPublic && env.RATE_LIMIT_ENABLED) {
    const ip = getClientIp(request);
    const key = `proxy:${ip}:${pathname}`;
    const { success } = await rateLimit({ key, type: 'api' });
    if (!success) {
      const response = NextResponse.json({ error: 'Too Many Requests' }, { status: 429 });
      response.headers.set('x-request-id', requestId);
      return applySecurityHeaders(response, nonce);
    }
  }

  const unsafeMethods = ['POST', 'PUT', 'DELETE', 'PATCH'];
  if (unsafeMethods.includes(request.method)) {
    const origin = request.headers.get('origin');
    const referer = request.headers.get('referer');
    const appUrl = new URL(env.NEXT_PUBLIC_APP_URL);

    const checkOrigin = (headerValue: string | null): boolean => {
      if (!headerValue) return true;
      try {
        const headerUrl = new URL(headerValue);
        return headerUrl.host === appUrl.host;
      } catch {
        return false;
      }
    };

    if (origin && !checkOrigin(origin)) {
      return NextResponse.json(
        { error: 'CSRF validation failed: Origin mismatch' },
        { status: 403 }
      );
    }

    if (!origin && referer && !checkOrigin(referer)) {
      return NextResponse.json(
        { error: 'CSRF validation failed: Referer mismatch' },
        { status: 403 }
      );
    }
  }

  const requestHeaders = new Headers(request.headers);
  requestHeaders.set('x-request-id', requestId);
  // Forward the nonce to Next.js so it can tag its inline framework scripts.
  requestHeaders.set('x-csp-nonce', nonce);

  let response = NextResponse.next({ request: { headers: requestHeaders } });
  response.headers.set('x-request-id', requestId);
  response = applySecurityHeaders(response, nonce);
  return response;
}

export const config = {
  matcher: ['/((?!_next/static|_next/image|favicon.ico|robots.txt|sitemap.xml).*)'],
};
