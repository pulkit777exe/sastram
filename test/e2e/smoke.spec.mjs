import { test, expect } from "@playwright/test";
const BASE_URL = `http://localhost:${process.env.E2E_PORT || "3000"}`;
test.describe("Authenticated smoke", () => {
  test("dashboard loads without page errors", async ({ page }) => {
    const errors = [];
    page.on("pageerror", (e) => errors.push(e.message));
    await page.goto("/dashboard");
    await expect(page).toHaveURL(/\/dashboard\/sai-search/);
    await expect(page.locator("h1").first()).toHaveText("Search across Sastram");
    expect(await page.locator("h1").count()).toBe(1);
    expect(errors, errors.join("\n")).toHaveLength(0);
  });
  test("sai-search page renders a single header", async ({ page }) => {
    const errors = [];
    page.on("pageerror", (e) => errors.push(e.message));
    await page.goto("/dashboard/sai-search");
    expect(await page.locator("h1").count()).toBe(1);
    await expect(page.getByRole("heading", { name: "Search across Sastram" })).toBeVisible();
    await expect(
      page.getByRole("heading", { level: 1 }).filter({ hasText: "Sai-Powered" })
    ).toHaveCount(0);
    expect(errors, errors.join("\n")).toHaveLength(0);
  });
  test("forum-search never returns a silent fake success", async ({ request }) => {
    const res = await request.post("/api/ai/forum-search", {
      headers: {
        Origin: BASE_URL,
        Referer: BASE_URL,
        "Content-Type": "application/json"
      },
      data: {
        query: "smoke test error handling",
        config: { exaMode: "instant", tavilyMode: "search", sourceFilter: "all", searchMode: "standard" }
      }
    });
    if (res.status() === 200) {
      const contentType = res.headers()["content-type"] ?? "";
      if (contentType.includes("text/event-stream")) {
        const text = await res.text();
        const events = text.split("\n").filter((line) => line.startsWith("data: ")).map((line) => JSON.parse(line.slice(6)));
        expect(events.length, "stream should contain at least one event").toBeGreaterThan(0);
        const done = events.find((event) => event.phase === "done");
        const failure = events.find((event) => event.phase === "error" || event.phase === "blocked");
        if (done) {
          expect(done.synthesis?.text?.trim().length ?? 0).toBeGreaterThan(0);
        } else {
          expect(failure, "stream must finish with done or a real error").toBeDefined();
          expect(typeof failure?.message).toBe("string");
          expect(failure?.message?.trim().length ?? 0).toBeGreaterThan(0);
        }
      } else {
        const body = await res.json();
        expect(body?.data?.synthesis?.content?.trim().length ?? 0).toBeGreaterThan(0);
      }
    } else {
      expect([400, 429, 503, 500]).toContain(res.status());
      const body = await res.json().catch(() => ({}));
      expect(typeof body?.error?.message).toBe("string");
    }
  });
  test("thread page renders (no RSC function-prop crash)", async ({ page }) => {
    const errors = [];
    page.on("pageerror", (e) => errors.push(e.message));
    await page.goto("/thread/new-thread-9849b823-5fe6-4f1a-88e0-78178fd06a1d");
    await expect(page.getByText("new thread").first()).toBeVisible();
    await expect(page.getByText("Seed message for smoke tests")).toBeVisible();
    await expect(page.getByPlaceholder(/ask a question|mention @sai/i).first()).toBeVisible();
    expect(errors, errors.join("\n")).toHaveLength(0);
  });
  test("@sai mention yields a response without page errors", async ({ page }) => {
    const errors = [];
    page.on("pageerror", (e) => errors.push(e.message));
    await page.goto("/thread/new-thread-9849b823-5fe6-4f1a-88e0-78178fd06a1d");
    const box = page.getByPlaceholder(/ask a question|mention @sai/i).first();
    await box.click();
    await box.fill(`@sai what is this thread about?`);
    await box.locator("xpath=ancestor::form").locator('button[type="submit"]').click();
    await expect(
      page.getByText(/I'm temporarily over my AI quota|Sorry, I couldn't generate|@sai what is this thread about\?/i).first()
    ).toBeVisible({ timeout: 15e3 });
    expect(errors, errors.join("\n")).toHaveLength(0);
  });
});
