import { chromium } from "@playwright/test";
import { execFileSync } from "node:child_process";
const PORT = process.env.E2E_PORT || "3000";
const BASE_URL = `http://localhost:${PORT}`;
const TEST_EMAIL = "test@sastram.dev";
const TEST_PASSWORD = "TestPassword123!";
async function run(_config) {
  const seedEnv = {
    ...process.env,
    DATABASE_URL: process.env.DATABASE_URL ?? "postgresql://postgres:postgres@localhost:5432/sastram_test"
  };
  for (const script of ["scripts/seed-test-user.ts", "scripts/seed-e2e-thread.ts"]) {
    try {
      execFileSync("bun", [script], {
        cwd: process.cwd(),
        stdio: "inherit",
        env: seedEnv
      });
    } catch (err) {
      console.warn(`[global-setup] seed step ${script} failed (continuing):`, err.message);
    }
  }
  const browser = await chromium.launch();
  const context = await browser.newContext();
  const res = await context.request.post(`${BASE_URL}/api/auth/sign-in/email`, {
    headers: {
      Origin: BASE_URL,
      Referer: `${BASE_URL}/login`,
      "Content-Type": "application/json"
    },
    data: { email: TEST_EMAIL, password: TEST_PASSWORD }
  });
  if (res.status() !== 200) {
    throw new Error(`Sign-in failed with status ${res.status()}: ${await res.text()}`);
  }
  const authDir = `${process.cwd()}/test/e2e/.auth`;
  await import("node:fs").then((fs) => fs.mkdirSync(authDir, { recursive: true }));
  await context.storageState({ path: `${authDir}/user.json` });
  const warmupRoutes = [
    "/dashboard/sai-search",
    "/dashboard/threads",
    "/dashboard/collections",
    "/dashboard",
    "/thread/new-thread-9849b823-5fe6-4f1a-88e0-78178fd06a1d"
  ];
  for (const route of warmupRoutes) {
    try {
      const res2 = await context.request.get(`${BASE_URL}${route}`);
      console.log(`[global-setup] warm ${route} \u2192 ${res2.status()}`);
    } catch (err) {
      console.warn(`[global-setup] warm ${route} failed (continuing):`, err.message);
    }
  }
  await browser.close();
  console.log("[global-setup] Authenticated storage state written.");
}
var global_setup_default = run;
export {
  global_setup_default as default
};
