import { expect, test, chromium, type BrowserContext, type Page } from "@playwright/test";
import { existsSync } from "node:fs";
import { mkdir, rm } from "node:fs/promises";
import path from "node:path";

const projectRoot = path.resolve(import.meta.dirname, "..", "..");
const profileRoot = path.join(projectRoot, "work", "playwright-profile-small");
const installedChromePath =
  "C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe";
const chromePath =
  process.env.WITHIN_CHROME_PATH ??
  (existsSync(installedChromePath)
    ? installedChromePath
    : chromium.executablePath());

let context: BrowserContext;
let page: Page;
const browserDiagnostics: string[] = [];

interface TestState {
  jobState: "idle" | "running" | "complete" | "cancelled" | "error";
  phase: string;
  metrics: {
    inputBytes: number;
    outputBytes: number;
    queuedBytes: number;
    peakQueuedBytes: number;
    pendingOperations: number;
    peakPendingOperations: number;
    maxReadChunkBytes: number;
    maxWriteChunkBytes: number;
    elapsedMs: number;
  } | null;
  error: string | null;
  warnings: string[];
  selectedProfileId: string | null;
  opfsName: string | null;
  workerStatus: "starting" | "ready" | "error";
}

async function currentState(): Promise<TestState> {
  return page.evaluate(() => {
    if (!window.__WITHIN_TEST__) throw new Error("Test bridge is unavailable.");
    return window.__WITHIN_TEST__.getState();
  });
}

async function selectFixture(relativePath: string, profileId: string) {
  await page.locator('[data-testid="file-input"]').setInputFiles(
    path.join(projectRoot, relativePath),
  );
  await expect(page.locator('[data-testid="format-select"]')).toBeVisible();
  await page.locator('[data-testid="format-select"]').selectOption(profileId);
}

async function convert(): Promise<TestState> {
  await page.locator('[data-testid="convert-button"]').click();
  await expect
    .poll(
      async () => {
        const state = await currentState();
        return state.jobState === "running" ? "running" : state.jobState;
      },
      { timeout: 45_000 },
    )
    .not.toBe("running");
  const state = await currentState();
  expect(state.jobState, state.error ?? state.phase).toBe("complete");
  expect(state.error).toBeNull();
  expect(state.opfsName).not.toBeNull();
  expect(state.metrics?.pendingOperations).toBe(0);
  expect(state.metrics?.queuedBytes).toBe(0);
  expect(state.metrics?.peakPendingOperations).toBeLessThanOrEqual(1);
  expect(state.metrics?.maxWriteChunkBytes).toBeLessThanOrEqual(256 * 1024);
  return state;
}

async function readAndDeleteOpfsText(name: string): Promise<string> {
  return page.evaluate(async (opfsName) => {
    const root = await navigator.storage.getDirectory();
    const handle = await root.getFileHandle(opfsName);
    const file = await handle.getFile();
    const text = await file.text();
    await root.removeEntry(opfsName);
    return text;
  }, name);
}

test.beforeAll(async () => {
  await rm(profileRoot, { recursive: true, force: true });
  await mkdir(profileRoot, { recursive: true });
  context = await chromium.launchPersistentContext(profileRoot, {
    executablePath: chromePath,
    headless: true,
    acceptDownloads: false,
    baseURL: "http://127.0.0.1:3000",
  });
  page = context.pages()[0] ?? (await context.newPage());
  page.on("console", (message) => {
    browserDiagnostics.push(`console:${message.type()}:${message.text()}`);
  });
  page.on("pageerror", (error) => {
    browserDiagnostics.push(`pageerror:${error.message}`);
  });
  page.on("response", (response) => {
    if (response.status() >= 400) {
      browserDiagnostics.push(`response:${response.status()}:${response.url()}`);
    }
  });
  page.on("requestfailed", (request) => {
    browserDiagnostics.push(
      `requestfailed:${request.url()}:${request.failure()?.errorText ?? "unknown"}`,
    );
  });
  page.on("worker", (worker) => {
    browserDiagnostics.push(`worker:${worker.url()}`);
    worker.on("close", () => {
      browserDiagnostics.push(`worker-closed:${worker.url()}`);
    });
  });
  await page.goto("/?test=1");
  await expect(page.getByRole("heading", { name: "Big files. Small memory." })).toBeVisible();
  expect(await page.evaluate(() => window.crossOriginIsolated)).toBe(true);
  await page.waitForTimeout(1_000);
  const workerState = await currentState();
  expect(
    workerState.workerStatus,
    `${workerState.error ?? workerState.phase}\n${browserDiagnostics.join("\n")}`,
  ).toBe("ready");
});

test.afterAll(async () => {
  await context?.close();
  await rm(profileRoot, { recursive: true, force: true });
});

test.beforeEach(async () => {
  await page.goto("/?test=1");
});

test("converts SRT to valid WebVTT with bounded writes", async () => {
  await selectFixture("fixtures/subtitles/sample.srt", "srt-to-vtt");
  const state = await convert();
  const output = await readAndDeleteOpfsText(state.opfsName!);
  expect(output.startsWith("WEBVTT\r\n\r\n")).toBe(true);
  expect(output).toContain("00:00:01.250 --> 00:00:03.900");
  expect(output).toContain("<i>Hello</i> from Within.");
});

test("converts WebVTT to SRT and discloses unsupported positioning", async () => {
  await selectFixture("fixtures/subtitles/sample.vtt", "vtt-to-srt");
  const state = await convert();
  const output = await readAndDeleteOpfsText(state.opfsName!);
  expect(output).toContain("1\r\n00:00:01,250 --> 00:00:03,900\r\n");
  expect(output).not.toContain("position:20%");
  expect(output).toContain("2\r\n00:00:04,100 --> 00:00:07,000\r\n");
});

test("streams quoted CSV records to NDJSON", async () => {
  await selectFixture("fixtures/data/sample.csv", "csv-to-ndjson");
  const state = await convert();
  const output = await readAndDeleteOpfsText(state.opfsName!);
  const rows = output
    .trim()
    .split("\n")
    .map((line) => JSON.parse(line));
  expect(rows).toEqual([
    { name: "alpha", note: 'comma, quote "and" newline\ninside', count: "2" },
    { name: "βeta", note: "Unicode survives", count: "3" },
  ]);
});

test("streams quoted CSV records to TSV", async () => {
  await selectFixture("fixtures/data/sample.csv", "csv-to-tsv");
  const state = await convert();
  const output = await readAndDeleteOpfsText(state.opfsName!);
  expect(output).toContain("name\tnote\tcount\r\n");
  expect(output).toContain(
    "alpha\t\"comma, quote \"\"and\"\" newline\ninside\"\t2\r\n",
  );
});

test("streams TSV records to CSV", async () => {
  await selectFixture("fixtures/data/sample.tsv", "tsv-to-csv");
  const state = await convert();
  const output = await readAndDeleteOpfsText(state.opfsName!);
  expect(output).toContain("name,note,count\r\n");
  expect(output).toContain("βeta,Unicode survives,3\r\n");
});

test("streams TSV records to NDJSON", async () => {
  await selectFixture("fixtures/data/sample.tsv", "tsv-to-ndjson");
  const state = await convert();
  const output = await readAndDeleteOpfsText(state.opfsName!);
  const rows = output
    .trim()
    .split("\n")
    .map((line) => JSON.parse(line));
  expect(rows[1]).toEqual({
    name: "βeta",
    note: "Unicode survives",
    count: "3",
  });
});

test("streams NDJSON objects to TSV", async () => {
  await selectFixture("fixtures/data/sample.ndjson", "ndjson-to-tsv");
  const state = await convert();
  const output = await readAndDeleteOpfsText(state.opfsName!);
  expect(output).toContain("name\tnote\tcount\r\n");
  expect(output).toContain("βeta\tUnicode survives\t3\r\n");
});

test("streams NDJSON objects to CSV", async () => {
  await selectFixture("fixtures/data/sample.ndjson", "ndjson-to-csv");
  const state = await convert();
  const output = await readAndDeleteOpfsText(state.opfsName!);
  expect(output).toContain("name,note,count\r\n");
  expect(output).toContain(
    "alpha,\"comma, quote \"\"and\"\" newline\ninside\",2\r\n",
  );
});

test("compresses a file with browser GZIP and verifies it in-browser", async () => {
  await selectFixture("fixtures/data/sample.csv", "gzip-compress");
  const state = await convert();
  const output = await page.evaluate(async (opfsName) => {
    const root = await navigator.storage.getDirectory();
    const handle = await root.getFileHandle(opfsName);
    const compressed = await handle.getFile();
    const text = await new Response(
      compressed.stream().pipeThrough(new DecompressionStream("gzip")),
    ).text();
    await root.removeEntry(opfsName);
    return { text, compressedBytes: compressed.size };
  }, state.opfsName!);
  expect(output.text).toContain("Unicode survives");
  expect(output.compressedBytes).toBeGreaterThan(20);
});

test("decompresses browser GZIP without buffering the output", async () => {
  await selectFixture(
    "fixtures/compression/sample.txt.gz",
    "gzip-decompress",
  );
  const state = await convert();
  const output = await readAndDeleteOpfsText(state.opfsName!);
  expect(output).toBe(
    "Within deterministic GZIP fixture.\n" +
      "Unicode: β, हिन्दी, 日本語.\n" +
      "The decompressed bytes must match exactly.\n",
  );
});
