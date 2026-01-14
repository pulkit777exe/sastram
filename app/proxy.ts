import { NextResponse, type NextRequest } from "next/server";
import { env } from "@/lib/config/env";
import { apiLimiter } from "@/lib/services/rate-limit";
import { v4 as uuidv4 } from "uuid";

const PUBLIC_PATHS = ["/", "/favicon.ico", "/api/health", "/_next"];

function getClientIp(request: NextRequest): string {
  const forwarded = request.headers.get("x-forwarded-for");
  if (forwarded) {
    return forwarded.split(",")[0].trim();
  }

  const realIp = request.headers.get("x-real-ip");
  if (realIp) {
    return realIp;
  }

  const vercelIp = request.headers.get("cf-connecting-ip");
  if (vercelIp) {
    return vercelIp;
  }

  return "unknown";
}

export function middleware(request: NextRequest) {
  const { pathname } = request.nextUrl;

  const requestId = request.headers.get("x-request-id") ?? uuidv4();

  let response = NextResponse.next({
    request: {
      headers: new Headers(request.headers),
    },
  });

  response.headers.set("x-request-id", requestId);

  response = applySecurityHeaders(response);
  if (!PUBLIC_PATHS.some((path) => pathname.startsWith(path)) && env.RATE_LIMIT_ENABLED) {
    const clientIp = getClientIp(request);
    const key = `${clientIp}:${pathname}`;

    void apiLimiter
      .check(key)
      .catch((error) => {
        console.error(`Rate limit check failed for ${key}:`, error);
      });
  }

  return response;
}

function applySecurityHeaders(response: NextResponse): NextResponse {
  const headers = response.headers;

  headers.set("X-Frame-Options", "DENY");

  headers.set("X-Content-Type-Options", "nosniff");

  headers.set("Referrer-Policy", "strict-origin-when-cross-origin");

  headers.set("X-DNS-Prefetch-Control", "on");

  headers.set(
    "Permissions-Policy",
    "camera=(), microphone=(), geolocation=(), payment=()"
  );

  const cspDirectives = [
    "default-src 'self'",
    "script-src 'self' 'unsafe-inline' 'unsafe-eval' https://cdn.jsdelivr.net https://cdnjs.cloudflare.com",
    "style-src 'self' 'unsafe-inline' https://fonts.googleapis.com",
    "img-src 'self' data: blob: https:",
    "connect-src 'self' https:",
    "font-src 'self' data: https://fonts.gstatic.com",
    "frame-ancestors 'none'",
    "base-uri 'self'",
    "form-action 'self'",
  ];

  headers.set("Content-Security-Policy", cspDirectives.join("; "));

  if (env.NODE_ENV === "production") {
    headers.set(
      "Strict-Transport-Security",
      "max-age=63072000; includeSubDomains; preload"
    );
  }

  return response;
}

export const config = {
  matcher: [
    "/((?!_next/static|_next/image|favicon.ico|robots.txt|sitemap.xml).*)",
  ],
};