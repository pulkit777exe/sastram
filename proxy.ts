import type { NextRequest } from "next/server";
import { NextResponse } from "next/server";
import { env } from "@/lib/config/env";
import { rateLimit } from "@/lib/services/rate-limit";

const PUBLIC_PATHS = [
  "/login",
  "/api/auth",
  "/api/email-otp",
  "/api/sign-in",
  "/api/forget-password",
];

const SECURITY_HEADERS = {
  "X-Frame-Options": "DENY",
  "X-Content-Type-Options": "nosniff",
  "Referrer-Policy": "strict-origin-when-cross-origin",
  "X-DNS-Prefetch-Control": "off",
  "Permissions-Policy": "camera=(), microphone=(), geolocation=(), payment=()",
  "Content-Security-Policy": [
    "default-src 'self'",
    "script-src 'self' 'unsafe-inline' 'unsafe-eval' https://cdn.jsdelivr.net https://cdnjs.cloudflare.com",
    "style-src 'self' 'unsafe-inline' https://fonts.googleapis.com",
    "img-src 'self' data: blob: https:",
    "connect-src 'self' https:",
    "font-src 'self' data: https://fonts.gstatic.com",
    "frame-ancestors 'none'",
    "base-uri 'self'",
    "form-action 'self'",
  ].join("; "),
};

const PRODUCTION_HEADERS = {
  "Strict-Transport-Security": "max-age=63072000; includeSubDomains; preload",
};

function getClientIp(request: NextRequest): string {
  const forwarded = request.headers.get("x-forwarded-for");
  if (forwarded) return forwarded.split(",")[0]?.trim() ?? "unknown";
  const cfIp = request.headers.get("cf-connecting-ip");
  if (cfIp) return cfIp;
  const realIp = request.headers.get("x-real-ip");
  if (realIp) return realIp;
  return "unknown";
}

function applySecurityHeaders(response: NextResponse): NextResponse {
  for (const [key, value] of Object.entries(SECURITY_HEADERS)) {
    response.headers.set(key, value);
  }
  if (env.NODE_ENV === "production") {
    for (const [key, value] of Object.entries(PRODUCTION_HEADERS)) {
      response.headers.set(key, value);
    }
  }
  return response;
}

export default async function proxy(request: NextRequest) {
  const { pathname, search } = request.nextUrl;
  const requestId = request.headers.get("x-request-id") ?? crypto.randomUUID();

  const isPublic = PUBLIC_PATHS.some((path) => pathname.startsWith(path));
  const sessionCookie = request.cookies.get("better-auth.session_token");

  if (!sessionCookie && !isPublic) {
    const loginUrl = new URL("/login", request.url);
    loginUrl.searchParams.set("reason", "unauthorized");
    loginUrl.searchParams.set("redirect", `${pathname}${search}`);
    const response = NextResponse.redirect(loginUrl);
    response.headers.set("x-request-id", requestId);
    return applySecurityHeaders(response);
  }

  if (sessionCookie && pathname === "/login") {
    const response = NextResponse.redirect(new URL("/dashboard", request.url));
    response.headers.set("x-request-id", requestId);
    return applySecurityHeaders(response);
  }

  if (!isPublic && env.RATE_LIMIT_ENABLED) {
    const ip = getClientIp(request);
    const key = `proxy:${ip}:${pathname}`;
    const { success } = await rateLimit({ key, type: "api" });
    if (!success) {
      const response = NextResponse.json(
        { error: "Too Many Requests" },
        { status: 429 }
      );
      response.headers.set("x-request-id", requestId);
      return applySecurityHeaders(response);
    }
  }

  const requestHeaders = new Headers(request.headers);
  requestHeaders.set("x-request-id", requestId);

  let response = NextResponse.next({ request: { headers: requestHeaders } });
  response.headers.set("x-request-id", requestId);
  response = applySecurityHeaders(response);
  return response;
}

export const config = {
  matcher: [
    "/((?!_next/static|_next/image|favicon.ico|robots.txt|sitemap.xml).*)",
  ],
};