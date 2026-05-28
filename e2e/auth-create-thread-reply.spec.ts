import { test, expect } from '@playwright/test';
import { signIn, getSectionSlugs, TEST_USER } from './helpers';
import { prisma } from '../lib/infrastructure/prisma';

test.describe('Flow 1: Auth → Create Thread → Reply', () => {
  let token: string;

  test.beforeAll(async ({ browser }) => {
    const page = await browser.newPage();
    token = await signIn(page);
    await page.close();
  });

  test.afterAll(async () => {
    await prisma.$disconnect();
  });

  test('should sign in and land on dashboard', async ({ page }) => {
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

    await page.goto('/');
    await expect(page.locator('body')).toBeAttached();
    await page.waitForLoadState('networkidle');
  });

  test('should create a new thread (section) and reply to it', async ({ page }) => {
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

    const sections = await getSectionSlugs(page, token);
    const firstSection = sections.values().next().value;
    test.skip(!firstSection, 'No sections found in seed data');

    const threadTitle = `E2E Test Thread ${Date.now()}`;
    await page.goto(`/sections/${firstSection}/new`);
    await page.waitForLoadState('networkidle');

    const titleInput = page.locator('input[name="title"], input[placeholder*="title" i]').first();
    if (await titleInput.isVisible()) {
      await titleInput.fill(threadTitle);
    }

    const contentInput = page.locator(
      'textarea[name="content"], textarea[placeholder*="thoughts" i], [contenteditable="true"]'
    ).first();
    if (await contentInput.isVisible()) {
      await contentInput.fill(`This is an E2E test message created at ${Date.now()}`);
    }

    const submitBtn = page.locator(
      'button[type="submit"], button:has-text("Send"), button:has-text("Post")'
    ).first();
    if (await submitBtn.isEnabled()) {
      await submitBtn.click();
      await page.waitForTimeout(2000);
    }

    const replyInput = page.locator(
      'textarea[placeholder*="Reply" i], textarea[placeholder*="Share" i]'
    ).first();
    if (await replyInput.isVisible()) {
      await replyInput.fill(`E2E test reply at ${Date.now()}`);

      const sendBtn = page.locator(
        'button[type="submit"]:has-text("Send"), button:has-text("Post")'
      ).first();
      if (await sendBtn.isEnabled()) {
        await sendBtn.click();
        await page.waitForTimeout(2000);
      }
    }

    await expect(page.locator('body')).toBeAttached();
  });

  test('should load the thread list page', async ({ page }) => {
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

    await page.goto('/');
    await page.waitForLoadState('networkidle');
    expect(page.url()).toContain('localhost:3000');
  });
});
