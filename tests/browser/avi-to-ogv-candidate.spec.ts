import {
  chromium,
  expect,
  test,
  type BrowserContext,
  type Page,
  type Worker as PlaywrightWorker,
} from "@playwright/test";
import { execFile } from "node:child_process";
import { once } from "node:events";
import { createWriteStream, existsSync, type WriteStream } from "node:fs";
import { mkdir, rm } from "node:fs/promises";
import path from "node:path";
import { promisify } from "node:util";

const execFileAsync = promisify(execFile);
const projectRoot = path.resolve(import.meta.dirname, "..", "..");
const testPort = process.env.WITHIN_TEST_PORT ?? "3000";
const baseURL =
  process.env.WITHIN_TEST_BASE_URL ?? `http://127.0.0.1:${testPort}`;
const profileRoot = path.join(
  projectRoot,
  "work",
  "playwright-profile-avi-to-ogv",
);
const outputPath = path.join(projectRoot, "work", "avi-to-ogv-output.ogv");
const fixturePath = path.resolve(
  projectRoot,
  process.env.WITHIN_AVI_TO_OGV_FIXTURE ??
    "fixtures/media/legacy-video-source.avi",
);
const m2vFixturePath = path.join(
  projectRoot,
  "fixtures",
  "media",
  "mpeg2-video-source.m2v",
);
const mp4SourceFixturePath = path.resolve(
  projectRoot,
  "fixtures/media/remux-source.mkv",
);
const mp4FixturePath = path.join(projectRoot, "work", "mp4-to-ogv-source.mp4");
const theoraWasmPath = path.join(
  projectRoot,
  "public",
  "engines",
  "remux",
  "within-theora.wasm",
);
const installedChromePath =
  "C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe";
const chromePath = existsSync(installedChromePath)
  ? installedChromePath
  : chromium.executablePath();

interface Metrics {
  inputBytes: number;
  outputBytes: number;
  queuedBytes: number;
  peakQueuedBytes: number;
  pendingOperations: number;
  peakPendingOperations: number;
  maxReadChunkBytes: number;
  maxWriteChunkBytes: number;
  wasmMemoryBytes?: number;
  peakWasmMemoryBytes?: number;
  activeWorkerCount?: number;
}

interface ConversionResult {
  type: "complete" | "error" | "cancelled";
  message?: string;
  opfsName?: string;
  metrics: Metrics;
  warnings: string[];
}

let context: BrowserContext;
let page: Page;
let appWorker: PlaywrightWorker;
let validationSink: WriteStream | null = null;

async function runConversion(
  outputName: string,
  testFault?: "write",
  videoOptions?: {
    codec: "automatic" | "theora";
    maxWidth: 0 | 320 | 480 | 640;
    bitRateBps: 0 | 300_000;
    frameRateFps: 0 | 15 | 24 | 25 | 30;
    quality: "automatic" | "smaller" | "balanced" | "higher";
  },
  profileId: "avi-to-ogv" | "mp4-to-ogv" | "m2v-to-ogv" = "avi-to-ogv",
): Promise<ConversionResult> {
  const workerUrl = appWorker.url();
  return page.evaluate(
    async ({ workerUrl, outputName, testFault, videoOptions, profileId }) => {
      const input = document.querySelector<HTMLInputElement>(
        '[data-testid="file-input"]',
      );
      const file = input?.files?.[0];
      if (!file) throw new Error("The source fixture was not attached.");
      const worker = new Worker(workerUrl, {
        name: `within-${profileId}`,
        type: "module",
      });
      const warnings: string[] = [];
      try {
        return await new Promise<ConversionResult>((resolve, reject) => {
          const timeout = window.setTimeout(
            () => reject(new Error(`${profileId} conversion timed out.`)),
            90_000,
          );
          const finish = (result: ConversionResult) => {
            window.clearTimeout(timeout);
            resolve({ ...result, warnings });
          };
          const jobId = crypto.randomUUID();
          worker.onerror = (event) => {
            window.clearTimeout(timeout);
            reject(new Error(event.message || `${profileId} worker crashed.`));
          };
          worker.onmessage = (event) => {
            const message = event.data;
            if (message.type === "ready") {
              worker.postMessage({
                type: "start",
                jobId,
                profileId,
                file,
                destination: { mode: "opfs-test", name: outputName },
                ...(testFault ? { testFault } : {}),
                ...(videoOptions ? { videoOptions } : {}),
              });
            } else if (message.jobId !== jobId) {
              return;
            } else if (message.type === "warning") {
              warnings.push(message.message);
            } else if (
              message.type === "complete" ||
              message.type === "error" ||
              message.type === "cancelled"
            ) {
              finish(message);
            }
          };
        });
      } finally {
        worker.terminate();
      }
    },
    { workerUrl, outputName, testFault, videoOptions, profileId },
  );
}

async function copyAndDeleteOutput(name: string): Promise<void> {
  const sink = createWriteStream(outputPath, { flags: "w" });
  validationSink = sink;
  try {
    await page.evaluate(async (entryName) => {
      const root = await navigator.storage.getDirectory();
      try {
        const handle = await root.getFileHandle(entryName);
        const reader = (await handle.getFile()).stream().getReader();
        for (;;) {
          const { done, value } = await reader.read();
          if (done) break;
          for (let offset = 0; offset < value.byteLength; offset += 64 * 1024) {
            const part = value.subarray(
              offset,
              Math.min(offset + 64 * 1024, value.byteLength),
            );
            let binary = "";
            for (let inner = 0; inner < part.byteLength; inner += 16 * 1024) {
              binary += String.fromCharCode(
                ...part.subarray(
                  inner,
                  Math.min(inner + 16 * 1024, part.byteLength),
                ),
              );
            }
            await (
              window as typeof window & {
                __withinAviToOgvValidationChunk(base64: string): Promise<void>;
              }
            ).__withinAviToOgvValidationChunk(btoa(binary));
          }
        }
      } finally {
        await root.removeEntry(entryName).catch(() => {});
      }
    }, name);
    sink.end();
    await once(sink, "finish");
  } finally {
    sink.destroy();
    if (validationSink === sink) validationSink = null;
  }
}

test.beforeAll(async () => {
  test.skip(
    !existsSync(theoraWasmPath),
    "The public no-Docker Theora engine has not been staged.",
  );
  await rm(profileRoot, { recursive: true, force: true });
  await rm(outputPath, { force: true });
  await rm(mp4FixturePath, { force: true });
  await mkdir(profileRoot, { recursive: true });
  await execFileAsync(
    "ffmpeg",
    [
      "-v",
      "error",
      "-nostdin",
      "-i",
      mp4SourceFixturePath,
      "-map",
      "0:v:0",
      "-map",
      "0:a:0?",
      "-c",
      "copy",
      "-y",
      mp4FixturePath,
    ],
    { cwd: projectRoot, windowsHide: true, maxBuffer: 1024 * 1024 },
  );
  context = await chromium.launchPersistentContext(profileRoot, {
    executablePath: chromePath,
    headless: process.env.WITHIN_HEADED_M2V !== "1",
    acceptDownloads: false,
    baseURL,
  });
  page = context.pages()[0] ?? (await context.newPage());
  await page.exposeBinding(
    "__withinAviToOgvValidationChunk",
    async (_source, base64: string) => {
      if (!validationSink) throw new Error("Validation sink is not open.");
      if (!validationSink.write(Buffer.from(base64, "base64"))) {
        await once(validationSink, "drain");
      }
    },
  );
  await page.goto("/?test=1");
  await page.locator('[data-testid="file-input"]').setInputFiles(fixturePath);
  await expect
    .poll(() => page.workers().find((worker) => worker.url().includes("conversion.worker")))
    .toBeTruthy();
  appWorker = page
    .workers()
    .find((worker) => worker.url().includes("conversion.worker"))!;
});

test.afterAll(async () => {
  validationSink?.destroy();
  validationSink = null;
  await context?.close();
  await rm(outputPath, { force: true });
  await rm(mp4FixturePath, { force: true });
  await rm(profileRoot, { recursive: true, force: true });
});

test("publishes AVI to OGV and exposes only bounded Theora controls", async () => {
  const format = page.locator('[data-testid="format-select"]');
  await expect(format.locator('option[value="avi-to-ogv"]')).toHaveCount(1);
  await format.selectOption("avi-to-ogv");

  const codec = page.locator('[data-testid="video-codec-select"]');
  const width = page.locator('[data-testid="video-width-select"]');
  const bitrate = page.locator('[data-testid="video-bitrate-select"]');
  const frameRate = page.locator('[data-testid="video-frame-rate-select"]');
  const quality = page.locator('[data-testid="video-quality-select"]');
  await expect(codec.locator("option")).toHaveText([
    "Automatic (Theora)",
    "Theora",
  ]);
  await expect(width.locator("option")).toHaveText([
    "Automatic",
    "320px cap",
    "480px cap",
    "640px cap",
  ]);
  await expect(frameRate.locator("option")).toHaveText([
    "Automatic",
    "15 fps cap",
    "24 fps cap",
    "25 fps cap",
    "30 fps cap",
  ]);
  await expect(quality.locator("option")).toHaveText([
    "Automatic (fastest certified)",
    "Smaller file",
    "Balanced",
    "Higher visual quality",
  ]);
  await expect(bitrate).toBeDisabled();
  await expect(bitrate.locator("option")).toHaveText(["Quality-based VBR"]);
});

test("genuinely re-encodes AVI video to bounded Ogg Theora", async () => {
  test.setTimeout(120_000);
  const outputName = `within-test-avi-to-ogv-${crypto.randomUUID()}.ogv`;
  const result = await runConversion(outputName);
  expect(result.type, result.message).toBe("complete");
  expect(result.opfsName).toBe(outputName);
  expect(result.warnings.join(" ")).toContain(
    "audio stream is explicitly excluded",
  );
  expect(result.metrics.inputBytes).toBeGreaterThan(0);
  expect(result.metrics.outputBytes).toBeGreaterThan(0);
  expect(result.metrics.queuedBytes).toBe(0);
  expect(result.metrics.pendingOperations).toBe(0);
  expect(result.metrics.peakPendingOperations).toBeLessThanOrEqual(1);
  expect(result.metrics.maxReadChunkBytes).toBeLessThanOrEqual(256 * 1024);
  expect(result.metrics.maxWriteChunkBytes).toBeLessThanOrEqual(256 * 1024);
  expect(result.metrics.peakWasmMemoryBytes).toBeLessThanOrEqual(96 * 1024 * 1024);
  expect(result.metrics.activeWorkerCount).toBe(1);

  await copyAndDeleteOutput(outputName);
  const { stdout } = await execFileAsync(
    "ffprobe",
    [
      "-v",
      "error",
      "-show_entries",
      "stream=codec_name,codec_type,width,height",
      "-show_entries",
      "format=format_name,duration",
      "-of",
      "json",
      outputPath,
    ],
    { cwd: projectRoot, windowsHide: true, maxBuffer: 1024 * 1024 },
  );
  const probe = JSON.parse(stdout) as {
    streams: Array<{
      codec_name: string;
      codec_type: string;
      width?: number;
      height?: number;
    }>;
    format: { format_name: string; duration: string };
  };
  expect(probe.format.format_name).toContain("ogg");
  expect(Number.parseFloat(probe.format.duration)).toBeGreaterThan(3.9);
  expect(probe.streams).toEqual([
    { codec_name: "theora", codec_type: "video", width: 640, height: 360 },
  ]);
  await execFileAsync(
    "ffmpeg",
    ["-v", "error", "-nostdin", "-i", outputPath, "-f", "null", "-"],
    { cwd: projectRoot, windowsHide: true, maxBuffer: 1024 * 1024 },
  );
});

test("genuinely re-encodes MP4 video through the hidden bounded Ogg Theora candidate", async () => {
  test.setTimeout(120_000);
  await page.locator('[data-testid="file-input"]').setInputFiles(mp4FixturePath);
  const outputName = `within-test-mp4-to-ogv-${crypto.randomUUID()}.ogv`;
  try {
    const result = await runConversion(
      outputName,
      undefined,
      undefined,
      "mp4-to-ogv",
    );
    expect(result.type, result.message).toBe("complete");
    expect(result.warnings.join(" ")).toContain(
      "audio stream is explicitly excluded",
    );
    expect(result.metrics.peakPendingOperations).toBeLessThanOrEqual(1);
    expect(result.metrics.maxReadChunkBytes).toBeLessThanOrEqual(256 * 1024);
    expect(result.metrics.maxWriteChunkBytes).toBeLessThanOrEqual(256 * 1024);
    expect(result.metrics.peakWasmMemoryBytes).toBeLessThanOrEqual(96 * 1024 * 1024);
    expect(result.metrics.activeWorkerCount).toBe(1);

    await copyAndDeleteOutput(outputName);
    const [{ stdout: outputStdout }, { stdout: sourceStdout }] =
      await Promise.all([
        execFileAsync(
          "ffprobe",
          [
            "-v",
            "error",
            "-count_frames",
            "-select_streams",
            "v:0",
            "-show_entries",
            "stream=codec_name,width,height,nb_read_frames",
            "-show_entries",
            "format=format_name,duration",
            "-of",
            "json",
            outputPath,
          ],
          { cwd: projectRoot, windowsHide: true, maxBuffer: 1024 * 1024 },
        ),
        execFileAsync(
          "ffprobe",
          [
            "-v",
            "error",
            "-count_frames",
            "-select_streams",
            "v:0",
            "-show_entries",
            "stream=nb_read_frames",
            "-of",
            "json",
            mp4FixturePath,
          ],
          { cwd: projectRoot, windowsHide: true, maxBuffer: 1024 * 1024 },
        ),
      ]);
    const output = JSON.parse(outputStdout);
    const source = JSON.parse(sourceStdout);
    expect(output.format.format_name).toContain("ogg");
    expect(output.streams).toHaveLength(1);
    expect(output.streams[0].codec_name).toBe("theora");
    expect(Number(output.streams[0].nb_read_frames)).toBe(
      Number(source.streams[0].nb_read_frames),
    );
    await execFileAsync(
      "ffmpeg",
      ["-v", "error", "-nostdin", "-i", outputPath, "-f", "null", "-"],
      { cwd: projectRoot, windowsHide: true, maxBuffer: 1024 * 1024 },
    );
  } finally {
    await page.locator('[data-testid="file-input"]').setInputFiles(fixturePath);
  }
});

test("genuinely re-encodes raw MPEG-2 video through the hidden Ogg Theora candidate", async () => {
  test.setTimeout(120_000);
  await page.locator('[data-testid="file-input"]').setInputFiles(m2vFixturePath);
  const outputName = `within-test-m2v-to-ogv-${crypto.randomUUID()}.ogv`;
  try {
    const result = await runConversion(
      outputName,
      undefined,
      undefined,
      "m2v-to-ogv",
    );
    expect(result.type, result.message).toBe("complete");
    expect(result.metrics.inputBytes).toBeGreaterThan(0);
    expect(result.metrics.outputBytes).toBeGreaterThan(0);
    expect(result.metrics.queuedBytes).toBe(0);
    expect(result.metrics.pendingOperations).toBe(0);
    expect(result.metrics.peakPendingOperations).toBeLessThanOrEqual(1);
    expect(result.metrics.maxReadChunkBytes).toBeLessThanOrEqual(256 * 1024);
    expect(result.metrics.maxWriteChunkBytes).toBeLessThanOrEqual(256 * 1024);
    expect(result.metrics.peakWasmMemoryBytes).toBeLessThanOrEqual(96 * 1024 * 1024);
    await copyAndDeleteOutput(outputName);
    const [{ stdout: outputStdout }, { stdout: sourceStdout }] =
      await Promise.all([
        execFileAsync(
          "ffprobe",
          [
            "-v", "error", "-count_frames", "-select_streams", "v:0",
            "-show_entries", "stream=codec_name,width,height,nb_read_frames",
            "-show_entries", "format=format_name,duration", "-of", "json",
            outputPath,
          ],
          { cwd: projectRoot, windowsHide: true, maxBuffer: 1024 * 1024 },
        ),
        execFileAsync(
          "ffprobe",
          [
            "-v", "error", "-count_frames", "-select_streams", "v:0",
            "-show_entries", "stream=nb_read_frames", "-of", "json",
            m2vFixturePath,
          ],
          { cwd: projectRoot, windowsHide: true, maxBuffer: 1024 * 1024 },
        ),
      ]);
    const output = JSON.parse(outputStdout);
    const source = JSON.parse(sourceStdout);
    expect(output.format.format_name).toContain("ogg");
    expect(output.streams).toHaveLength(1);
    expect(output.streams[0].codec_name).toBe("theora");
    expect(output.streams[0].width).toBe(640);
    expect(output.streams[0].height).toBe(360);
    expect(Number(output.streams[0].nb_read_frames)).toBe(
      Number(source.streams[0].nb_read_frames),
    );
    await execFileAsync(
      "ffmpeg",
      ["-v", "error", "-nostdin", "-i", outputPath, "-f", "null", "-"],
      { cwd: projectRoot, windowsHide: true, maxBuffer: 1024 * 1024 },
    );
  } finally {
    await rm(outputPath, { force: true });
    await page.locator('[data-testid="file-input"]').setInputFiles(fixturePath);
  }
});

test("shows the MPEG-2 OGV route and real progress in the production UI", async () => {
  test.setTimeout(120_000);
  await page.locator('[data-testid="file-input"]').setInputFiles(m2vFixturePath);
  let outputName: string | null = null;
  try {
    await expect(page.getByText("mpeg2-video-source.m2v", { exact: true })).toBeVisible();
    const format = page.locator('[data-testid="format-select"]');
    await expect(format.locator('option[value="m2v-to-ogv"]')).toHaveCount(1);
    await format.selectOption("m2v-to-ogv");
    await page.getByText("What this destination cannot preserve").click();
    await expect(page.getByText("MPEG-2 elementary video stream", { exact: false })).toBeVisible();
    if (process.env.WITHIN_HEADED_M2V === "1") {
      await mkdir(path.join(projectRoot, "output", "playwright"), { recursive: true });
      await page.getByRole("region", { name: "Convert on this device" }).screenshot({
        path: path.join(projectRoot, "output", "playwright", "m2v-ogv-selected.png"),
      });
    }
    await expect(page.locator('[data-testid="convert-button"]')).toBeEnabled();
    await page.locator('[data-testid="convert-button"]').click();
    await page.waitForFunction(
      () => window.__WITHIN_TEST__?.getState().jobState === "complete",
      undefined,
      { timeout: 60_000 },
    );
    const state = await page.evaluate(() => window.__WITHIN_TEST__?.getState());
    outputName = state?.opfsName ?? null;
    expect(outputName).toBeTruthy();
    expect(state?.metrics?.inputBytes).toBeGreaterThan(0);
    expect(state?.metrics?.outputBytes).toBeGreaterThan(0);
    expect(state?.metrics?.pendingOperations).toBe(0);
    expect(state?.warnings?.join(" ")).toContain("encoded MPEG-2 sequence-header frame rate");
    expect(state?.warnings?.join(" ")).not.toContain("source average frame rate");
    await expect(page.locator('[data-testid="capability-blocker"]')).toHaveCount(0);
    if (process.env.WITHIN_HEADED_M2V === "1") {
      await page.getByRole("region", { name: "Convert on this device" }).screenshot({
        path: path.join(projectRoot, "output", "playwright", "m2v-ogv-complete.png"),
      });
    }
  } finally {
    if (outputName) {
      await page.evaluate(async (entryName) => {
        const root = await navigator.storage.getDirectory();
        await root.removeEntry(entryName).catch(() => {});
      }, outputName);
    }
    await page.locator('[data-testid="file-input"]').setInputFiles(fixturePath);
  }
});

test("publishes MPEG-2 OGV in the ordinary format selector", async () => {
  const publicPage = await context.newPage();
  try {
    await publicPage.goto("/");
    await publicPage.locator('[data-testid="file-input"]').setInputFiles(m2vFixturePath);
    await expect(
      publicPage.locator('[data-testid="format-select"] option[value="m2v-to-ogv"]'),
    ).toHaveCount(1);
    await publicPage.locator('[data-testid="format-select"]').selectOption("m2v-to-ogv");
    await expect(publicPage.getByText("Test-only route:")).toHaveCount(0);
  } finally {
    await publicPage.close();
  }
});

test("raw MPEG-2 OGV honors bounded Theora width, frame-rate, and quality controls", async () => {
  test.setTimeout(120_000);
  await page.locator('[data-testid="file-input"]').setInputFiles(m2vFixturePath);
  const outputName = `within-test-m2v-to-ogv-options-${crypto.randomUUID()}.ogv`;
  try {
    const result = await runConversion(outputName, undefined, {
      codec: "theora",
      maxWidth: 320,
      bitRateBps: 0,
      frameRateFps: 15,
      quality: "smaller",
    }, "m2v-to-ogv");
    expect(result.type, result.message).toBe("complete");
    expect(result.metrics.peakPendingOperations).toBeLessThanOrEqual(1);
    await copyAndDeleteOutput(outputName);
    const { stdout } = await execFileAsync(
      "ffprobe",
      [
        "-v", "error", "-count_frames", "-select_streams", "v:0",
        "-show_entries", "stream=codec_name,width,height,r_frame_rate,nb_read_frames",
        "-of", "json", outputPath,
      ],
      { cwd: projectRoot, windowsHide: true, maxBuffer: 1024 * 1024 },
    );
    const video = JSON.parse(stdout).streams?.[0];
    expect(video).toEqual({
      codec_name: "theora",
      width: 320,
      height: 180,
      r_frame_rate: "15/1",
      nb_read_frames: "60",
    });
    await execFileAsync(
      "ffmpeg",
      ["-v", "error", "-nostdin", "-i", outputPath, "-f", "null", "-"],
      { cwd: projectRoot, windowsHide: true, maxBuffer: 1024 * 1024 },
    );
  } finally {
    await rm(outputPath, { force: true });
    await page.locator('[data-testid="file-input"]').setInputFiles(fixturePath);
  }
});

test("MP4 candidate write failure removes the partial OGV", async () => {
  await page.locator('[data-testid="file-input"]').setInputFiles(mp4FixturePath);
  const outputName = `within-test-mp4-to-ogv-write-${crypto.randomUUID()}.ogv`;
  try {
    const result = await runConversion(
      outputName,
      "write",
      undefined,
      "mp4-to-ogv",
    );
    expect(result.type).toBe("error");
    expect(result.message).toContain("destination rejected a bounded write");
    const exists = await page.evaluate(async (entryName) => {
      const root = await navigator.storage.getDirectory();
      try {
        await root.getFileHandle(entryName);
        return true;
      } catch (error) {
        if (error instanceof DOMException && error.name === "NotFoundError") {
          return false;
        }
        throw error;
      }
    }, outputName);
    expect(exists).toBe(false);
    expect(result.metrics.queuedBytes).toBe(0);
    expect(result.metrics.pendingOperations).toBe(0);
  } finally {
    await page.locator('[data-testid="file-input"]').setInputFiles(fixturePath);
  }
});

test("write failure removes the partial OGV", async () => {
  test.setTimeout(120_000);
  const outputName = `within-test-avi-to-ogv-write-${crypto.randomUUID()}.ogv`;
  const result = await runConversion(outputName, "write");
  expect(result.type).toBe("error");
  expect(result.message).toContain("destination rejected a bounded write");
  expect(result.message).toContain("OGV header write failed: I/O error");
  const exists = await page.evaluate(async (entryName) => {
    const root = await navigator.storage.getDirectory();
    try {
      await root.getFileHandle(entryName);
      return true;
    } catch (error) {
      if (error instanceof DOMException && error.name === "NotFoundError") {
        return false;
      }
      throw error;
    }
  }, outputName);
  expect(exists).toBe(false);
  expect(result.metrics.queuedBytes).toBe(0);
  expect(result.metrics.pendingOperations).toBe(0);
});

test("applies bounded Theora codec, width, frame-rate, and quality controls", async () => {
  test.setTimeout(120_000);
  const outputName = `within-test-avi-to-ogv-options-${crypto.randomUUID()}.ogv`;
  const result = await runConversion(outputName, undefined, {
    codec: "theora",
    maxWidth: 320,
    bitRateBps: 0,
    frameRateFps: 15,
    quality: "smaller",
  });
  expect(result.type, result.message).toBe("complete");
  await copyAndDeleteOutput(outputName);
  const { stdout } = await execFileAsync(
    "ffprobe",
    [
      "-v",
      "error",
      "-select_streams",
      "v:0",
      "-show_entries",
      "stream=codec_name,width,height,r_frame_rate",
      "-of",
      "json",
      outputPath,
    ],
    { cwd: projectRoot, windowsHide: true, maxBuffer: 1024 * 1024 },
  );
  const stream = JSON.parse(stdout).streams?.[0];
  expect(stream).toEqual({
    codec_name: "theora",
    width: 320,
    height: 180,
    r_frame_rate: "15/1",
  });
  await execFileAsync(
    "ffmpeg",
    ["-v", "error", "-nostdin", "-i", outputPath, "-f", "null", "-"],
    { cwd: projectRoot, windowsHide: true, maxBuffer: 1024 * 1024 },
  );
});

test("rejects bitrate control for quality-based Theora VBR", async () => {
  const outputName = `within-test-avi-to-ogv-bitrate-${crypto.randomUUID()}.ogv`;
  const result = await runConversion(outputName, undefined, {
    codec: "theora",
    maxWidth: 0,
    bitRateBps: 300_000,
    frameRateFps: 0,
    quality: "automatic",
  });
  expect(result.type).toBe("error");
  expect(result.message).toContain("quality-based VBR");
});
