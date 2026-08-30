import { expect, test } from "@playwright/test";
import { execFile } from "node:child_process";
import { mkdir, rm, writeFile } from "node:fs/promises";
import path from "node:path";
import { promisify } from "node:util";

const projectRoot = path.resolve(import.meta.dirname, "..", "..");
const execFileAsync = promisify(execFile);
const validationRoot = path.join(projectRoot, "work", "media-options-validation");
const customMp3Path = path.join(validationRoot, "audio-source-custom.mp3");
const wavFixturePath = path.join(
  projectRoot,
  "fixtures",
  "media",
  "audio-source.wav",
);
const videoFixturePath = path.join(
  projectRoot,
  "fixtures",
  "media",
  "remux-source.mkv",
);

test.use({ channel: "chrome" });

test.afterEach(async ({ page }) => {
  await page
    .evaluate(async () => {
      const root = await navigator.storage.getDirectory();
      for await (const [name] of root.entries()) {
        if (name === "audio-source.mp3" || name.startsWith("within-")) {
          await root.removeEntry(name, { recursive: true }).catch(() => {});
        }
      }
    })
    .catch(() => {});
  await rm(validationRoot, { recursive: true, force: true });
});

test("MP3 controls update the bounded native conversion request and plan", async ({
  page,
}) => {
  await page.goto("/?test=1");
  await page.waitForFunction(
    () => window.__WITHIN_TEST__?.getState().workerStatus === "ready",
  );
  await page.locator('[data-testid="file-input"]').setInputFiles(wavFixturePath);
  await page.locator('[data-testid="format-select"]').selectOption("wav-to-mp3");

  const bitrate = page.locator('[data-testid="audio-bitrate-select"]');
  const sampleRate = page.locator('[data-testid="audio-sample-rate-select"]');
  const channels = page.locator('[data-testid="audio-channels-select"]');
  await expect(bitrate).toHaveValue("0");
  await expect(sampleRate).toHaveValue("0");
  await expect(channels).toHaveValue("0");

  await bitrate.selectOption("256000");
  await sampleRate.selectOption("44100");
  await channels.selectOption("1");

  await expect(page.locator('[data-testid="media-conversion-plan"]')).toContainText(
    "256 kb/s",
  );
  await expect(page.locator('[data-testid="media-conversion-plan"]')).toContainText(
    "44,100 Hz",
  );
  await expect(page.locator('[data-testid="media-conversion-plan"]')).toContainText(
    "mono",
  );
  await expect
    .poll(() =>
      page.evaluate(() => window.__WITHIN_TEST__?.getState().audioOptions),
    )
    .toEqual({ bitRateBps: 256_000, sampleRateHz: 44_100, channels: 1 });

  await page.locator('[data-testid="format-select"]').selectOption("wav-to-flac");
  await expect(bitrate).toHaveCount(0);
  await expect
    .poll(() =>
      page.evaluate(() => window.__WITHIN_TEST__?.getState().audioOptions),
    )
    .toEqual({ bitRateBps: 0, sampleRateHz: 0, channels: 0 });
});

test("video controls update every bounded setting and synchronize the codec profile", async ({
  page,
}) => {
  await page.goto("/?test=1");
  await page.waitForFunction(
    () => window.__WITHIN_TEST__?.getState().workerStatus === "ready",
  );
  await page.locator('[data-testid="file-input"]').setInputFiles(videoFixturePath);
  await page.locator('[data-testid="format-select"]').selectOption("mkv-to-webm");

  const codec = page.locator('[data-testid="video-codec-select"]');
  const width = page.locator('[data-testid="video-width-select"]');
  const bitrate = page.locator('[data-testid="video-bitrate-select"]');
  const frameRate = page.locator('[data-testid="video-frame-rate-select"]');
  const quality = page.locator('[data-testid="video-quality-select"]');
  await expect(codec).toHaveValue("automatic");
  await expect(width).toHaveValue("0");
  await expect(bitrate).toHaveValue("0");
  await expect(frameRate).toHaveValue("0");
  await expect(quality).toHaveValue("automatic");

  await codec.selectOption("vp9");
  await expect(page.locator('[data-testid="format-select"]')).toHaveValue(
    "mkv-to-webm-vp9",
  );
  await width.selectOption("480");
  await bitrate.selectOption("1000000");
  await frameRate.selectOption("24");
  await quality.selectOption("higher");

  const plan = page.locator('[data-testid="media-conversion-plan"]');
  await expect(plan).toContainText("VP9");
  await expect(plan).toContainText("480px");
  await expect(plan).toContainText("1000 kb/s");
  await expect(plan).toContainText("24 fps cap");
  await expect(plan).toContainText("higher-visual-quality");
  await expect
    .poll(() =>
      page.evaluate(() => window.__WITHIN_TEST__?.getState().videoOptions),
    )
    .toEqual({
      codec: "vp9",
      maxWidth: 480,
      bitRateBps: 1_000_000,
      frameRateFps: 24,
      quality: "higher",
    });

  await page.locator('[data-testid="format-select"]').selectOption("mkv-to-mp4");
  await expect(codec).toHaveCount(0);
  await expect
    .poll(() =>
      page.evaluate(() => window.__WITHIN_TEST__?.getState().videoOptions),
    )
    .toEqual({
      codec: "automatic",
      maxWidth: 0,
      bitRateBps: 0,
      frameRateFps: 0,
      quality: "automatic",
    });
});

test("native MP3 conversion honors the selected bitrate, sample rate, and channels", async ({
  page,
}) => {
  await page.goto("/?test=1");
  await page.waitForFunction(
    () => window.__WITHIN_TEST__?.getState().workerStatus === "ready",
  );
  await page.locator('[data-testid="file-input"]').setInputFiles(wavFixturePath);
  await page.locator('[data-testid="format-select"]').selectOption("wav-to-mp3");
  await page.locator('[data-testid="audio-bitrate-select"]').selectOption("256000");
  await page.locator('[data-testid="audio-sample-rate-select"]').selectOption("44100");
  await page.locator('[data-testid="audio-channels-select"]').selectOption("1");

  const convertButton = page.locator('[data-testid="convert-button"]');
  await expect(convertButton).toBeEnabled({ timeout: 15_000 });
  await convertButton.click();
  await expect
    .poll(
      () => page.evaluate(() => window.__WITHIN_TEST__?.getState().jobState),
      { timeout: 60_000 },
    )
    .not.toBe("running");

  const state = await page.evaluate(() => window.__WITHIN_TEST__?.getState());
  expect(state?.jobState, state?.error ?? state?.phase).toBe("complete");
  expect(state?.opfsName).toBeTruthy();
  expect(state?.metrics?.maxReadChunkBytes).toBeLessThanOrEqual(256 * 1024);
  expect(state?.metrics?.maxWriteChunkBytes).toBeLessThanOrEqual(256 * 1024);
  expect(state?.metrics?.peakQueuedBytes).toBeLessThanOrEqual(256 * 1024);
  expect(state?.metrics?.peakPendingOperations).toBeLessThanOrEqual(1);
  expect(state?.metrics?.pendingOperations).toBe(0);
  expect(state?.metrics?.queuedBytes).toBe(0);

  await mkdir(validationRoot, { recursive: true });
  const base64 = await page.evaluate(async (entryName) => {
    if (!entryName) throw new Error("The conversion did not expose an OPFS output.");
    const root = await navigator.storage.getDirectory();
    try {
      const file = await (await root.getFileHandle(entryName)).getFile();
      const bytes = new Uint8Array(await file.arrayBuffer());
      let binary = "";
      for (let offset = 0; offset < bytes.byteLength; offset += 16 * 1024) {
        binary += String.fromCharCode(
          ...bytes.subarray(offset, Math.min(offset + 16 * 1024, bytes.byteLength)),
        );
      }
      return btoa(binary);
    } finally {
      await root.removeEntry(entryName).catch(() => {});
    }
  }, state?.opfsName);
  await writeFile(customMp3Path, Buffer.from(base64, "base64"));

  const { stdout } = await execFileAsync(
    "ffprobe",
    [
      "-v", "error", "-select_streams", "a:0", "-show_entries",
      "stream=codec_name,sample_rate,channels,bit_rate,duration",
      "-of", "json", customMp3Path,
    ],
    { cwd: projectRoot, windowsHide: true, maxBuffer: 8 * 1024 * 1024 },
  );
  const probe = JSON.parse(stdout) as {
    streams: Array<{
      codec_name?: string;
      sample_rate?: string;
      channels?: number;
      bit_rate?: string;
      duration?: string;
    }>;
  };
  expect(probe.streams).toHaveLength(1);
  expect(probe.streams[0]?.codec_name).toBe("mp3");
  expect(probe.streams[0]?.sample_rate).toBe("44100");
  expect(probe.streams[0]?.channels).toBe(1);
  expect(Number(probe.streams[0]?.bit_rate)).toBe(256_000);
  expect(Number(probe.streams[0]?.duration)).toBeGreaterThan(3.9);
  expect(Number(probe.streams[0]?.duration)).toBeLessThan(4.2);

  await execFileAsync(
    "ffmpeg",
    ["-hide_banner", "-loglevel", "error", "-i", customMp3Path, "-f", "null", "NUL"],
    { cwd: projectRoot, windowsHide: true, maxBuffer: 8 * 1024 * 1024 },
  );
  const { stderr } = await execFileAsync(
    "ffmpeg",
    [
      "-hide_banner", "-nostdin", "-i", wavFixturePath, "-i", customMp3Path,
      "-filter_complex",
      "[0:a:0]aresample=44100,aformat=sample_fmts=fltp:sample_rates=44100:channel_layouts=mono[source];[1:a:0]aformat=sample_fmts=fltp:sample_rates=44100:channel_layouts=mono[converted];[source][converted]asdr[quality]",
      "-map", "[quality]", "-f", "null", "NUL",
    ],
    { cwd: projectRoot, windowsHide: true, maxBuffer: 8 * 1024 * 1024 },
  );
  const asdrValues = [
    ...stderr.matchAll(/SDR ch\d+:\s+([+-]?(?:\d+(?:\.\d+)?|\.\d+))\s+dB/gi),
  ].map((match) => Number(match[1]));
  expect(asdrValues).not.toEqual([]);
  expect(Math.min(...asdrValues)).toBeGreaterThan(20);
});

test("custom MP3 conversion releases a partial direct output after write failure", async ({
  page,
}) => {
  await page.goto("/?test=1&directory=1&fault=write");
  await page.waitForFunction(
    () => window.__WITHIN_TEST__?.getState().workerStatus === "ready",
  );
  await page.locator('[data-testid="file-input"]').setInputFiles(wavFixturePath);
  await page.locator('[data-testid="format-select"]').selectOption("wav-to-mp3");
  await page.locator('[data-testid="audio-bitrate-select"]').selectOption("320000");
  await page.locator('[data-testid="audio-sample-rate-select"]').selectOption("48000");
  await page.locator('[data-testid="audio-channels-select"]').selectOption("2");

  const convertButton = page.locator('[data-testid="convert-button"]');
  await expect(convertButton).toBeEnabled({ timeout: 15_000 });
  await convertButton.click();
  await expect
    .poll(
      () => page.evaluate(() => window.__WITHIN_TEST__?.getState().jobState),
      { timeout: 30_000 },
    )
    .toBe("error");

  const state = await page.evaluate(() => window.__WITHIN_TEST__?.getState());
  expect(state?.error?.toLowerCase()).toContain(
    "destination rejected a bounded write",
  );
  expect(state?.opfsName).toBeNull();
  expect(state?.metrics?.peakPendingOperations).toBeLessThanOrEqual(1);
  expect(state?.metrics?.pendingOperations).toBe(0);
  expect(state?.metrics?.queuedBytes).toBe(0);
  const abandonedSize = await page.evaluate(async () => {
    const root = await navigator.storage.getDirectory();
    try {
      const handle = await root.getFileHandle("audio-source.mp3");
      const size = (await handle.getFile()).size;
      await root.removeEntry("audio-source.mp3");
      return size;
    } catch (error) {
      if (error instanceof DOMException && error.name === "NotFoundError") {
        return null;
      }
      throw error;
    }
  });
  expect(abandonedSize === null || abandonedSize === 0).toBe(true);
});
