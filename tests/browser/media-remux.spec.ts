import {
  chromium,
  expect,
  test,
  type BrowserContext,
  type Page,
} from "@playwright/test";
import { execFile } from "node:child_process";
import { once } from "node:events";
import { createWriteStream, existsSync, type WriteStream } from "node:fs";
import { mkdir, rm, stat } from "node:fs/promises";
import path from "node:path";
import { promisify } from "node:util";

const execFileAsync = promisify(execFile);
const projectRoot = path.resolve(import.meta.dirname, "..", "..");
const profileRoot = path.join(projectRoot, "work", "playwright-profile-media");
const outputRoot = path.join(projectRoot, "outputs", "browser-media-smoke");
const mp4OutputPath = path.join(outputRoot, "remux-output.mp4");
const m4aOutputPath = path.join(outputRoot, "extract-output.m4a");
const wavOutputPath = path.join(outputRoot, "convert-output.wav");
const mpeg4OutputPath = path.join(outputRoot, "reencode-output.mp4");
const fixturePath = path.join(
  projectRoot,
  "fixtures",
  "media",
  "remux-source.mkv",
);
const installedChromePath =
  "C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe";
const chromePath =
  process.env.WITHIN_CHROME_PATH ??
  (existsSync(installedChromePath)
    ? installedChromePath
    : chromium.executablePath());

let context: BrowserContext;
let page: Page;
let validationSink: WriteStream | null = null;

function assertProjectLocal(target: string): void {
  const relative = path.relative(projectRoot, target);
  if (!relative || relative.startsWith("..") || path.isAbsolute(relative)) {
    throw new Error(`Refusing a non-project test path: ${target}`);
  }
}

async function currentState() {
  return page.evaluate(() => {
    if (!window.__WITHIN_TEST__) throw new Error("Test bridge is unavailable.");
    return window.__WITHIN_TEST__.getState();
  });
}

test.beforeAll(async () => {
  assertProjectLocal(profileRoot);
  assertProjectLocal(mp4OutputPath);
  assertProjectLocal(m4aOutputPath);
  assertProjectLocal(wavOutputPath);
  assertProjectLocal(mpeg4OutputPath);
  await rm(profileRoot, { recursive: true, force: true });
  await mkdir(profileRoot, { recursive: true });
  await mkdir(outputRoot, { recursive: true });

  context = await chromium.launchPersistentContext(profileRoot, {
    executablePath: chromePath,
    headless: true,
    acceptDownloads: false,
    baseURL: "http://127.0.0.1:3000",
  });
  page = context.pages()[0] ?? (await context.newPage());
  await page.exposeBinding(
    "__withinMediaValidationChunk",
    async (_source, base64: string) => {
      if (!validationSink) {
        throw new Error("The project-local validation sink is not open.");
      }
      if (!validationSink.write(Buffer.from(base64, "base64"))) {
        await once(validationSink, "drain");
      }
    },
  );
});

test.afterAll(async () => {
  validationSink?.destroy();
  validationSink = null;
  await context?.close();
  await rm(mp4OutputPath, { force: true });
  await rm(m4aOutputPath, { force: true });
  await rm(wavOutputPath, { force: true });
  await rm(mpeg4OutputPath, { force: true });
  await rm(profileRoot, { recursive: true, force: true });
});

async function runMediaRoute(
  profileId:
    | "mkv-to-mp4"
    | "mkv-to-m4a"
    | "mkv-to-wav"
    | "mkv-to-mp4-mpeg4",
  outputPath: string,
  expectedCodecs: string[],
  minimumBytes: number,
) {
  try {
    await page.goto("/?test=1");
    await page.waitForFunction(
      () => window.__WITHIN_TEST__?.getState().workerStatus === "ready",
    );
    await page.locator('[data-testid="file-input"]').setInputFiles(fixturePath);
    await page
      .locator('[data-testid="format-select"]')
      .selectOption(profileId);
    await page.locator('[data-testid="convert-button"]').click();

    await expect
      .poll(async () => (await currentState()).jobState, { timeout: 60_000 })
      .not.toBe("running");
    const state = await currentState();
    expect(state.jobState, state.error ?? state.phase).toBe("complete");
    expect(state.opfsName).toBeTruthy();
    if (profileId === "mkv-to-mp4") {
      expect(state.warnings).toEqual([]);
    } else if (profileId === "mkv-to-m4a" || profileId === "mkv-to-wav") {
      expect(state.warnings.some((warning) => warning.includes("video stream"))).toBe(
        true,
      );
    } else {
      expect(state.warnings.some((warning) => warning.includes("audio stream"))).toBe(
        true,
      );
    }
    expect(state.metrics?.maxReadChunkBytes).toBeLessThanOrEqual(256 * 1024);
    expect(state.metrics?.maxWriteChunkBytes).toBeLessThanOrEqual(256 * 1024);
    expect(state.metrics?.peakPendingOperations).toBeLessThanOrEqual(1);
    expect(state.metrics?.peakWasmMemoryBytes).toBeLessThanOrEqual(
      128 * 1024 * 1024,
    );

    validationSink = createWriteStream(outputPath, { flags: "w" });
    await page.evaluate(async (opfsName) => {
      const root = await navigator.storage.getDirectory();
      const handle = await root.getFileHandle(opfsName!);
      const file = await handle.getFile();
      const reader = file.stream().getReader();
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
          await window.__withinMediaValidationChunk(btoa(binary));
        }
      }
      await root.removeEntry(opfsName!);
    }, state.opfsName);
    validationSink.end();
    await once(validationSink, "finish");
    validationSink = null;

    const { size } = await stat(outputPath);
    expect(size).toBeGreaterThan(minimumBytes);
    const { stdout } = await execFileAsync(
      "ffprobe",
      [
        "-v",
        "error",
        "-show_format",
        "-show_streams",
        "-of",
        "json",
        outputPath,
      ],
      { cwd: projectRoot, windowsHide: true, maxBuffer: 8 * 1024 * 1024 },
    );
    const probe = JSON.parse(stdout);
    expect(
      probe.streams.map(
        (stream: { codec_name: string }) => stream.codec_name,
      ),
    ).toEqual(expectedCodecs);
    expect(Number(probe.format.duration)).toBeGreaterThan(3.9);
    expect(Number(probe.format.duration)).toBeLessThan(4.2);
  } finally {
    validationSink?.destroy();
    validationSink = null;
    await rm(outputPath, { force: true });
  }
}

test("browser FFmpeg AVIO remuxes MKV to a valid MP4 with bounded I/O", async () => {
  await runMediaRoute(
    "mkv-to-mp4",
    mp4OutputPath,
    ["h264", "aac"],
    250_000,
  );
});

test("browser FFmpeg AVIO extracts MKV audio to valid M4A with bounded I/O", async () => {
  await runMediaRoute("mkv-to-m4a", m4aOutputPath, ["aac"], 20_000);
});

test("browser FFmpeg decodes AAC and encodes bounded PCM WAV", async () => {
  await runMediaRoute(
    "mkv-to-wav",
    wavOutputPath,
    ["pcm_s16le"],
    300_000,
  );
});

test("browser FFmpeg performs a genuine bounded video re-encode", async () => {
  await runMediaRoute(
    "mkv-to-mp4-mpeg4",
    mpeg4OutputPath,
    ["mpeg4"],
    100_000,
  );
});

declare global {
  interface Window {
    __withinMediaValidationChunk(base64: string): Promise<void>;
  }
}
