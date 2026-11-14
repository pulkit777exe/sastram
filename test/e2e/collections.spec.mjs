import { test, expect } from "@playwright/test";
const BASE_URL = `http://localhost:${process.env.E2E_PORT || "3000"}`;
test.describe("Collections", () => {
  test("collections CRUD: create \u2192 add graph/summary \u2192 export \u2192 delete", async ({ request }) => {
    const errors = [];
    const title = `E2E Collection ${Date.now()}`;
    const createRes = await request.post("/api/collections", {
      headers: { Origin: BASE_URL, Referer: BASE_URL, "Content-Type": "application/json" },
      data: { title }
    });
    expect(createRes.status(), await createRes.text()).toBe(201);
    const createBody = await createRes.json();
    const collectionId = createBody?.data?.id;
    expect(typeof collectionId).toBe("string");
    expect(collectionId.length).toBeGreaterThan(10);
    const graphPayload = { metadata: { type: "graph", nodes: [{ id: "a" }, { id: "b" }], links: [{ source: "a", target: "b" }] } };
    const addGraphRes = await request.post(`/api/collections/${collectionId}/items`, {
      headers: { Origin: BASE_URL, Referer: BASE_URL, "Content-Type": "application/json" },
      data: graphPayload
    });
    expect(addGraphRes.status(), await addGraphRes.text()).toBe(201);
    const addGraphBody = await addGraphRes.json();
    const graphItemId = addGraphBody?.data?.id;
    expect(typeof graphItemId).toBe("string");
    const addGraphDupRes = await request.post(`/api/collections/${collectionId}/items`, {
      headers: { Origin: BASE_URL, Referer: BASE_URL, "Content-Type": "application/json" },
      data: graphPayload
    });
    expect([201, 409]).toContain(addGraphDupRes.status());
    let secondGraphItemId = null;
    if (addGraphDupRes.status() === 201) {
      const dupBody = await addGraphDupRes.json();
      secondGraphItemId = dupBody?.data?.id ?? null;
    }
    const summaryPayload = { metadata: { type: "summary", threadId: "cuid_fake", content: "E2E summary content" } };
    const addSummaryRes = await request.post(`/api/collections/${collectionId}/items`, {
      headers: { Origin: BASE_URL, Referer: BASE_URL, "Content-Type": "application/json" },
      data: summaryPayload
    });
    expect(addSummaryRes.status(), await addSummaryRes.text()).toBe(201);
    const summaryItemId = (await addSummaryRes.json())?.data?.id;
    let threadIdForTest = null;
    let messageIdForTest = null;
    try {
      const threadsRes = await request.get("/api/threads", { headers: { Origin: BASE_URL, Referer: BASE_URL } });
      if (threadsRes.ok()) {
        const threadsBody = await threadsRes.json();
        const threads = threadsBody?.data ?? [];
        if (Array.isArray(threads) && threads.length > 0) {
          threadIdForTest = threads[0]?.id ?? null;
        }
      }
    } catch {
    }
    if (threadIdForTest) {
      const addThreadRes = await request.post(`/api/collections/${collectionId}/items`, {
        headers: { Origin: BASE_URL, Referer: BASE_URL, "Content-Type": "application/json" },
        data: { threadId: threadIdForTest }
      });
      expect([201, 409, 404]).toContain(addThreadRes.status());
      if (addThreadRes.status() === 201) {
        const dupThreadRes = await request.post(`/api/collections/${collectionId}/items`, {
          headers: { Origin: BASE_URL, Referer: BASE_URL, "Content-Type": "application/json" },
          data: { threadId: threadIdForTest }
        });
        expect(dupThreadRes.status()).toBe(409);
        const dupBody = await dupThreadRes.json();
        expect(dupBody?.error?.message ?? dupBody?.error).toMatch(/Already saved/i);
      }
      const savedRes = await request.post("/api/collections/saved", {
        headers: { Origin: BASE_URL, Referer: BASE_URL, "Content-Type": "application/json" },
        data: { threadId: threadIdForTest }
      });
      expect(savedRes.status(), await savedRes.text()).toBe(200);
      const savedBody = await savedRes.json();
      expect(Array.isArray(savedBody?.data)).toBe(true);
      if (addThreadRes.status() === 201) {
        expect(savedBody.data).toContain(collectionId);
      }
      try {
        const msgRes = await request.post("/api/messages", {
          headers: { Origin: BASE_URL, Referer: BASE_URL },
          multipart: { threadId: threadIdForTest, content: `E2E message ${Date.now()}` }
        });
        if (msgRes.ok()) {
          const msgBody = await msgRes.json();
          messageIdForTest = msgBody?.data?.message?.id ?? null;
          if (messageIdForTest) {
            const addMsgRes = await request.post(`/api/collections/${collectionId}/items`, {
              headers: { Origin: BASE_URL, Referer: BASE_URL, "Content-Type": "application/json" },
              data: { messageId: messageIdForTest }
            });
            expect([201, 409]).toContain(addMsgRes.status());
          }
        }
      } catch {
      }
    } else {
      const savedGraphRes = await request.post("/api/collections/saved", {
        headers: { Origin: BASE_URL, Referer: BASE_URL, "Content-Type": "application/json" },
        data: graphPayload
      });
      expect(savedGraphRes.status()).toBe(200);
      const savedGraphBody = await savedGraphRes.json();
      expect(Array.isArray(savedGraphBody?.data)).toBe(true);
      expect(savedGraphBody.data).toContain(collectionId);
    }
    const exportRes = await request.get(`/api/collections/${collectionId}/export`, {
      headers: { Origin: BASE_URL, Referer: BASE_URL }
    });
    expect(exportRes.status(), await exportRes.text()).toBe(200);
    const md = await exportRes.text();
    expect(md).toContain("#");
    expect(md).toMatch(/Graph Snapshot|Graph:|\# E2E/i);
    expect(md).toContain("Summary");
    const getRes = await request.get(`/api/collections/${collectionId}`, {
      headers: { Origin: BASE_URL, Referer: BASE_URL }
    });
    expect(getRes.status()).toBe(200);
    const getBody = await getRes.json();
    const items = getBody?.data?.items ?? [];
    expect(Array.isArray(items)).toBe(true);
    expect(items.length).toBeGreaterThanOrEqual(2);
    const delSummaryRes = await request.delete(`/api/collections/${collectionId}/items?itemId=${summaryItemId}`, {
      headers: { Origin: BASE_URL, Referer: BASE_URL }
    });
    expect(delSummaryRes.status(), await delSummaryRes.text()).toBe(200);
    const delGraphRes = await request.delete(`/api/collections/${collectionId}/items?itemId=${graphItemId}`, {
      headers: { Origin: BASE_URL, Referer: BASE_URL }
    });
    expect(delGraphRes.status()).toBe(200);
    if (secondGraphItemId) {
      const delSecondRes = await request.delete(`/api/collections/${collectionId}/items?itemId=${secondGraphItemId}`, {
        headers: { Origin: BASE_URL, Referer: BASE_URL }
      });
      expect([200, 404]).toContain(delSecondRes.status());
    }
    const delColRes = await request.delete(`/api/collections/${collectionId}`, {
      headers: { Origin: BASE_URL, Referer: BASE_URL }
    });
    expect(delColRes.status(), await delColRes.text()).toBe(200);
    const getAfterDel = await request.get(`/api/collections/${collectionId}`, {
      headers: { Origin: BASE_URL, Referer: BASE_URL }
    });
    expect([404, 400]).toContain(getAfterDel.status());
    expect(errors, String(errors)).toHaveLength(0);
  });
  test("collections page renders without errors", async ({ page }) => {
    const errors = [];
    page.on("pageerror", (e) => errors.push(e.message));
    await page.goto("/dashboard/collections");
    await expect(page.getByText(/Collections|No collections|Create/i).first()).toBeVisible({ timeout: 1e4 });
    expect(errors, errors.join("\n")).toHaveLength(0);
  });
  test("saved checkmark API returns 400 for empty payload", async ({ request }) => {
    const res = await request.post("/api/collections/saved", {
      headers: { Origin: BASE_URL, Referer: BASE_URL, "Content-Type": "application/json" },
      data: {}
    });
    expect(res.status()).toBe(400);
  });
});
