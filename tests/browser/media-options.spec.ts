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
