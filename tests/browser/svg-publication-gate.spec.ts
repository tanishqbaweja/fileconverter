import { chromium, expect, test, type BrowserContext, type Page } from "@playwright/test";
import { existsSync } from "node:fs";
import path from "node:path";
import { createOwnedRuntimeScratch } from "../../scripts/lib/owned-runtime-scratch.mjs";
import { inspectStressHostMemory } from "../../scripts/lib/host-memory-preflight.mjs";
const root = path.resolve(import.meta.dirname, "../..");
const baseURL = process.env.WITHIN_TEST_BASE_URL ?? `http://127.0.0.1:${process.env.WITHIN_TEST_PORT ?? "3000"}`;
let runtime: Awaited<ReturnType<typeof createOwnedRuntimeScratch>>, context: BrowserContext, page: Page;
test.beforeAll(async () => {
  if (process.platform === "win32") expect((await inspectStressHostMemory()).safeToStart).toBe(true);
  runtime = await createOwnedRuntimeScratch("sg-");
  const installed = "C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe";
  context = await chromium.launchPersistentContext(path.join(runtime.directory, "profile"), {
    executablePath: process.env.WITHIN_CHROME_PATH ?? (existsSync(installed) ? installed : chromium.executablePath()),
    headless: true, env: runtime.env, baseURL, serviceWorkers: "allow" });
  page = await context.newPage();
});
test.afterAll(async () => { try { await context?.close(); } finally { await runtime?.close(); } });
test("public SVG input discloses pending rasterization without exposing it or fetching its engine", async () => {
  const engineRequests: string[] = [], nonReadRequests: string[] = [];
  const requestListener = (request: import("@playwright/test").Request) => {
    if (request.url().includes("/engines/svg/")) engineRequests.push(request.url());
    if (!["GET", "HEAD"].includes(request.method())) nonReadRequests.push(request.method());
  };
  page.on("request", requestListener);
  try {
    await page.goto("/");
    await page.getByTestId("file-input").setInputFiles(path.join(root, "fixtures/images/test-pattern.svg"));
    const notice = page.getByTestId("svg-qualification-notice"); await expect(notice).toBeVisible();
    await expect(notice).toContainText("SVG-to-PNG is temporarily unavailable");
    await expect(notice).toContainText("does not rasterize");
    await expect(page.locator('[data-testid="format-select"] option[value="svg-to-png"]')).toHaveCount(0);
    await expect(page.locator('[data-testid="format-select"] option[value="gzip-compress"]')).toHaveCount(1);
    await page.getByLabel("Search supported formats").fill("svg-to-png");
    await expect(page.locator("#catalogue-results article")).toHaveCount(0);
    expect(engineRequests).toEqual([]); expect(nonReadRequests).toEqual([]);
    if (process.env.WITHIN_SVG_GATE_SCREENSHOT) await notice.screenshot({ path: process.env.WITHIN_SVG_GATE_SCREENSHOT });
  } finally { page.off("request", requestListener); }
});
test("explicit localhost qualification still exposes SVG without claiming public support or converting", async () => {
  await page.goto("/?test=1");
  await page.getByTestId("file-input").setInputFiles(path.join(root, "fixtures/images/test-pattern.svg"));
  await expect(page.locator('[data-testid="format-select"] option[value="svg-to-png"]')).toHaveCount(1);
  await expect(page.getByTestId("svg-qualification-notice")).toHaveCount(0);
  await page.getByLabel("Search supported formats").fill("svg-to-png");
  await expect(page.locator("#catalogue-results article")).toHaveCount(0);
});
