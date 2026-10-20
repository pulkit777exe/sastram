import { test, expect } from '@playwright/test';

const BASE_URL = `http://localhost:${process.env.E2E_PORT || '3000'}`;
const HDR = { Origin: BASE_URL, Referer: BASE_URL, 'Content-Type': 'application/json' } as const;

// Covers the light-reload + inline-edit work: create-dialog navigation,
// message post→edit (no reload), thread title edit (in place), tag
// attach/detach (in place), reaction toggle truth, and the lightweight
// AI status GET endpoints. No AI generation is triggered anywhere.
test.describe('Thread edit flows (no full-page reloads)', () => {
  test('create → post → edit message → edit title → tags → react → status GETs', async ({
    page,
    request,
  }) => {
    const errors: string[] = [];
    page.on('pageerror', (e) => errors.push(e.message));
    const stamp = Date.now();
    const title = `E2E Thread ${stamp} xqz`;
    const editedTitle = `E2E Thread ${stamp} xqz (renamed)`;
    const body = `Original message ${stamp}`;
    const editedBody = `Edited message ${stamp}`;

    // 1. Create via dialog → must land on the new thread page (ROUTES.THREAD).
    await page.goto('/dashboard/threads');
    await page.getByRole('button', { name: 'Create Thread' }).first().click();
    await page.locator('#thread-title').fill(title);
    await page.locator('#thread-description').fill('E2E context');
    await page.getByRole('button', { name: 'Publish thread' }).click();
    await expect(page).toHaveURL(/\/dashboard\/threads\/.+/, { timeout: 15000 });
    const slug = page.url().split('/').pop() as string;
    await expect(page.locator('header').getByText(title)).toBeVisible();

    // Thread id for API-level assertions.
    const listRes = await request.get('/api/threads', { headers: { ...HDR } });
    expect(listRes.ok(), await listRes.text()).toBe(true);
    const threads = ((await listRes.json())?.data?.threads ?? []) as { id: string; slug: string }[];
    const threadId = threads.find((t) => t.slug === slug)?.id;
    if (!threadId) throw new Error('created thread missing from /api/threads list');

    // 2. Post a message via API (composer itself is unchanged), reload to show it.
    const msgRes = await request.post('/api/messages', {
      headers: { Origin: BASE_URL, Referer: BASE_URL },
      multipart: { threadId, content: body },
    });
    expect(msgRes.ok(), await msgRes.text()).toBe(true);
    const messageId: string | undefined = (await msgRes.json())?.data?.message?.id;
    if (!messageId) throw new Error('message creation returned no id');
    await page.reload();
    const row = page.locator(`#message-${messageId}`);
    await expect(row.getByText(body)).toBeVisible();

    // 3. Edit own message inline — URL must not change (no reload/refresh).
    const urlBeforeEdit = page.url();
    await row.hover();
    await row.getByTitle('Edit message').click();
    await page.locator('textarea:focus').fill(editedBody);
    await row.getByRole('button', { name: 'Save', exact: true }).click();
    await expect(row.getByText(editedBody)).toBeVisible();
    await expect(row.getByText(body, { exact: true })).toHaveCount(0);
    expect(page.url()).toBe(urlBeforeEdit);
    // Edit-history popover now has the prior version.
    await row.getByRole('button', { name: 'edited' }).click();
    await expect(row.getByText('Edit history')).toBeVisible();
    await expect(row.getByText(body)).toBeVisible();

    // 4. Thread title edit via header pencil — in place, same URL.
    await page.getByRole('button', { name: 'Edit thread' }).click();
    await page.locator('#edit-thread-title').fill(editedTitle);
    await page.getByRole('button', { name: 'Save changes' }).click();
    await expect(page.locator('header').getByText(editedTitle)).toBeVisible();
    expect(page.url()).toBe(urlBeforeEdit);

    // 5. Tag attach via picker, then detach via chip X — both in place.
    await page.getByRole('button', { name: 'Tag', exact: true }).click();
    await page.getByPlaceholder('Search tags…').fill('e2eprobe');
    await page.getByRole('button', { name: '#e2eprobe' }).click();
    await expect(page.getByText('#e2eprobe').first()).toBeVisible();
    expect(page.url()).toBe(urlBeforeEdit);
    // Close the picker so the post-detach assertion is unambiguous.
    await page.keyboard.press('Escape');
    // Detach via the chip's accessible remove button — unambiguous even
    // with the picker open.
    await page.getByRole('button', { name: 'Remove #e2eprobe' }).click();
    await expect(page.getByText('#e2eprobe')).toHaveCount(0);

    // 6. Reaction toggle via the Discord-style picker — chip appears, no reload.
    await row.hover();
    await row.getByRole('button', { name: 'Add reaction' }).click();
    const picker = page.locator('[data-emoji-picker]');
    const pickerSearch = picker.getByPlaceholder('Search emoji');
    await expect(pickerSearch).toBeVisible({ timeout: 15000 });
    await pickerSearch.fill('thumbs up');
    await picker.getByRole('gridcell', { name: 'thumbs up' }).click();
    const reactionChip = row.getByRole('button', { name: /👍 1 reaction, including you/ });
    await expect(reactionChip).toBeVisible();
    await expect(reactionChip).toHaveAttribute('aria-pressed', 'true');
    expect(page.url()).toBe(urlBeforeEdit);

    // 6b. Reaction survives a full reload (server aggregate + viewer state).
    // The chip renders optimistically first, so give the toggle's server
    // roundtrip a grace window and re-assert (a server error rolls back
    // the chip) — otherwise reload can win the race and read pre-commit.
    await page.waitForTimeout(1500);
    await page.reload();
    const reloadedRow = page.locator(`#message-${messageId}`);
    await expect(reloadedRow.getByText(editedBody)).toBeVisible();
    await expect(
      reloadedRow.getByRole('button', { name: /👍 1 reaction, including you/ })
    ).toBeVisible();

    // 7. Lightweight status endpoints (feed the cards' polling, no RSC refresh).
    const sumRes = await request.get(
      `/api/ai/thread-summary?threadId=${threadId}`,
      { headers: { ...HDR } }
    );
    expect(sumRes.ok(), await sumRes.text()).toBe(true);
    const sumBody = await sumRes.json();
    expect(sumBody).toMatchObject({ success: true });
    expect(sumBody?.data).toHaveProperty('summary');
    const scoreRes = await request.get(
      `/api/ai/resolution-score?threadId=${threadId}`,
      { headers: { ...HDR } }
    );
    expect(scoreRes.ok(), await scoreRes.text()).toBe(true);
    const scoreBody = await scoreRes.json();
    expect(scoreBody).toMatchObject({ success: true });
    expect(scoreBody?.data).toHaveProperty('score');

    // No silent action failures surfaced as toasts anywhere in the flow.
    await expect(page.getByText('Invalid input')).toHaveCount(0);

    expect(errors, errors.join('\n')).toHaveLength(0);
  });
});
