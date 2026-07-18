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
async function run(config: FullConfig) {
  // 1. Seed (best-effort; idempotent upsert). Uses tsx via the project script.
  try {
    execFileSync('pnpm', ['exec', 'tsx', 'scripts/seed-test-user.ts'], {
      cwd: process.cwd(),
      stdio: 'inherit',
    });
  } catch (err) {
    console.warn('[global-setup] seed step failed (continuing):', (err as Error).message);
  }

  // 2. Sign in and capture cookies.
  const browser = await chromium.launch();
  const context = await browser.newContext();
  const page = await context.newPage();

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

  await browser.close();
  console.log('[global-setup] Authenticated storage state written.');
}

export default run;
