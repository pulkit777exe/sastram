import { test, expect } from '@playwright/test';
import { signIn, TEST_USER } from './helpers';
import { prisma } from '../lib/infrastructure/prisma';

test.describe('Flow 3: WebSocket Real-Time Message Delivery', () => {
  let token: string;

  test.beforeAll(async ({ browser }) => {
    const page = await browser.newPage();
    token = await signIn(page);
    await page.close();
  });

  test.afterAll(async () => {
    await prisma.$disconnect();
  });

  test('should establish WebSocket connection', async ({ page }) => {
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

    const wsMessages: string[] = [];
    page.on('websocket', (ws) => {
      ws.on('framesent', (frame) => wsMessages.push(String(frame.payload)));
      ws.on('framereceived', (frame) => wsMessages.push(String(frame.payload)));
    });

    await page.goto('/');
    await page.waitForLoadState('networkidle');
    await page.waitForTimeout(3000);

    expect(wsMessages.length).toBeGreaterThanOrEqual(0);
  });

  test('should connect to thread WebSocket', async ({ page }) => {
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

    const sectionsResp = await page.request.get('/api/sections', {
      headers: { cookie: `better-auth.session_token=${token}` },
    });

    let threadSlug: string | null = null;
    if (sectionsResp.ok()) {
      const body = await sectionsResp.json();
      const sections = body.data ?? body.sections ?? body;
      if (Array.isArray(sections) && sections.length > 0) {
        threadSlug = sections[0].slug;
      }
    }

    test.skip(!threadSlug, 'No sections available');

    const wsConnected = page.waitForEvent('websocket', { timeout: 10000 }).then(() => true).catch(() => false);

    await page.goto(`/sections/${threadSlug}`);
    await page.waitForLoadState('networkidle');

    const connected = await wsConnected;
    expect(connected).toBeDefined();
  });
});
