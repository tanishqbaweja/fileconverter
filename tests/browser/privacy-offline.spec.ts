import { chromium, expect, test, type BrowserContext, type Page } from "@playwright/test";
import { existsSync } from "node:fs";
import { mkdir, rm } from "node:fs/promises";
import path from "node:path";

const projectRoot = path.resolve(import.meta.dirname, "..", "..");
const profileRoot = path.join(projectRoot, "work", "playwright-profile-privacy");
const installedChromePath =
  "C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe";
const chromePath =
  process.env.WITHIN_CHROME_PATH ??
  (existsSync(installedChromePath)
    ? installedChromePath
    : chromium.executablePath());
const fixturePath = path.join(projectRoot, "fixtures", "data", "sample.csv");

let context: BrowserContext;
let page: Page;

async function waitForWorker() {
  await page.waitForFunction(
    () => window.__WITHIN_TEST__?.getState().workerStatus === "ready",
  );
}

test.beforeAll(async () => {
  await rm(profileRoot, { recursive: true, force: true });
  await mkdir(profileRoot, { recursive: true });
  context = await chromium.launchPersistentContext(profileRoot, {
    executablePath: chromePath,
    headless: true,
    baseURL: "http://127.0.0.1:3000",
    serviceWorkers: "allow",
  });
  page = context.pages()[0] ?? (await context.newPage());
});

test.afterAll(async () => {
  await context?.setOffline(false);
  await context?.close();
  await rm(profileRoot, { recursive: true, force: true });
});

test("conversion transmits no filename or file content", async () => {
  const observed: Array<{
    method: string;
    url: string;
    body: string | null;
  }> = [];
  const observe = (request: {
    method(): string;
    url(): string;
    postData(): string | null;
  }) => {
    observed.push({
      method: request.method(),
      url: request.url(),
      body: request.postData(),
    });
  };
  page.on("request", observe);
  try {
    await page.goto("/?test=1");
    await waitForWorker();
    await page.locator('[data-testid="file-input"]').setInputFiles(fixturePath);
    await page
      .locator('[data-testid="format-select"]')
      .selectOption("csv-to-tsv");
    await page.locator('[data-testid="convert-button"]').click();
    await expect
      .poll(
        () =>
          page.evaluate(
            () => window.__WITHIN_TEST__?.getState().jobState ?? "missing",
          ),
        { timeout: 45_000 },
      )
      .toBe("complete");

    const state = await page.evaluate(() => window.__WITHIN_TEST__!.getState());
    expect(state.opfsName).toBeTruthy();
    await page.evaluate(async (name) => {
      const root = await navigator.storage.getDirectory();
      await root.removeEntry(name!);
    }, state.opfsName);
  } finally {
    page.off("request", observe);
  }

  expect(observed.length).toBeGreaterThan(0);
  for (const request of observed) {
    expect(new URL(request.url).origin).toBe("http://127.0.0.1:3000");
    expect(request.method).toBe("GET");
    expect(request.body).toBeNull();
    expect(request.url).not.toContain("sample.csv");
    expect(request.url).not.toContain("alpha");
  }
});

test("installed app shell and conversion engine load offline", async () => {
  await page.goto("/");
  await expect(
    page.getByRole("heading", { name: "Big files. Small memory." }),
  ).toBeVisible();
  await page.evaluate(() => navigator.serviceWorker.ready);
  await page.reload();
  await page.evaluate(() => navigator.serviceWorker.ready);
  const cachedPaths = await page.evaluate(async () => {
    const keys = await caches.keys();
    const requests = (
      await Promise.all(
        keys
          .filter((key) => key.startsWith("within-"))
          .map(async (key) => (await caches.open(key)).keys()),
      )
    ).flat();
    return requests.map((request) => new URL(request.url).pathname);
  });
  expect(cachedPaths).toContain("/engines/remux/within-remux.wasm");
  expect(cachedPaths).toContain("/engines/remux/within-remux.mjs");

  await context.setOffline(true);
  try {
    await page.reload({ waitUntil: "domcontentloaded" });
    await expect(
      page.getByRole("heading", { name: "Big files. Small memory." }),
    ).toBeVisible();
  } finally {
    await context.setOffline(false);
  }
});
