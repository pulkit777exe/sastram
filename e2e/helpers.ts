import { type Page } from '@playwright/test';
import { prisma } from '../lib/infrastructure/prisma';

export const TEST_USER = {
  email: 'admin@sastram.com',
  name: 'Sastram',
};

export const TEST_PASSWORD = 'TestPassword123!';

export async function signIn(page: Page): Promise<string> {
  const resp = await page.request.post('/api/email-otp/send-verification-otp', {
    data: { email: TEST_USER.email, type: 'sign-in' },
  });
  if (!resp.ok()) {
    throw new Error(`Failed to send OTP: ${resp.status()} ${await resp.text()}`);
  }

  const verification = await prisma.verification.findFirst({
    where: { identifier: TEST_USER.email },
    orderBy: { createdAt: 'desc' },
  });
  if (!verification) {
    throw new Error(`No OTP found for ${TEST_USER.email}`);
  }

  const signInResp = await page.request.post('/api/sign-in/email-otp', {
    data: { email: TEST_USER.email, otp: verification.value },
  });
  if (!signInResp.ok()) {
    throw new Error(`Sign-in failed: ${signInResp.status()} ${await signInResp.text()}`);
  }

  const cookies = signInResp.headers()['set-cookie'] || '';
  const match = cookies.match(/better-auth\.session_token=([^;]+)/);
  const token = match?.[1];
  if (!token) {
    throw new Error('No session token in sign-in response');
  }

  await page.context().addCookies([
    {
      name: 'better-auth.session_token',
      value: token,
      domain: 'localhost',
      path: '/',
      httpOnly: true,
      sameSite: 'Lax' as const,
    },
  ]);

  return token;
}

export async function getThreadSlugs(page: Page, token: string): Promise<Map<string, string>> {
  const resp = await page.request.get('/api/threads', {
    headers: { cookie: `better-auth.session_token=${token}` },
  });
  const body = await resp.json();
  const threads = body.data ?? body.threads ?? body;
  const map = new Map<string, string>();
  if (Array.isArray(threads)) {
    for (const t of threads) {
      map.set(t.name ?? t.title, t.slug);
    }
  }
  return map;
}
