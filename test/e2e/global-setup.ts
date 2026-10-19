import { chromium, type FullConfig } from '@playwright/test';
import { execFileSync } from 'node:child_process';

const PORT = process.env.E2E_PORT || '3000';
const BASE_URL = `http://localhost:${PORT}`;

const TEST_EMAIL = 'test@sastram.dev';
const TEST_PASSWORD = 'TestPassword123!';

/**
 * 1. Seed the test user + credential account into the dev database.
 * 2. Sign in via the better-auth email endpoint (with CSRF headers) to obtain
 *    a real session cookie, then persist it as Playwright storageState so the
 *    specs run authenticated.
 */
async function run(_config: FullConfig) {
  // 1. Seed (best-effort; idempotent upsert). Runs via bun (direct TS execution,
  // tsconfig paths resolved natively).
  // DATABASE_URL is pinned explicitly: each shell invocation is fresh, so an
  // exported override would be lost and the seeds would hit the dev database
  // from .env instead (this exact mistake polluted Neon once — cleaned up).
  const seedEnv = {
    ...process.env,
    DATABASE_URL:
      process.env.DATABASE_URL ?? 'postgresql://postgres:postgres@localhost:5432/sastram_test',
  };
  for (const script of ['scripts/seed-test-user.ts', 'scripts/seed-e2e-thread.ts']) {
    try {
      execFileSync('bun', [script], {
        cwd: process.cwd(),
        stdio: 'inherit',
        env: seedEnv,
      });
    } catch (err) {
      console.warn(`[global-setup] seed step ${script} failed (continuing):`, (err as Error).message);
    }
  }

  // 2. Sign in and capture cookies.
  const browser = await chromium.launch();
  const context = await browser.newContext();

  const res = await context.request.post(`${BASE_URL}/api/auth/sign-in/email`, {
    headers: {
      Origin: BASE_URL,
      Referer: `${BASE_URL}/login`,
      'Content-Type': 'application/json',
    },
    data: { email: TEST_EMAIL, password: TEST_PASSWORD },
  });

  if (res.status() !== 200) {
    throw new Error(`Sign-in failed with status ${res.status()}: ${await res.text()}`);
  }

  const authDir = `${process.cwd()}/test/e2e/.auth`;
  await import('node:fs').then((fs) => fs.mkdirSync(authDir, { recursive: true }));
  await context.storageState({ path: `${authDir}/user.json` });

  // 3. Warm the routes the specs visit first. Turbopack compiles lazily, and a
  // cold compile can stall the dev server past getSession's 3s timeout, which
  // surfaces an error boundary on the first visit. The dev server is already
  // up at this point, so one request per route removes that race. Statuses
  // are irrelevant (a warm-up may 404/redirect) — only the compile matters.
  // Must run before browser.close(): `context.request` lives on this context.
  const warmupRoutes = [
    '/dashboard/sai-search',
    '/dashboard/threads',
    '/dashboard/collections',
    '/dashboard',
    '/thread/new-thread-9849b823-5fe6-4f1a-88e0-78178fd06a1d',
  ];
  for (const route of warmupRoutes) {
    try {
      const res = await context.request.get(`${BASE_URL}${route}`);
      console.log(`[global-setup] warm ${route} → ${res.status()}`);
    } catch (err) {
      console.warn(`[global-setup] warm ${route} failed (continuing):`, (err as Error).message);
    }
  }

  await browser.close();

  console.log('[global-setup] Authenticated storage state written.');
}

export default run;
