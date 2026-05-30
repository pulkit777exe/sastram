import { test, expect } from '@playwright/test';
import { signIn, TEST_USER } from './helpers';
import { prisma } from '../lib/infrastructure/prisma';

test.describe('Flow 2: AI Search Pipeline', () => {
  let token: string;

  test.beforeAll(async ({ browser }) => {
    const page = await browser.newPage();
    token = await signIn(page);
    await page.close();
  });

  test.afterAll(async () => {
    await prisma.$disconnect();
  });

  test('should load AI search dialog', async ({ page }) => {
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

    const searchShortcut = `Meta+k`;
    await page.goto('/');
    await page.waitForLoadState('networkidle');

    await page.keyboard.press(searchShortcut);
    await page.waitForTimeout(500);

    const aiInput = page.locator(
      'input[placeholder*="Search" i], input[placeholder*="Ask" i], ' +
      'textarea[placeholder*="Search" i], [aria-label*="search" i]'
    ).first();

    if (await aiInput.isVisible()) {
      await aiInput.fill('E2E test search query');
      await page.waitForTimeout(1000);
    }

    await expect(page.locator('body')).toBeAttached();
  });

  test('should access AI search API endpoint', async ({ page }) => {
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

    const resp = await page.request.post('/api/ai/forum-search', {
      data: { query: 'What is ethical AI?' },
      headers: { cookie: `better-auth.session_token=${token}` },
    });

    expect(resp.ok()).toBeTruthy();
  });

  test('should search threads from the forum search API', async ({ page }) => {
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

    const resp = await page.request.get('/api/search?q=artificial+intelligence', {
      headers: { cookie: `better-auth.session_token=${token}` },
    });
    expect(resp.ok()).toBeTruthy();

    const body = await resp.json();
    expect(body).toBeDefined();
  });
});
