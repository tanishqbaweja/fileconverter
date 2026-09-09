import {
  chromium,
  expect,
  test,
  type BrowserContext,
  type Page,
} from "@playwright/test";
import { createHash } from "node:crypto";
import { execFile } from "node:child_process";
import { createReadStream, existsSync } from "node:fs";
import { mkdir, readFile, rm, stat, writeFile } from "node:fs/promises";
import path from "node:path";
import { promisify } from "node:util";

const execFileAsync = promisify(execFile);
const projectRoot = path.resolve(import.meta.dirname, "..", "..");
const testPort = process.env.WITHIN_TEST_PORT ?? "3000";
const baseURL =
  process.env.WITHIN_TEST_BASE_URL ?? `http://127.0.0.1:${testPort}`;
const fixtureRoot = path.join(projectRoot, "work", "ivf-input-browser");
const outputRoot = path.join(projectRoot, "outputs", "browser-ivf-input");
const profileRoot = path.join(projectRoot, "work", "playwright-profile-ivf-input");
const installedChromePath =
  "C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe";
const chromePath =
  process.env.WITHIN_CHROME_PATH ??
  (existsSync(installedChromePath)
    ? installedChromePath
    : chromium.executablePath());

const sourceContainers = {
  av1: path.join(projectRoot, "fixtures", "media", "av1-opus-source.mkv"),
  vp8: path.join(projectRoot, "fixtures", "media", "vp8-opus-source.webm"),
  vp9: path.join(projectRoot, "fixtures", "media", "webm-source.webm"),
} as const;
const ivfInputs = {
  av1: path.join(fixtureRoot, "av1.ivf"),
  vp8: path.join(fixtureRoot, "vp8.ivf"),
  vp9: path.join(fixtureRoot, "vp9.ivf"),
} as const;
const corruptIvfPath = path.join(fixtureRoot, "truncated.ivf");

type IvfCodec = keyof typeof ivfInputs;
type IvfProfile = "ivf-to-webm" | "ivf-to-mkv";

interface ConverterState {
  workerStatus: string;
  jobState: "idle" | "running" | "complete" | "cancelled" | "error";
  phase: string;
  error: string | null;
  warnings: string[];
  opfsName: string | null;
  metrics: {
    maxReadChunkBytes: number;
    maxWriteChunkBytes: number;
    peakPendingOperations: number;
    pendingOperations: number;
    peakQueuedBytes: number;
    queuedBytes: number;
    peakWasmMemoryBytes: number;
    activeWorkerCount: number;
  } | null;
}

let context: BrowserContext;
let page: Page;

function assertProjectLocal(target: string): void {
  const relative = path.relative(projectRoot, target);
  if (!relative || relative.startsWith("..") || path.isAbsolute(relative)) {
    throw new Error(`Refusing a non-project test path: ${target}`);
  }
}

async function currentState(): Promise<ConverterState> {
  await page.waitForFunction(() => Boolean(window.__WITHIN_TEST__), null, {
    timeout: 15_000,
  });
  return page.evaluate(() => {
    if (!window.__WITHIN_TEST__) throw new Error("Test bridge is unavailable.");
    return window.__WITHIN_TEST__.getState() as ConverterState;
  });
}

async function startConversion(): Promise<void> {
  const button = page.locator('[data-testid="convert-button"]');
  await expect(button).toBeEnabled({ timeout: 15_000 });
  await button.click();
}

async function copyAndDeleteOpfs(name: string, outputPath: string): Promise<void> {
  const base64 = await page.evaluate(async (entryName) => {
    const root = await navigator.storage.getDirectory();
    try {
      const handle = await root.getFileHandle(entryName);
      const bytes = new Uint8Array(await (await handle.getFile()).arrayBuffer());
      let binary = "";
      for (let offset = 0; offset < bytes.length; offset += 16 * 1024) {
        binary += String.fromCharCode(...bytes.subarray(offset, offset + 16 * 1024));
      }
      return btoa(binary);
    } finally {
      await root.removeEntry(entryName).catch(() => {});
    }
  }, name);
  await writeFile(outputPath, Buffer.from(base64, "base64"));
}

async function ffmpegHash(inputPath: string, copy: boolean): Promise<string> {
  const { stdout } = await execFileAsync(
    "ffmpeg",
    [
      "-v",
      "error",
      "-xerror",
      "-i",
      inputPath,
      "-map",
      "0:v:0",
      ...(copy ? ["-c", "copy"] : []),
      "-f",
      "hash",
      "-hash",
      "sha256",
      "-",
    ],
    { cwd: projectRoot, windowsHide: true, maxBuffer: 8 * 1024 * 1024 },
  );
  return stdout.trim();
}

async function sha256(inputPath: string): Promise<string> {
  const hash = createHash("sha256");
  for await (const chunk of createReadStream(inputPath)) hash.update(chunk);
  return hash.digest("hex");
}

async function runRoute(
  profileId: IvfProfile,
  codec: IvfCodec,
): Promise<void> {
  const extension = profileId === "ivf-to-webm" ? "webm" : "mkv";
  const outputPath = path.join(outputRoot, `${codec}.${extension}`);
  try {
    await page.goto("/?test=1");
    await page.waitForFunction(
      () => window.__WITHIN_TEST__?.getState().workerStatus === "ready",
    );
    await page.locator('[data-testid="file-input"]').setInputFiles(ivfInputs[codec]);
    await page.locator('[data-testid="format-select"]').selectOption(profileId);
    await startConversion();
    await expect
      .poll(async () => (await currentState()).jobState, { timeout: 30_000 })
      .toBe("complete");
    const state = await currentState();
    expect(state.error).toBeNull();
    expect(state.warnings).toEqual([]);
    expect(state.opfsName).toBeTruthy();
    expect(state.metrics?.maxReadChunkBytes).toBeLessThanOrEqual(256 * 1024);
    expect(state.metrics?.maxWriteChunkBytes).toBeLessThanOrEqual(256 * 1024);
    expect(state.metrics?.peakPendingOperations).toBeLessThanOrEqual(1);
    expect(state.metrics?.pendingOperations).toBe(0);
    expect(state.metrics?.peakQueuedBytes).toBeLessThanOrEqual(256 * 1024);
    expect(state.metrics?.queuedBytes).toBe(0);
    expect(state.metrics?.peakWasmMemoryBytes).toBe(32 * 1024 * 1024);
    expect(state.metrics?.activeWorkerCount).toBe(1);

    await copyAndDeleteOpfs(state.opfsName!, outputPath);
    expect((await stat(outputPath)).size).toBeGreaterThan(20_000);
    const { stdout } = await execFileAsync(
      "ffprobe",
      [
        "-v",
        "error",
        "-count_frames",
        "-count_packets",
        "-show_entries",
        "format=format_name:stream=codec_name,codec_type,width,height,nb_read_frames,nb_read_packets",
        "-of",
        "json",
        outputPath,
      ],
      { cwd: projectRoot, windowsHide: true, maxBuffer: 8 * 1024 * 1024 },
    );
    const probe = JSON.parse(stdout) as {
      streams: Array<Record<string, string | number>>;
      format: { format_name: string };
    };
    expect(probe.format.format_name.split(",")).toContain("matroska");
    expect(probe.streams).toHaveLength(1);
    expect(probe.streams[0]?.codec_name).toBe(codec);
    expect(Number(probe.streams[0]?.nb_read_frames)).toBeGreaterThan(0);
    expect(probe.streams[0]?.nb_read_frames).toBe(
      probe.streams[0]?.nb_read_packets,
    );
    expect(await ffmpegHash(outputPath, false)).toBe(
      await ffmpegHash(ivfInputs[codec], false),
    );
    if (codec !== "av1") {
      expect(await ffmpegHash(outputPath, true)).toBe(
        await ffmpegHash(ivfInputs[codec], true),
      );
    }
    await execFileAsync(
      "ffmpeg",
      ["-v", "error", "-xerror", "-ss", "1", "-i", outputPath, "-frames:v", "1", "-f", "null", "NUL"],
      { cwd: projectRoot, windowsHide: true, maxBuffer: 8 * 1024 * 1024 },
    );
    expect(await sha256(outputPath)).toMatch(/^[0-9a-f]{64}$/);
  } finally {
    await rm(outputPath, { force: true });
  }
}

test.beforeAll(async () => {
  for (const target of [fixtureRoot, outputRoot, profileRoot]) assertProjectLocal(target);
  await rm(fixtureRoot, { recursive: true, force: true });
  await rm(outputRoot, { recursive: true, force: true });
  await rm(profileRoot, { recursive: true, force: true });
  await mkdir(fixtureRoot, { recursive: true });
  await mkdir(outputRoot, { recursive: true });
  for (const codec of Object.keys(ivfInputs) as IvfCodec[]) {
    await execFileAsync(
      "ffmpeg",
      [
        "-v",
        "error",
        "-xerror",
        "-nostdin",
        "-y",
        "-i",
        sourceContainers[codec],
        "-map",
        "0:v:0",
        "-c:v",
        "copy",
        "-an",
        "-map_metadata",
        "-1",
        "-fflags",
        "+bitexact",
        "-f",
        "ivf",
        ivfInputs[codec],
      ],
      { cwd: projectRoot, windowsHide: true, maxBuffer: 8 * 1024 * 1024 },
    );
  }
  const vp8 = await readFile(ivfInputs.vp8);
  await writeFile(corruptIvfPath, vp8.subarray(0, vp8.length - 8));
  context = await chromium.launchPersistentContext(profileRoot, {
    executablePath: chromePath,
    headless: true,
    acceptDownloads: false,
    baseURL,
  });
  page = context.pages()[0] ?? (await context.newPage());
});

test.afterAll(async () => {
  await context?.close();
  await rm(fixtureRoot, { recursive: true, force: true });
  await rm(outputRoot, { recursive: true, force: true });
  await rm(profileRoot, { recursive: true, force: true });
});

for (const profileId of ["ivf-to-webm", "ivf-to-mkv"] as const) {
  for (const codec of ["av1", "vp8", "vp9"] as const) {
    test(`${profileId} genuinely packet-copies ${codec.toUpperCase()} in bounded memory`, async () => {
      await runRoute(profileId, codec);
    });
  }
}

test("truncated IVF input fails without retaining partial output", async () => {
  await page.goto("/?test=1");
  await page.waitForFunction(
    () => window.__WITHIN_TEST__?.getState().workerStatus === "ready",
  );
  await page.locator('[data-testid="file-input"]').setInputFiles(corruptIvfPath);
  await page.locator('[data-testid="format-select"]').selectOption("ivf-to-webm");
  await startConversion();
  await expect
    .poll(async () => (await currentState()).jobState, { timeout: 30_000 })
    .toBe("error");
  const state = await currentState();
  expect(state.opfsName).toBeNull();
  expect(state.metrics?.pendingOperations).toBe(0);
  expect(state.metrics?.queuedBytes).toBe(0);
});

test("IVF direct-write failure is propagated and cleaned", async () => {
  await page.goto("/?test=1&directory=1&fault=write");
  await page.waitForFunction(
    () => window.__WITHIN_TEST__?.getState().workerStatus === "ready",
  );
  await page.locator('[data-testid="file-input"]').setInputFiles(ivfInputs.av1);
  await page.locator('[data-testid="format-select"]').selectOption("ivf-to-mkv");
  await startConversion();
  await expect
    .poll(async () => (await currentState()).jobState, { timeout: 30_000 })
    .toBe("error");
  const state = await currentState();
  expect(state.error?.toLowerCase()).toContain("destination rejected a bounded write");
  expect(state.opfsName).toBeNull();
  expect(state.metrics?.pendingOperations).toBe(0);
  expect(state.metrics?.queuedBytes).toBe(0);
});
