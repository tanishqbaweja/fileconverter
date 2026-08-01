import { chromium, expect, test, type BrowserContext, type Page } from "@playwright/test";
import { existsSync } from "node:fs";
import { mkdir, rm } from "node:fs/promises";
import path from "node:path";

const projectRoot = path.resolve(import.meta.dirname, "..", "..");
const testPort = process.env.WITHIN_TEST_PORT ?? "3000";
const baseURL =
  process.env.WITHIN_TEST_BASE_URL ?? `http://127.0.0.1:${testPort}`;
const expectedOrigin = new URL(baseURL).origin;
const profileRoot = path.join(projectRoot, "work", "playwright-profile-privacy");
const installedChromePath =
  "C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe";
const chromePath =
  process.env.WITHIN_CHROME_PATH ??
  (existsSync(installedChromePath)
    ? installedChromePath
    : chromium.executablePath());
const fixturePath = path.join(projectRoot, "fixtures", "data", "sample.csv");
const tarFixturePath = path.join(
  projectRoot,
  "fixtures",
  "archives",
  "sample.tar",
);

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
    baseURL,
    serviceWorkers: "allow",
  });
  await context.addInitScript(() => {
    Object.defineProperty(window, "showSaveFilePicker", {
      configurable: true,
      value: async (options?: { suggestedName?: string }) => {
        const root = await navigator.storage.getDirectory();
        return root.getFileHandle(options?.suggestedName ?? "within-output.bin", {
          create: true,
        });
      },
    });
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
    expect(new URL(request.url).origin).toBe(expectedOrigin);
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
  expect(cachedPaths).toContain("/engines/remux/within-mpeg4.wasm");
  expect(cachedPaths).toContain("/engines/remux/within-mpeg4.mjs");
  expect(cachedPaths).toContain("/engines/remux/within-webm.wasm");
  expect(cachedPaths).toContain("/engines/remux/within-webm.mjs");
  expect(cachedPaths).toContain("/engines/tiff/within-tiff.wasm");
  expect(cachedPaths).toContain("/engines/tiff/within-tiff.mjs");
  expect(cachedPaths).toContain("/engines/svg/resvg.wasm");
  expect(cachedPaths).toContain("/engines/archive7z/within-archive7z.wasm");
  expect(cachedPaths).toContain("/engines/archive7z/within-archive7z.mjs");

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

test("cached direct destination writer converts while offline", async () => {
  const outputName = "sample.tsv";
  const convertDirect = async () => {
    await page.locator('[data-testid="file-input"]').setInputFiles(fixturePath);
    await page
      .locator('[data-testid="format-select"]')
      .selectOption("csv-to-tsv");
    await page.getByRole("button", { name: /Choose destination file/ }).click();
    await expect(page.getByRole("button", { name: new RegExp(outputName) })).toBeVisible();
    await page.locator('[data-testid="convert-button"]').click();
    await expect(page.locator('[data-testid="convert-button"]')).toHaveText(
      /Convert again/,
      { timeout: 45_000 },
    );
    return page.evaluate(async (entryName) => {
      const root = await navigator.storage.getDirectory();
      const handle = await root.getFileHandle(entryName);
      const text = await (await handle.getFile()).text();
      await root.removeEntry(entryName);
      return text;
    }, outputName);
  };

  await page.goto("/");
  await page.evaluate(() => navigator.serviceWorker.ready);
  await page.reload();
  await page.evaluate(() => navigator.serviceWorker.ready);
  expect(await convertDirect()).toContain("name\tnote\tcount");
  const writerCached = await page.evaluate(async () => {
    const requests = (
      await Promise.all(
        (await caches.keys())
          .filter((key) => key.startsWith("within-"))
          .map(async (key) => (await caches.open(key)).keys()),
      )
    ).flat();
    return requests.some((request) =>
      /\/assets\/direct-file-writer\.worker-[^/]+\.js$/.test(
        new URL(request.url).pathname,
      ),
    );
  });
  expect(writerCached).toBe(true);

  await context.setOffline(true);
  try {
    await page.reload({ waitUntil: "domcontentloaded" });
    expect(await convertDirect()).toContain("name\tnote\tcount");
  } finally {
    await context.setOffline(false);
    await page.evaluate(async (entryName) => {
      const root = await navigator.storage.getDirectory();
      await root.removeEntry(entryName).catch(() => {});
    }, outputName).catch(() => {});
  }
});

test("cached TAR-to-7Z engine converts offline and removes scratch", async () => {
  const outputName = "sample.7z";
  const convertTarDirect = async () => {
    await expect(
      page.getByRole("heading", { name: "Big files. Small memory." }),
    ).toBeVisible();
    await page
      .locator('[data-testid="file-input"]')
      .setInputFiles(tarFixturePath);
    await page
      .locator('[data-testid="format-select"]')
      .selectOption("tar-to-sevenzip");
    await page.getByRole("button", { name: /Choose destination file/ }).click();
    await page.locator('[data-testid="convert-button"]').click();
    await expect(page.locator('[data-testid="convert-button"]')).toHaveText(
      /Convert again/,
      { timeout: 45_000 },
    );
    return page.evaluate(async (entryName) => {
      const root = await navigator.storage.getDirectory();
      const handle = await root.getFileHandle(entryName);
      const file = await handle.getFile();
      const magic = Array.from(
        new Uint8Array(await file.slice(0, 6).arrayBuffer()),
      );
      const leftovers: string[] = [];
      for await (const [name] of root.entries()) {
        if (name.startsWith("within-sevenzip-scratch-")) leftovers.push(name);
      }
      await root.removeEntry(entryName);
      return { bytes: file.size, magic, leftovers };
    }, outputName);
  };

  await page.goto("/");
  await page.evaluate(() => navigator.serviceWorker.ready);
  await page.reload();
  await page.evaluate(() => navigator.serviceWorker.ready);
  expect((await convertTarDirect()).magic).toEqual([
    0x37, 0x7a, 0xbc, 0xaf, 0x27, 0x1c,
  ]);

  await context.setOffline(true);
  try {
    await page.reload({ waitUntil: "domcontentloaded" });
    const result = await convertTarDirect();
    expect(result.bytes).toBeGreaterThan(32);
    expect(result.magic).toEqual([0x37, 0x7a, 0xbc, 0xaf, 0x27, 0x1c]);
    expect(result.leftovers).toEqual([]);
  } finally {
    await context.setOffline(false);
    await page.evaluate(async (entryName) => {
      const root = await navigator.storage.getDirectory();
      await root.removeEntry(entryName).catch(() => {});
      for await (const [name] of root.entries()) {
        if (name.startsWith("within-sevenzip-scratch-")) {
          await root.removeEntry(name).catch(() => {});
        }
      }
    }, outputName).catch(() => {});
  }
});

test("static codec assets preserve cross-origin isolation for pthread workers", async () => {
  const response = await page.request.get("/engines/remux/within-remux.mjs");
  expect(response.ok()).toBe(true);
  expect(response.headers()["cross-origin-embedder-policy"]).toBe(
    "require-corp",
  );
  expect(response.headers()["cross-origin-opener-policy"]).toBe("same-origin");
  expect(response.headers()["cross-origin-resource-policy"]).toBe("same-origin");
});
