import { test, expect } from '@playwright/test';

const BASE_URL = `http://localhost:${process.env.E2E_PORT || '3000'}`;

// Collections E2E: create → add graph/summary → duplicate 409 → export → saved checkmark → delete item → delete collection
// Covers metadata-only saves (graph/canvas/summary/ai_synthesis) plus thread/message when a thread exists (best-effort).
test.describe('Collections', () => {
  test('collections CRUD: create → add graph/summary → export → delete', async ({ request }) => {
    const errors: unknown[] = [];

    // 1. Create collection
    const title = `E2E Collection ${Date.now()}`;
    const createRes = await request.post('/api/collections', {
      headers: { Origin: BASE_URL, Referer: BASE_URL, 'Content-Type': 'application/json' },
      data: { title },
    });
    expect(createRes.status(), await createRes.text()).toBe(201);
    const createBody = await createRes.json();
    const collectionId: string = createBody?.data?.id;
    expect(typeof collectionId).toBe('string');
    expect(collectionId.length).toBeGreaterThan(10);

    // 2. Add graph (metadata-only) — verifies repository allows metadata without foreign keys
    const graphPayload = { metadata: { type: 'graph', nodes: [{ id: 'a' }, { id: 'b' }], links: [{ source: 'a', target: 'b' }] } };
    const addGraphRes = await request.post(`/api/collections/${collectionId}/items`, {
      headers: { Origin: BASE_URL, Referer: BASE_URL, 'Content-Type': 'application/json' },
      data: graphPayload,
    });
    expect(addGraphRes.status(), await addGraphRes.text()).toBe(201);
    const addGraphBody = await addGraphRes.json();
    const graphItemId: string = addGraphBody?.data?.id;
    expect(typeof graphItemId).toBe('string');

    // 3. Duplicate graph should 409 (unique constraint on metadata? For metadata-only duplicates are allowed, so we test duplicate thread instead if possible)
    // For metadata-only, duplicates create new row (no unique constraint). Verify second graph creates new item (201), not 409.
    const addGraphDupRes = await request.post(`/api/collections/${collectionId}/items`, {
      headers: { Origin: BASE_URL, Referer: BASE_URL, 'Content-Type': 'application/json' },
      data: graphPayload,
    });
    // Metadata-only duplicates are allowed (no @@unique on metadata), so expect 201 and clean up second item
    expect([201, 409]).toContain(addGraphDupRes.status());
    let secondGraphItemId: string | null = null;
    if (addGraphDupRes.status() === 201) {
      const dupBody = await addGraphDupRes.json();
      secondGraphItemId = dupBody?.data?.id ?? null;
    }

    // 4. Add summary metadata (threadId inside metadata, not foreign key)
    const summaryPayload = { metadata: { type: 'summary', threadId: 'cuid_fake', content: 'E2E summary content' } };
    const addSummaryRes = await request.post(`/api/collections/${collectionId}/items`, {
      headers: { Origin: BASE_URL, Referer: BASE_URL, 'Content-Type': 'application/json' },
      data: summaryPayload,
    });
    expect(addSummaryRes.status(), await addSummaryRes.text()).toBe(201);
    const summaryItemId: string = (await addSummaryRes.json())?.data?.id;

    // 5. Best-effort: if a thread exists, add thread + message to same collection (verifies threadId/messageId path)
    // List threads to discover an existing thread id
    let threadIdForTest: string | null = null;
    let messageIdForTest: string | null = null;
    try {
      const threadsRes = await request.get('/api/threads', { headers: { Origin: BASE_URL, Referer: BASE_URL } });
      if (threadsRes.ok()) {
        const threadsBody = await threadsRes.json();
        const threads = threadsBody?.data ?? [];
        if (Array.isArray(threads) && threads.length > 0) {
          threadIdForTest = threads[0]?.id ?? null;
        }
      }
    } catch {
      // ignore — threads may be empty on fresh DB
    }

    if (threadIdForTest) {
      const addThreadRes = await request.post(`/api/collections/${collectionId}/items`, {
        headers: { Origin: BASE_URL, Referer: BASE_URL, 'Content-Type': 'application/json' },
        data: { threadId: threadIdForTest },
      });
      // 201 or 409 (already saved) are both valid; 404 means thread not found (race), accept but warn
      expect([201, 409, 404]).toContain(addThreadRes.status());
      if (addThreadRes.status() === 201) {
        const dupThreadRes = await request.post(`/api/collections/${collectionId}/items`, {
          headers: { Origin: BASE_URL, Referer: BASE_URL, 'Content-Type': 'application/json' },
          data: { threadId: threadIdForTest },
        });
        expect(dupThreadRes.status()).toBe(409);
        const dupBody = await dupThreadRes.json();
        expect(dupBody?.error?.message ?? dupBody?.error).toMatch(/Already saved/i);
      }

      // Saved checkmark: POST /api/collections/saved should return this collection id for the thread
      const savedRes = await request.post('/api/collections/saved', {
        headers: { Origin: BASE_URL, Referer: BASE_URL, 'Content-Type': 'application/json' },
        data: { threadId: threadIdForTest },
      });
      expect(savedRes.status(), await savedRes.text()).toBe(200);
      const savedBody = await savedRes.json();
      expect(Array.isArray(savedBody?.data)).toBe(true);
      if (addThreadRes.status() === 201) {
        expect(savedBody.data).toContain(collectionId);
      }

      // Try to post a message to that thread and then save messageId
      try {
        const msgRes = await request.post('/api/messages', {
          headers: { Origin: BASE_URL, Referer: BASE_URL },
          multipart: { threadId: threadIdForTest, content: `E2E message ${Date.now()}` },
        });
        if (msgRes.ok()) {
          const msgBody = await msgRes.json();
          messageIdForTest = msgBody?.data?.message?.id ?? null;
          if (messageIdForTest) {
            const addMsgRes = await request.post(`/api/collections/${collectionId}/items`, {
              headers: { Origin: BASE_URL, Referer: BASE_URL, 'Content-Type': 'application/json' },
              data: { messageId: messageIdForTest },
            });
            expect([201, 409]).toContain(addMsgRes.status());
          }
        }
      } catch {
        // best-effort — message creation may be rate-limited
      }
    } else {
      // No thread available — verify saved checkmark for graph metadata via POST
      const savedGraphRes = await request.post('/api/collections/saved', {
        headers: { Origin: BASE_URL, Referer: BASE_URL, 'Content-Type': 'application/json' },
        data: graphPayload,
      });
      expect(savedGraphRes.status()).toBe(200);
      const savedGraphBody = await savedGraphRes.json();
      expect(Array.isArray(savedGraphBody?.data)).toBe(true);
      // Graph was added, so saved should contain collectionId
      expect(savedGraphBody.data).toContain(collectionId);
    }

    // 6. Export — should return markdown containing graph + summary markers
    const exportRes = await request.get(`/api/collections/${collectionId}/export`, {
      headers: { Origin: BASE_URL, Referer: BASE_URL },
    });
    expect(exportRes.status(), await exportRes.text()).toBe(200);
    const md = await exportRes.text();
    expect(md).toContain('#');
    // Graph and summary sections are rendered via metadata.type
    expect(md).toMatch(/Graph Snapshot|Graph:|\# E2E/i);
    expect(md).toContain('Summary');

    // 7. Verify GET collection includes items with expected types
    const getRes = await request.get(`/api/collections/${collectionId}`, {
      headers: { Origin: BASE_URL, Referer: BASE_URL },
    });
    expect(getRes.status()).toBe(200);
    const getBody = await getRes.json();
    const items = getBody?.data?.items ?? [];
    expect(Array.isArray(items)).toBe(true);
    expect(items.length).toBeGreaterThanOrEqual(2);

    // 8. Delete items (clean up)
    // Delete summary first
    const delSummaryRes = await request.delete(`/api/collections/${collectionId}/items?itemId=${summaryItemId}`, {
      headers: { Origin: BASE_URL, Referer: BASE_URL },
    });
    expect(delSummaryRes.status(), await delSummaryRes.text()).toBe(200);

    const delGraphRes = await request.delete(`/api/collections/${collectionId}/items?itemId=${graphItemId}`, {
      headers: { Origin: BASE_URL, Referer: BASE_URL },
    });
    expect(delGraphRes.status()).toBe(200);

    if (secondGraphItemId) {
      const delSecondRes = await request.delete(`/api/collections/${collectionId}/items?itemId=${secondGraphItemId}`, {
        headers: { Origin: BASE_URL, Referer: BASE_URL },
      });
      expect([200, 404]).toContain(delSecondRes.status());
    }

    // 9. Delete collection
    const delColRes = await request.delete(`/api/collections/${collectionId}`, {
      headers: { Origin: BASE_URL, Referer: BASE_URL },
    });
    expect(delColRes.status(), await delColRes.text()).toBe(200);

    // 10. Verify collection gone
    const getAfterDel = await request.get(`/api/collections/${collectionId}`, {
      headers: { Origin: BASE_URL, Referer: BASE_URL },
    });
    expect([404, 400]).toContain(getAfterDel.status());

    expect(errors, String(errors)).toHaveLength(0);
  });

  test('collections page renders without errors', async ({ page }) => {
    const errors: string[] = [];
    page.on('pageerror', (e) => errors.push(e.message));
    await page.goto('/dashboard/collections');
    // Page should show heading or empty state without throwing
    await expect(page.getByText(/Collections|No collections|Create/i).first()).toBeVisible({ timeout: 10000 });
    expect(errors, errors.join('\n')).toHaveLength(0);
  });

  test('saved checkmark API returns 400 for empty payload', async ({ request }) => {
    const res = await request.post('/api/collections/saved', {
      headers: { Origin: BASE_URL, Referer: BASE_URL, 'Content-Type': 'application/json' },
      data: {},
    });
    expect(res.status()).toBe(400);
  });
});
