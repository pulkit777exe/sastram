import { HTTP_STATUS } from '@/lib/utils/api-response';
import type { NextRequest } from 'next/server';
import { NextResponse } from 'next/server';
import { getEnv } from '@/lib/config/env';
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
  '/api/health',
  '/api/csp-report',
  '/api/jobs',
  '/api/link-preview',
  '/api/upload',
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
  return /^\/dashboard\/threads\/[^/]+$/.test(pathname);
}

const isProd = process.env.NODE_ENV === 'production';
// Enforce in prod (isProd ? false : true), allow explicit override via CSP_REPORT_ONLY env
const CSP_REPORT_ONLY = isProd ? process.env.CSP_REPORT_ONLY === 'true' : process.env.CSP_REPORT_ONLY !== 'false';

function buildCsp(nonce: string): string {
  const scriptParts = ["'self'", `'nonce-${nonce}'`];
  if (!isProd) {
    // In dev, allow unsafe-inline/eval for HMR and Next.js chunks that don't carry nonce
    scriptParts.push("'unsafe-inline'", "'unsafe-eval'", 'http://localhost:3000', 'http://192.168.1.222:3000', 'ws://localhost:3000', 'ws://192.168.1.222:3000');
  }
  scriptParts.push("https://va.vercel-scripts.com");
  const strictScript = scriptParts.join(' ');
  // In dev, keep unsafe-inline for Next.js; strict-dynamic is for prod trusted chain.
  const scriptSrcElem = isProd
    ? `script-src-elem ${strictScript} 'strict-dynamic'`
    : `script-src-elem ${strictScript}`;
  const scriptSrc = isProd
    ? `script-src ${strictScript} 'strict-dynamic'`
    : `script-src ${strictScript}`;
  return [
    "default-src 'self'",
    scriptSrcElem,
    scriptSrc,
    "style-src 'self' 'unsafe-inline' https://fonts.googleapis.com",
    "img-src 'self' data: blob: https://*.blob.vercel-storage.com https://lh3.googleusercontent.com https://*.googleusercontent.com",
    "connect-src 'self' http://localhost:3000 ws://localhost:3000 https://api.gemini.google.com https://api.openai.com https://api.exa.ai https://api.tavily.com https://*.upstash.io",
    "font-src 'self' data: https://fonts.gstatic.com",
    "frame-ancestors 'none'",
    "base-uri 'self'",
    "form-action 'self'",
    ...(isProd ? ["upgrade-insecure-requests"] : []),
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
  if (forwarded) {
    const parts = forwarded.split(',');
    const first = parts[0];
    if (first) {
      const trimmed = first.trim();
      if (trimmed) return trimmed;
    }
    return 'unknown';
  }
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
  const envValues = getEnv();
  if (envValues.NODE_ENV === 'production') {
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

  // NOTE: The /login → /dashboard redirect was removed because proxy.ts
  // only checks cookie existence, not session validity. When a session
  // expires in the DB but the cookie persists, this caused an infinite
  // redirect loop: proxy sends /login → /dashboard, layout sends
  // /dashboard → /login. The login page now handles the redirect
  // server-side via getSession().

  if (!isPublic && getEnv().RATE_LIMIT_ENABLED) {
    const ip = getClientIp(request);
    const key = `proxy:${ip}:${pathname}`;
    const { success } = await rateLimit({ key, type: 'api' });
    if (!success) {
      const response = NextResponse.json({ error: 'Too Many Requests' }, { status: HTTP_STATUS.RATE_LIMITED });
      response.headers.set('x-request-id', requestId);
      return applySecurityHeaders(response, nonce);
    }
  }

  const unsafeMethods = ['POST', 'PUT', 'DELETE', 'PATCH'];
  // Exempt QStash webhook (no Origin) — it has its own timingSafe signature verification
  const isQStashWebhook = pathname === '/api/jobs';
  if (unsafeMethods.includes(request.method) && !isQStashWebhook) {
    const origin = request.headers.get('origin');
    const referer = request.headers.get('referer');
    const appUrl = new URL(getEnv().NEXT_PUBLIC_APP_URL);

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
        { status: HTTP_STATUS.FORBIDDEN }
      );
    }

    if (!origin && referer && !checkOrigin(referer)) {
      return NextResponse.json(
        { error: 'CSRF validation failed: Referer mismatch' },
        { status: HTTP_STATUS.FORBIDDEN }
      );
    }

    if (!origin && !referer) {
      return NextResponse.json(
        { error: 'CSRF validation failed: Missing Origin/Referer' },
        { status: HTTP_STATUS.FORBIDDEN }
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
