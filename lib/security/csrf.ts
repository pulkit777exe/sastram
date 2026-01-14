import { cookies } from "next/headers";
import { randomBytes } from "crypto";

const CSRF_COOKIE_NAME = "sastram_csrf_token";
const CSRF_HEADER_NAME = "x-csrf-token";

export function getCsrfHeaderName() {
  return CSRF_HEADER_NAME;
}

export async function ensureCsrfToken() {
  const cookieStore = await cookies();
  let token = cookieStore.get(CSRF_COOKIE_NAME)?.value;

  if (!token) {
    token = generateToken();
    cookieStore.set(CSRF_COOKIE_NAME, token, {
      httpOnly: false,
      sameSite: "lax",
    });
  }

  return token;
}

export function verifyCsrf(request: Request): boolean {
  const headerToken = request.headers.get(CSRF_HEADER_NAME);
  const cookieHeader = request.headers.get("cookie") ?? "";
  const cookieToken = parseCookie(cookieHeader)[CSRF_COOKIE_NAME];

  if (!headerToken || !cookieToken) return false;

  return headerToken === cookieToken;
}

function generateToken() {
  return randomBytes(32).toString("hex");
}

function parseCookie(cookieHeader: string): Record<string, string> {
  return cookieHeader.split(";").reduce<Record<string, string>>((acc, part) => {
    const [key, ...rest] = part.trim().split("=");
    if (!key) return acc;
    acc[key] = rest.join("=");
    return acc;
  }, {});
}

