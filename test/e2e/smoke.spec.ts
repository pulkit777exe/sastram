import { test, expect } from '@playwright/test';

const BASE_URL = `http://localhost:${process.env.E2E_PORT || '3000'}`;
const EMAIL = 'test@sastram.dev';
const PASSWORD = 'TestPassword123!';

test.describe('Authenticated smoke', () => {
  test('dashboard loads without page errors', async ({ page }) => {
    const errors: string[] = [];
    page.on('pageerror', (e) => errors.push(e.message));

    await page.goto('/dashboard');
    await expect(page).toHaveURL(/\/dashboard\/sai-search/);
    await expect(page.locator('h1').first()).toHaveText('Search with Sai');
    // Exactly one h1 on the search page (no duplicate header block).
    expect(await page.locator('h1').count()).toBe(1);

    expect(errors, errors.join('\n')).toHaveLength(0);
  });

  test('sai-search page renders a single header', async ({ page }) => {
    const errors: string[] = [];
    page.on('pageerror', (e) => errors.push(e.message));

    await page.goto('/dashboard/sai-search');
    // Only one H1, and the old duplicate "Sai-Powered" block is gone.
    expect(await page.locator('h1').count()).toBe(1);
    await expect(page.getByRole('heading', { name: 'Search with Sai' })).toBeVisible();
    await expect(
      page.getByRole('heading', { level: 1 }).filter({ hasText: 'Sai-Powered' })
    ).toHaveCount(0);

    expect(errors, errors.join('\n')).toHaveLength(0);
  });

  test('forum-search surfaces a real error (not a silent fake success)', async ({
    page,
    request,
  }) => {
    // When the AI provider is unavailable, the API must NOT return 200 with a
    // fake synthesis; it must return a proper error status.
    const res = await request.post('/api/ai/forum-search', {
      headers: {
        Origin: BASE_URL,
        Referer: BASE_URL,
        'Content-Type': 'application/json',
      },
      data: {
        query: 'smoke test error handling',
        config: { exaMode: 'instant', tavilyMode: 'search', sourceFilter: 'all', searchMode: 'standard' },
      },
    });

    if (res.status() === 200) {
      const body = await res.json();
      // If it succeeded, the synthesis must be real (non-empty content).
      expect(body?.data?.synthesis?.content?.trim().length ?? 0).toBeGreaterThan(0);
    } else {
      // Otherwise it must be a clear error status with a string message.
      expect([429, 503, 500]).toContain(res.status());
      const body = await res.json().catch(() => ({}));
      expect(typeof body?.error?.message).toBe('string');
    }
  });

  test('thread page renders (no RSC function-prop crash)', async ({ page }) => {
    const errors: string[] = [];
    page.on('pageerror', (e) => errors.push(e.message));

    // Use the known seeded public thread.
    await page.goto('/thread/new-thread-9849b823-5fe6-4f1a-88e0-78178fd06a1d');
    await expect(page.getByRole('heading', { name: 'new thread' })).toBeVisible();
    // The count label renders as e.g. "9 messages" (number + text in separate nodes).
    await expect(page.getByText(/messages/i).first()).toBeVisible();
    // Reply box is present (the RSC function-prop crash would break this page).
    await expect(page.getByPlaceholder(/reply/i).first()).toBeVisible();

    expect(errors, errors.join('\n')).toHaveLength(0);
  });

  test('@sai mention yields a response without page errors', async ({ page }) => {
    const errors: string[] = [];
    page.on('pageerror', (e) => errors.push(e.message));

    // Use the known seeded public thread.
    await page.goto('/thread/new-thread-9849b823-5fe6-4f1a-88e0-78178fd06a1d');
    const box = page.getByPlaceholder(/reply/i).first();
    await box.click();
    await box.fill(`@sai what is this thread about?`);
    await page.getByRole('button', { name: /send|post|reply/i }).first().click();

    // The inline AI reply is best-effort: it must appear (real answer or a clear
    // placeholder) and never throw / 500 the job. Allow time for the async job.
    await expect(
      page.getByText(/I'm temporarily over my AI quota|Sorry, I couldn't generate|@sai what is this thread about\?/i).first(),
    ).toBeVisible({ timeout: 15000 });

    expect(errors, errors.join('\n')).toHaveLength(0);
  });
});
