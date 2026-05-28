import { defineConfig, devices } from '@playwright/test';
import { config } from 'dotenv';
import path from 'path';

config({ path: path.resolve('e2e/.env.e2e') });

const PORT = 3000;
const BASE_URL = `http://localhost:${PORT}`;

export default defineConfig({
  testDir: './e2e',
  fullyParallel: false,
  forbidOnly: !!process.env.CI,
  retries: process.env.CI ? 1 : 0,
  workers: 1,
  reporter: process.env.CI ? 'github' : 'list',
  timeout: 60000,
  expect: { timeout: 10000 },

  use: {
    baseURL: BASE_URL,
    trace: 'on-first-retry',
    screenshot: 'only-on-failure',
  },

  webServer: {
    command: `PORT=${PORT} node --import tsx ./node_modules/.bin/next dev -p ${PORT}`,
    port: PORT,
    reuseExistingServer: !process.env.CI,
    env: {
      ...process.env,
      NODE_ENV: 'test',
      PORT: String(PORT),
      NEXT_PUBLIC_APP_URL: BASE_URL,
      BETTER_AUTH_URL: BASE_URL,
    },
  },

  projects: [
    {
      name: 'chromium',
      use: { ...devices['Desktop Chrome'], channel: 'chromium' },
    },
  ],
});
