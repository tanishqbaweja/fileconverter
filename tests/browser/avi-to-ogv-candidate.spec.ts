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
const candidateWasmPath = path.join(
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

interface CandidateResult {
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

async function runCandidate(
  outputName: string,
  testFault?: "write",
  videoOptions?: {
    codec: "automatic" | "theora";
    maxWidth: 0 | 320 | 480 | 640;
    bitRateBps: 0 | 300_000;
    frameRateFps: 0 | 15 | 24 | 25 | 30;
    quality: "automatic" | "smaller" | "balanced" | "higher";
  },
): Promise<CandidateResult> {
  const workerUrl = appWorker.url();
  return page.evaluate(
    async ({ workerUrl, outputName, testFault, videoOptions }) => {
      const input = document.querySelector<HTMLInputElement>(
        '[data-testid="file-input"]',
      );
      const file = input?.files?.[0];
      if (!file) throw new Error("The AVI fixture was not attached.");
      const worker = new Worker(workerUrl, {
        name: "within-avi-to-ogv-candidate",
        type: "module",
      });
      const warnings: string[] = [];
      try {
        return await new Promise<CandidateResult>((resolve, reject) => {
          const timeout = window.setTimeout(
            () => reject(new Error("AVI to OGV candidate timed out.")),
            90_000,
          );
          const finish = (result: CandidateResult) => {
            window.clearTimeout(timeout);
            resolve({ ...result, warnings });
          };
          const jobId = crypto.randomUUID();
          worker.onerror = (event) => {
            window.clearTimeout(timeout);
            reject(new Error(event.message || "Candidate worker crashed."));
          };
          worker.onmessage = (event) => {
            const message = event.data;
            if (message.type === "ready") {
              worker.postMessage({
                type: "start",
                jobId,
                profileId: "avi-to-ogv",
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
    { workerUrl, outputName, testFault, videoOptions },
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
    !existsSync(candidateWasmPath),
    "The private no-Docker Theora candidate has not been staged.",
  );
  await rm(profileRoot, { recursive: true, force: true });
  await rm(outputPath, { force: true });
  await mkdir(profileRoot, { recursive: true });
  context = await chromium.launchPersistentContext(profileRoot, {
    executablePath: chromePath,
    headless: true,
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
  await rm(profileRoot, { recursive: true, force: true });
});

test("genuinely re-encodes AVI video to bounded Ogg Theora", async () => {
  test.setTimeout(120_000);
  const outputName = `within-test-avi-to-ogv-${crypto.randomUUID()}.ogv`;
  const result = await runCandidate(outputName);
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

test("write failure removes the partial OGV", async () => {
  test.setTimeout(120_000);
  const outputName = `within-test-avi-to-ogv-write-${crypto.randomUUID()}.ogv`;
  const result = await runCandidate(outputName, "write");
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
  const result = await runCandidate(outputName, undefined, {
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
  const result = await runCandidate(outputName, undefined, {
    codec: "theora",
    maxWidth: 0,
    bitRateBps: 300_000,
    frameRateFps: 0,
    quality: "automatic",
  });
  expect(result.type).toBe("error");
  expect(result.message).toContain("quality-based VBR");
});
