import { defineConfig, devices } from '@playwright/test';

const PORT = process.env.E2E_PORT || '3000';
const BASE_URL = `http://localhost:${PORT}`;

export default defineConfig({
  testDir: './test/e2e',
  timeout: 60_000,
  expect: { timeout: 10_000 },
  fullyParallel: false,
  forbidOnly: !!process.env.CI,
  retries: process.env.CI ? 1 : 0,
  workers: 1,
  reporter: [['list']],
  use: {
    baseURL: BASE_URL,
    storageState: 'test/e2e/.auth/user.json',
    trace: 'on-first-retry',
    screenshot: 'only-on-failure',
  },
  projects: [{ name: 'chromium', use: { ...devices['Desktop Chrome'] } }],
  // Assumes `bun run dev` is already running (or pass E2E_BASE to a live server).
  // To manage the server automatically, set E2E_MANAGE_SERVER=true.
  // CI overrides the command with E2E_SERVER_COMMAND=bun run dev:next — the
  // plain `dev` script also boots the local QStash emulator, which CI does
  // not need (no QStash credentials → jobs run inline anyway).
  webServer: process.env.E2E_MANAGE_SERVER
    ? {
        command: process.env.E2E_SERVER_COMMAND ?? 'bun run dev',
        url: BASE_URL,
        reuseExistingServer: true,
        timeout: 120_000,
      }
    : undefined,
  globalSetup: require.resolve('./test/e2e/global-setup'),
});
