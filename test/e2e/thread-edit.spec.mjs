import { test, expect } from "@playwright/test";
const BASE_URL = `http://localhost:${process.env.E2E_PORT || "3000"}`;
const HDR = { Origin: BASE_URL, Referer: BASE_URL, "Content-Type": "application/json" };
test.describe("Thread edit flows (no full-page reloads)", () => {
  test("create \u2192 post \u2192 edit message \u2192 edit title \u2192 tags \u2192 react \u2192 status GETs", async ({
    page,
    request
  }) => {
    const errors = [];
    page.on("pageerror", (e) => errors.push(e.message));
    const stamp = Date.now();
    const title = `E2E Thread ${stamp} xqz`;
    const editedTitle = `E2E Thread ${stamp} xqz (renamed)`;
    const body = `Original message ${stamp}`;
    const editedBody = `Edited message ${stamp}`;
    await page.goto("/dashboard/threads");
    await page.getByRole("button", { name: "Create Thread" }).first().click();
    await page.locator("#thread-title").fill(title);
    await page.locator("#thread-description").fill("E2E context");
    await page.getByRole("button", { name: "Publish thread" }).click();
    await expect(page).toHaveURL(/\/dashboard\/threads\/.+/, { timeout: 15e3 });
    const slug = page.url().split("/").pop();
    await expect(page.locator("header").getByText(title)).toBeVisible();
    const listRes = await request.get("/api/threads", { headers: { ...HDR } });
    expect(listRes.ok(), await listRes.text()).toBe(true);
    const threads = (await listRes.json())?.data?.threads ?? [];
    const threadId = threads.find((t) => t.slug === slug)?.id;
    if (!threadId) throw new Error("created thread missing from /api/threads list");
    const msgRes = await request.post("/api/messages", {
      headers: { Origin: BASE_URL, Referer: BASE_URL },
      multipart: { threadId, content: body }
    });
    expect(msgRes.ok(), await msgRes.text()).toBe(true);
    const messageId = (await msgRes.json())?.data?.message?.id;
    if (!messageId) throw new Error("message creation returned no id");
    await page.reload();
    const row = page.locator(`#message-${messageId}`);
    await expect(row.getByText(body)).toBeVisible();
    const urlBeforeEdit = page.url();
    await row.hover();
    await row.getByTitle("Edit message").click();
    await page.locator("textarea:focus").fill(editedBody);
    await row.getByRole("button", { name: "Save", exact: true }).click();
    await expect(row.getByText(editedBody)).toBeVisible();
    await expect(row.getByText(body, { exact: true })).toHaveCount(0);
    expect(page.url()).toBe(urlBeforeEdit);
    await row.getByRole("button", { name: "edited" }).click();
    await expect(row.getByText("Edit history")).toBeVisible();
    await expect(row.getByText(body)).toBeVisible();
    await page.getByRole("button", { name: "Edit thread" }).click();
    await page.locator("#edit-thread-title").fill(editedTitle);
    await page.getByRole("button", { name: "Save changes" }).click();
    await expect(page.locator("header").getByText(editedTitle)).toBeVisible();
    expect(page.url()).toBe(urlBeforeEdit);
    await page.getByRole("button", { name: "Tag", exact: true }).click();
    await page.getByPlaceholder("Search tags\u2026").fill("e2eprobe");
    await page.getByRole("button", { name: "#e2eprobe" }).click();
    await expect(page.getByText("#e2eprobe").first()).toBeVisible();
    expect(page.url()).toBe(urlBeforeEdit);
    await page.keyboard.press("Escape");
    await page.getByRole("button", { name: "Remove #e2eprobe" }).click();
    await expect(page.getByText("#e2eprobe")).toHaveCount(0);
    await row.hover();
    await row.getByRole("button", { name: "Add reaction" }).click();
    const picker = page.locator("[data-emoji-picker]");
    const pickerSearch = picker.getByPlaceholder("Search emoji");
    await expect(pickerSearch).toBeVisible({ timeout: 15e3 });
    await pickerSearch.fill("thumbs up");
    await picker.getByRole("gridcell", { name: "thumbs up" }).click();
    const reactionChip = row.getByRole("button", { name: /👍 1 reaction, including you/ });
    await expect(reactionChip).toBeVisible();
    await expect(reactionChip).toHaveAttribute("aria-pressed", "true");
    expect(page.url()).toBe(urlBeforeEdit);
    await page.waitForTimeout(1500);
    await page.reload();
    const reloadedRow = page.locator(`#message-${messageId}`);
    await expect(reloadedRow.getByText(editedBody)).toBeVisible();
    await expect(
      reloadedRow.getByRole("button", { name: /👍 1 reaction, including you/ })
    ).toBeVisible();
    const sumRes = await request.get(
      `/api/ai/thread-summary?threadId=${threadId}`,
      { headers: { ...HDR } }
    );
    expect(sumRes.ok(), await sumRes.text()).toBe(true);
    const sumBody = await sumRes.json();
    expect(sumBody).toMatchObject({ success: true });
    expect(sumBody?.data).toHaveProperty("summary");
    const scoreRes = await request.get(
      `/api/ai/resolution-score?threadId=${threadId}`,
      { headers: { ...HDR } }
    );
    expect(scoreRes.ok(), await scoreRes.text()).toBe(true);
    const scoreBody = await scoreRes.json();
    expect(scoreBody).toMatchObject({ success: true });
    expect(scoreBody?.data).toHaveProperty("score");
    await expect(page.getByText("Invalid input")).toHaveCount(0);
    expect(errors, errors.join("\n")).toHaveLength(0);
  });
});
