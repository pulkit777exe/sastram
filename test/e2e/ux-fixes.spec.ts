import { test, expect } from '@playwright/test';

const THREAD = '/thread/new-thread-9849b823-5fe6-4f1a-88e0-78178fd06a1d';

test.describe('Search and thread UX', () => {
  test('missing keys open the dialog, keep the query, and resume after a key is saved', async ({ page }) => {
    let requests = 0;

    await page.route('**/api/ai/forum-search', async (route) => {
      requests += 1;
      if (requests === 1) {
        await route.fulfill({
          status: 400,
          contentType: 'application/json',
          body: JSON.stringify({
            success: false,
            error: {
              code: 'MISSING_API_KEYS',
              message: 'Missing API key: Gemini. Configure in API Keys settings.',
              details: {
                missingKeys: [{ provider: 'gemini', label: 'Gemini', envVar: 'SASTRAM_GEMINI_KEY' }],
              },
            },
          }),
        });
        return;
      }

      const events = [
        { phase: 'searching' },
        { phase: 'reading', sources: [] },
        { phase: 'crossref' },
        { phase: 'synthesizing' },
        {
          phase: 'done',
          sessionId: 'session-verify',
          synthesis: { text: 'Resumed search answer', citations: [], sourceCount: 0 },
          sources: [],
          followUps: [],
        },
      ];
      await route.fulfill({
        status: 200,
        contentType: 'text/event-stream',
        body: events.map((event) => `data: ${JSON.stringify(event)}\n\n`).join(''),
      });
    });

    await page.goto('/dashboard/sai-search');
    // Let React finish hydrating before interacting — SSR markup is clickable
    // but inert until the client handlers are attached.
    await page.waitForLoadState('networkidle');
    const input = page.getByLabel('Search query');
    await input.fill('what changed in React 19');
    await page.getByRole('button', { name: 'Send', exact: true }).click();

    const dialog = page.getByRole('dialog');
    await expect(dialog).toBeVisible();
    await expect(dialog.getByText('API Keys', { exact: true })).toBeVisible();
    await expect(dialog.getByText(/SASTRAM_GEMINI_KEY/)).toBeVisible();
    await expect(dialog.getByText(/Missing API key: Gemini/)).toBeVisible();
    expect(requests).toBe(1);

    // An incomplete key keeps the dialog open; only a valid format resumes.
    await dialog.getByLabel('Gemini API Key').fill('AI');
    await expect(dialog).toBeVisible();
    expect(requests).toBe(1);

    await dialog.getByLabel('Gemini API Key').fill('AIzaSyA1234567890abcdefghijklmnop');
    await expect(dialog).toBeHidden();
    await expect.poll(() => requests).toBe(2);
    await expect(page.getByText('Resumed search answer')).toBeVisible();
  });

  test('thread header actions are icon-only and show hover tooltips', async ({ page }) => {
    await page.goto(THREAD);
    // Header controls are server-rendered; wait for client hydration so the
    // first hover actually reaches Radix's tooltip listeners.
    await page.waitForLoadState('networkidle');
    await expect(page.getByText('new thread').first()).toBeVisible();
    const header = page.locator('header').first();

    const actions = [
      { role: 'button', name: 'Save to collection', tooltip: 'Save to collection' },
      { role: 'button', name: 'Bookmark thread', tooltip: 'Bookmark thread' },
      { role: 'button', name: /^Add bounty/, tooltip: /^Add bounty/ },
      { role: 'button', name: 'Fork thread', tooltip: /^Fork thread/ },
      { role: 'combobox', name: /^Subscribe to thread|^Subscribed|^Notifications off/, tooltip: /subscribe|Subscribed/i },
      { role: 'button', name: 'Invite a friend to this thread', tooltip: 'Invite a friend to this thread' },
      { role: 'button', name: 'Edit thread', tooltip: 'Edit title and description' },
    ] as const;

    for (const action of actions) {
      const control = header.getByRole(action.role, { name: action.name }).first();
      await expect(control).toBeVisible();
      await control.hover();
      await expect(page.getByRole('tooltip').filter({ hasText: action.tooltip })).toBeVisible();
      await page.mouse.move(0, 0);
    }
  });

  test('composer emoji picker searches the full collection without submitting', async ({ page }) => {
    await page.goto(THREAD);
    await page.waitForLoadState('networkidle');
    await expect(page.getByText('Seed message for smoke tests')).toBeVisible();
    const messagesBefore = await page.locator('[id^="message-"]').count();
    const composer = page.getByPlaceholder(/ask a question|mention @sai/i).first();
    await composer.fill('hello ');
    await page.getByRole('button', { name: 'Add emoji' }).click();

    const picker = page.locator('[data-emoji-picker]');
    const search = picker.getByPlaceholder('Search emoji');
    await expect(search).toBeVisible({ timeout: 15000 });
    // The bundled Twemoji font is what makes emoji visible on systems with no
    // native color-emoji font (e.g. minimal Linux/CI images).
    expect(await page.evaluate(() => document.fonts.check('16px Twemoji'))).toBe(true);
    const emojiFont = await picker
      .getByRole('gridcell')
      .first()
      .locator('span')
      .first()
      .evaluate((el) => getComputedStyle(el).fontFamily);
    expect(emojiFont).toContain('Twemoji');
    await search.fill('thumbs up');
    await picker.getByRole('gridcell', { name: 'thumbs up' }).click();

    await expect(picker).toBeHidden();
    await expect(composer).toHaveValue('hello 👍');
    // Picking an emoji inserts it into the draft; it must not submit the form.
    expect(await page.locator('[id^="message-"]').count()).toBe(messagesBefore);
  });

  test('message save and reaction actions share one non-overlapping toolbar', async ({ page }) => {
    await page.goto(THREAD);
    await page.waitForLoadState('networkidle');
    const row = page.locator('[id^="message-"]').filter({ hasText: 'Seed message for smoke tests' }).first();
    await row.hover();

    const save = row.getByRole('button', { name: 'Save to collection' });
    const react = row.getByRole('button', { name: 'Add reaction' });
    await expect(save).toBeVisible();
    await expect(react).toBeVisible();

    const saveBox = await save.boundingBox();
    const reactBox = await react.boundingBox();
    expect(saveBox).not.toBeNull();
    expect(reactBox).not.toBeNull();
    const overlaps =
      !!saveBox &&
      !!reactBox &&
      saveBox.x < reactBox.x + reactBox.width &&
      saveBox.x + saveBox.width > reactBox.x &&
      saveBox.y < reactBox.y + reactBox.height &&
      saveBox.y + saveBox.height > reactBox.y;
    expect(overlaps).toBe(false);
  });

  test('bounty action uses a dialog instead of window.prompt', async ({ page }) => {
    let prompted = false;
    page.on('dialog', async (dialog) => {
      prompted = true;
      await dialog.dismiss();
    });

    await page.goto(THREAD);
    await page.waitForLoadState('networkidle');
    await page.getByRole('button', { name: /^Add bounty/ }).first().click();
    const dialog = page.getByRole('dialog');
    await expect(dialog.getByRole('heading', { name: 'Add bounty' })).toBeVisible();
    await expect(dialog.getByLabel('Amount (1-1000)')).toHaveValue('10');
    expect(prompted).toBe(false);
  });
});
