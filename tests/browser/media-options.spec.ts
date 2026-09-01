import { expect, test, type Page } from "@playwright/test";
import { execFile } from "node:child_process";
import { mkdir, readFile, rm, stat, writeFile } from "node:fs/promises";
import path from "node:path";
import { promisify } from "node:util";

const projectRoot = path.resolve(import.meta.dirname, "..", "..");
const execFileAsync = promisify(execFile);
const validationRoot = path.join(projectRoot, "work", "media-options-validation");
const customMp3Path = path.join(validationRoot, "audio-source-custom.mp3");
const audioMatrixRoot = path.join(validationRoot, "audio-matrix");
const customVp9Path = path.join(validationRoot, "video-source-custom.webm");
const customMpeg4Path = path.join(validationRoot, "video-source-custom.mp4");
const lowBitrateVideoPath = path.join(validationRoot, "video-low-bitrate.webm");
const higherQualityVideoPath = path.join(validationRoot, "video-higher-quality.webm");
const smallerVideoPath = path.join(validationRoot, "video-smaller.webm");
const wavFixturePath = path.join(
  projectRoot,
  "fixtures",
  "media",
  "audio-source.wav",
);
const artworkFixturePath = path.join(
  projectRoot,
  "fixtures",
  "media",
  "audio-source-artwork.m4a",
);
const mp3ArtworkFixturePath = path.join(
  projectRoot,
  "fixtures",
  "media",
  "audio-source-mp3-artwork.mp4",
);
const vorbisArtworkFixturePath = path.join(
  projectRoot,
  "fixtures",
  "media",
  "audio-source-vorbis-artwork.ogg",
);
const opusArtworkFixturePath = path.join(
  projectRoot,
  "fixtures",
  "media",
  "audio-source-opus-artwork.opus",
);
const videoFixturePath = path.join(
  projectRoot,
  "fixtures",
  "media",
  "remux-source.mkv",
);

test.use({ channel: "chrome" });

async function waitForCompletedConversion(page: Page): Promise<NonNullable<Awaited<ReturnType<NonNullable<typeof window.__WITHIN_TEST__>["getState"]>>>> {
  await expect(page.locator('[data-testid="convert-button"]')).toBeEnabled({
    timeout: 15_000,
  });
  await page.locator('[data-testid="convert-button"]').click();
  await page.waitForFunction(
    () => {
      const jobState = window.__WITHIN_TEST__?.getState().jobState;
      return jobState !== undefined && jobState !== "idle" && jobState !== "running";
    },
    undefined,
    { timeout: 120_000 },
  );
  const state = await page.evaluate(() => window.__WITHIN_TEST__?.getState());
  if (!state) throw new Error("The browser test bridge returned no state.");
  expect(state.jobState, state.error ?? state.phase).toBe("complete");
  expect(state.metrics?.maxReadChunkBytes).toBeLessThanOrEqual(256 * 1024);
  expect(state.metrics?.maxWriteChunkBytes).toBeLessThanOrEqual(256 * 1024);
  expect(state.metrics?.peakQueuedBytes).toBeLessThanOrEqual(256 * 1024);
  expect(state.metrics?.peakPendingOperations).toBeLessThanOrEqual(1);
  expect(state.metrics?.pendingOperations).toBe(0);
  expect(state.metrics?.queuedBytes).toBe(0);
  return state;
}

async function copyAndDeleteSmallBrowserOutput(
  page: Page,
  entryName: string,
  outputPath: string,
): Promise<void> {
  const base64 = await page.evaluate(async (name) => {
    const root = await navigator.storage.getDirectory();
    try {
      const file = await (await root.getFileHandle(name)).getFile();
      const bytes = new Uint8Array(await file.arrayBuffer());
      let binary = "";
      for (let offset = 0; offset < bytes.byteLength; offset += 16 * 1024) {
        binary += String.fromCharCode(
          ...bytes.subarray(offset, Math.min(offset + 16 * 1024, bytes.byteLength)),
        );
      }
      return btoa(binary);
    } finally {
      await root.removeEntry(name).catch(() => {});
    }
  }, entryName);
  await mkdir(path.dirname(outputPath), { recursive: true });
  await writeFile(outputPath, Buffer.from(base64, "base64"));
}

async function probeVideo(outputPath: string) {
  const { stdout } = await execFileAsync(
    "ffprobe",
    [
      "-v", "error", "-count_frames", "-select_streams", "v:0",
      "-show_entries",
      "stream=codec_name,width,height,r_frame_rate,avg_frame_rate,nb_read_frames:format=duration",
      "-of", "json", outputPath,
    ],
    { cwd: projectRoot, windowsHide: true, maxBuffer: 8 * 1024 * 1024 },
  );
  return JSON.parse(stdout) as {
    streams: Array<{
      codec_name?: string;
      width?: number;
      height?: number;
      r_frame_rate?: string;
      avg_frame_rate?: string;
      nb_read_frames?: string;
    }>;
    format: { duration?: string };
  };
}

async function probeAudio(outputPath: string) {
  const { stdout } = await execFileAsync(
    "ffprobe",
    [
      "-v", "error", "-count_frames", "-select_streams", "a:0", "-show_entries",
      "stream=codec_name,sample_rate,channels,bit_rate,nb_read_frames:format=duration",
      "-of", "json", outputPath,
    ],
    { cwd: projectRoot, windowsHide: true, maxBuffer: 8 * 1024 * 1024 },
  );
  return JSON.parse(stdout) as {
    streams: Array<{
      codec_name?: string;
      sample_rate?: string;
      channels?: number;
      bit_rate?: string;
      nb_read_frames?: string;
    }>;
    format: { duration?: string };
  };
}

async function probeAudioWithArtwork(outputPath: string) {
  const { stdout } = await execFileAsync(
    "ffprobe",
    [
      "-v", "error", "-show_streams", "-show_format", "-of", "json",
      outputPath,
    ],
    { cwd: projectRoot, windowsHide: true, maxBuffer: 8 * 1024 * 1024 },
  );
  return JSON.parse(stdout) as {
    streams: Array<{
      codec_name?: string;
      codec_type?: string;
      width?: number;
      height?: number;
      disposition?: { attached_pic?: number };
      tags?: Record<string, string>;
    }>;
    format: { tags?: Record<string, string> };
  };
}

async function extractedArtworkSha256(inputPath: string): Promise<string> {
  await mkdir(validationRoot, { recursive: true });
  const extractionPath = path.join(validationRoot, `${path.basename(inputPath)}.cover.png`);
  await execFileAsync(
    "ffmpeg",
    [
      "-hide_banner", "-loglevel", "error", "-y", "-i", inputPath,
      "-map", "0:v:0", "-c:v", "copy", extractionPath,
    ],
    { cwd: projectRoot, windowsHide: true, maxBuffer: 8 * 1024 * 1024 },
  );
  const bytes = await readFile(extractionPath);
  const digest = await crypto.subtle.digest("SHA-256", bytes);
  return Buffer.from(digest).toString("hex");
}

async function copiedAudioPayloadSha256(inputPath: string): Promise<string> {
  const { stdout } = await execFileAsync(
    "ffmpeg",
    [
      "-hide_banner", "-loglevel", "error", "-i", inputPath,
      "-map", "0:a:0", "-c", "copy", "-f", "hash", "-hash", "sha256",
      "pipe:1",
    ],
    { cwd: projectRoot, windowsHide: true, maxBuffer: 8 * 1024 * 1024 },
  );
  const match = /SHA256=([0-9a-f]{64})/i.exec(stdout);
  if (!match) throw new Error(`FFmpeg did not report an audio hash: ${stdout}`);
  return match[1].toLowerCase();
}

async function measureScaledVideoPsnr(outputPath: string): Promise<number> {
  const { stderr } = await execFileAsync(
    "ffmpeg",
    [
      "-hide_banner", "-nostdin", "-i", videoFixturePath, "-i", outputPath,
      "-filter_complex",
      "[0:v:0]scale=320:180:flags=bilinear,fps=15,setpts=PTS-STARTPTS[reference];[1:v:0]setpts=PTS-STARTPTS[converted];[converted][reference]psnr",
      "-f", "null", "NUL",
    ],
    { cwd: projectRoot, windowsHide: true, maxBuffer: 8 * 1024 * 1024 },
  );
  const match = /PSNR[^\n]*average:([0-9.]+)/i.exec(stderr);
  if (!match) throw new Error(`FFmpeg did not report PSNR: ${stderr}`);
  return Number(match[1]);
}

test.afterEach(async ({ page }) => {
  await page
    .evaluate(async () => {
      const root = await navigator.storage.getDirectory();
      for await (const [name] of root.entries()) {
        if (name.startsWith("audio-source.") || name.startsWith("within-")) {
          await root.removeEntry(name, { recursive: true }).catch(() => {});
        }
      }
    })
    .catch(() => {});
  await rm(validationRoot, { recursive: true, force: true });
});

test("audio controls update the bounded native conversion request and plan", async ({
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
  const codec = page.locator('[data-testid="audio-codec-select"]');
  const compression = page.locator('[data-testid="audio-compression-select"]');
  const quality = page.locator('[data-testid="audio-quality-select"]');
  await expect(codec).toHaveValue("automatic");
  await expect(compression).toHaveValue("automatic");
  await expect(quality).toHaveValue("automatic");
  await expect(bitrate).toHaveValue("0");
  await expect(sampleRate).toHaveValue("0");
  await expect(channels).toHaveValue("0");

  await bitrate.selectOption("256000");
  await sampleRate.selectOption("44100");
  await channels.selectOption("1");
  await quality.selectOption("balanced");

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
    .toEqual({
      codec: "automatic",
      compression: "automatic",
      bitRateBps: 256_000,
      sampleRateHz: 44_100,
      channels: 1,
      quality: "balanced",
    });

  await codec.selectOption("flac");
  await expect(page.locator('[data-testid="format-select"]')).toHaveValue("wav-to-flac");
  await expect(bitrate.locator("option")).toHaveCount(1);
  await expect
    .poll(() =>
      page.evaluate(() => window.__WITHIN_TEST__?.getState().audioOptions),
    )
    .toEqual({
      codec: "flac",
      compression: "automatic",
      bitRateBps: 0,
      sampleRateHz: 44_100,
      channels: 1,
      quality: "automatic",
    });

  await codec.selectOption("amr");
  await expect(page.locator('[data-testid="format-select"]')).toHaveValue("wav-to-amr");
  await expect(bitrate.locator("option")).toHaveCount(1);
  await expect(sampleRate.locator("option")).toHaveCount(1);
  await expect(channels.locator("option")).toHaveCount(1);
  await expect
    .poll(() =>
      page.evaluate(() => window.__WITHIN_TEST__?.getState().audioOptions),
    )
    .toEqual({
      codec: "amr",
      compression: "automatic",
      bitRateBps: 0,
      sampleRateHz: 0,
      channels: 0,
      quality: "automatic",
    });

  await codec.selectOption("flac");

  await compression.selectOption("lossy");
  await expect
    .poll(() =>
      page.evaluate(() => window.__WITHIN_TEST__?.getState().selectedProfileId),
    )
    .toMatch(/^wav-to-(?:mp3|aac|opus|ogg|wma|amr)$/);
  await expect
    .poll(() =>
      page.evaluate(() => window.__WITHIN_TEST__?.getState().audioOptions),
    )
    .toMatchObject({ codec: "automatic", compression: "lossy" });
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

test("native video controls produce genuine bounded VP9 and MPEG-4 outputs", async ({
  page,
}) => {
  test.setTimeout(180_000);
  await page.goto("/?test=1&directory=1");
  await page.waitForFunction(
    () => window.__WITHIN_TEST__?.getState().workerStatus === "ready",
  );
  await page.locator('[data-testid="file-input"]').setInputFiles(videoFixturePath);

  await page.locator('[data-testid="format-select"]').selectOption("mkv-to-webm");
  await page.locator('[data-testid="video-codec-select"]').selectOption("vp9");
  await page.locator('[data-testid="video-width-select"]').selectOption("320");
  await page.locator('[data-testid="video-bitrate-select"]').selectOption("1000000");
  await page.locator('[data-testid="video-frame-rate-select"]').selectOption("15");
  await page.locator('[data-testid="video-quality-select"]').selectOption("higher");
  const vp9State = await waitForCompletedConversion(page);
  expect(vp9State.opfsName).toBeNull();
  // Four Wasm pthreads plus the media worker and direct-write helper.
  expect(vp9State.metrics?.activeWorkerCount).toBe(6);
  const vp9Entry = vp9State.batchOutputNames[0];
  expect(vp9Entry).toBeTruthy();
  await copyAndDeleteSmallBrowserOutput(page, vp9Entry, customVp9Path);
  const vp9Probe = await probeVideo(customVp9Path);
  expect(vp9Probe.streams).toHaveLength(1);
  expect(vp9Probe.streams[0]).toMatchObject({
    codec_name: "vp9",
    width: 320,
    height: 180,
    r_frame_rate: "15/1",
    avg_frame_rate: "15/1",
    nb_read_frames: "60",
  });
  expect(Number(vp9Probe.format.duration)).toBeGreaterThan(3.9);
  expect(Number(vp9Probe.format.duration)).toBeLessThan(4.1);

  await page
    .locator('[data-testid="format-select"]')
    .selectOption("mkv-to-mp4-mpeg4");
  await page.locator('[data-testid="video-codec-select"]').selectOption("mpeg4");
  await page.locator('[data-testid="video-width-select"]').selectOption("480");
  await page.locator('[data-testid="video-bitrate-select"]').selectOption("2000000");
  await page.locator('[data-testid="video-frame-rate-select"]').selectOption("15");
  await page.locator('[data-testid="video-quality-select"]').selectOption("balanced");
  const mpeg4State = await waitForCompletedConversion(page);
  expect(mpeg4State.opfsName).toBeNull();
  const mpeg4Entry = mpeg4State.batchOutputNames[0];
  expect(mpeg4Entry).toBeTruthy();
  await copyAndDeleteSmallBrowserOutput(page, mpeg4Entry, customMpeg4Path);
  const mpeg4Probe = await probeVideo(customMpeg4Path);
  expect(mpeg4Probe.streams).toHaveLength(1);
  expect(mpeg4Probe.streams[0]).toMatchObject({
    codec_name: "mpeg4",
    width: 480,
    height: 270,
    r_frame_rate: "15/1",
    avg_frame_rate: "15/1",
    nb_read_frames: "60",
  });
  expect(Number(mpeg4Probe.format.duration)).toBeGreaterThan(3.9);
  expect(Number(mpeg4Probe.format.duration)).toBeLessThan(4.1);

  await execFileAsync(
    "ffmpeg",
    ["-hide_banner", "-loglevel", "error", "-i", customVp9Path, "-f", "null", "NUL"],
    { cwd: projectRoot, windowsHide: true, maxBuffer: 8 * 1024 * 1024 },
  );
  await execFileAsync(
    "ffmpeg",
    ["-hide_banner", "-loglevel", "error", "-i", customMpeg4Path, "-f", "null", "NUL"],
    { cwd: projectRoot, windowsHide: true, maxBuffer: 8 * 1024 * 1024 },
  );
});

test("native video bitrate and quality policies materially affect encoded output", async ({
  page,
}) => {
  test.setTimeout(180_000);
  await page.goto("/?test=1&directory=1");
  await page.waitForFunction(
    () => window.__WITHIN_TEST__?.getState().workerStatus === "ready",
  );
  await page.locator('[data-testid="file-input"]').setInputFiles(videoFixturePath);
  await page.locator('[data-testid="format-select"]').selectOption("mkv-to-webm");
  await page.locator('[data-testid="video-codec-select"]').selectOption("vp8");
  await page.locator('[data-testid="video-width-select"]').selectOption("320");
  await page.locator('[data-testid="video-frame-rate-select"]').selectOption("15");

  await page.locator('[data-testid="video-bitrate-select"]').selectOption("300000");
  await page.locator('[data-testid="video-quality-select"]').selectOption("higher");
  const lowBitrateState = await waitForCompletedConversion(page);
  await copyAndDeleteSmallBrowserOutput(
    page,
    lowBitrateState.batchOutputNames[0],
    lowBitrateVideoPath,
  );

  await page.locator('[data-testid="video-bitrate-select"]').selectOption("4000000");
  const higherQualityState = await waitForCompletedConversion(page);
  await copyAndDeleteSmallBrowserOutput(
    page,
    higherQualityState.batchOutputNames[0],
    higherQualityVideoPath,
  );

  await page.locator('[data-testid="video-quality-select"]').selectOption("smaller");
  const smallerState = await waitForCompletedConversion(page);
  await copyAndDeleteSmallBrowserOutput(
    page,
    smallerState.batchOutputNames[0],
    smallerVideoPath,
  );

  const [lowBitrateBytes, higherQualityBytes, smallerBytes] = await Promise.all([
    stat(lowBitrateVideoPath).then((value) => value.size),
    stat(higherQualityVideoPath).then((value) => value.size),
    stat(smallerVideoPath).then((value) => value.size),
  ]);
  expect(higherQualityBytes).toBeGreaterThan(lowBitrateBytes * 1.05);
  expect(higherQualityBytes).toBeGreaterThan(smallerBytes);

  const [higherQualityPsnr, smallerPsnr] = await Promise.all([
    measureScaledVideoPsnr(higherQualityVideoPath),
    measureScaledVideoPsnr(smallerVideoPath),
  ]);
  expect(higherQualityPsnr).toBeGreaterThan(smallerPsnr);
  expect(higherQualityState.metrics?.activeWorkerCount).toBe(6);
  expect(smallerState.metrics?.activeWorkerCount).toBe(10);
});

test("maximum custom video topology releases a partial direct output after write failure", async ({
  page,
}) => {
  await page.goto("/?test=1&directory=1&fault=write");
  await page.waitForFunction(
    () => window.__WITHIN_TEST__?.getState().workerStatus === "ready",
  );
  await page.locator('[data-testid="file-input"]').setInputFiles(videoFixturePath);
  await page
    .locator('[data-testid="format-select"]')
    .selectOption("mkv-to-webm-vp9");
  await page.locator('[data-testid="video-codec-select"]').selectOption("vp9");
  await page.locator('[data-testid="video-width-select"]').selectOption("640");
  await page.locator('[data-testid="video-bitrate-select"]').selectOption("4000000");
  await page.locator('[data-testid="video-frame-rate-select"]').selectOption("30");
  await page.locator('[data-testid="video-quality-select"]').selectOption("higher");

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
      const handle = await root.getFileHandle("remux-source.webm");
      const size = (await handle.getFile()).size;
      await root.removeEntry("remux-source.webm");
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

test("maximum custom video topology cancels and removes its direct output", async ({
  page,
}) => {
  await page.goto("/?test=1&directory=1");
  await page.waitForFunction(
    () => window.__WITHIN_TEST__?.getState().workerStatus === "ready",
  );
  await page.locator('[data-testid="file-input"]').setInputFiles(videoFixturePath);
  await page
    .locator('[data-testid="format-select"]')
    .selectOption("mkv-to-webm-vp9");
  await page.locator('[data-testid="video-codec-select"]').selectOption("vp9");
  await page.locator('[data-testid="video-width-select"]').selectOption("640");
  await page.locator('[data-testid="video-bitrate-select"]').selectOption("4000000");
  await page.locator('[data-testid="video-frame-rate-select"]').selectOption("30");
  await page.locator('[data-testid="video-quality-select"]').selectOption("higher");

  await page.locator('[data-testid="convert-button"]').click();
  const cancelButton = page.getByRole("button", { name: "Cancel safely" });
  await expect(cancelButton).toBeVisible({ timeout: 15_000 });
  await cancelButton.click();
  await expect
    .poll(
      () => page.evaluate(() => window.__WITHIN_TEST__?.getState().jobState),
      { timeout: 30_000 },
    )
    .toBe("cancelled");

  const state = await page.evaluate(() => window.__WITHIN_TEST__?.getState());
  expect(state?.opfsName).toBeNull();
  expect(state?.metrics?.pendingOperations).toBe(0);
  expect(state?.metrics?.queuedBytes).toBe(0);
  const abandonedSize = await page.evaluate(async () => {
    const root = await navigator.storage.getDirectory();
    try {
      const handle = await root.getFileHandle("remux-source.webm");
      const size = (await handle.getFile()).size;
      await root.removeEntry("remux-source.webm");
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

test("native audio controls produce genuine practical lossy and lossless codecs", async ({
  page,
}) => {
  const cases = [
    {
      profile: "wav-to-aac",
      codec: "aac",
      extension: "aac",
      expectedCodec: "aac",
      bitRate: 256_000,
      sampleRate: 44_100,
      channels: 1,
      quality: "higher",
    },
    {
      profile: "wav-to-opus",
      codec: "opus",
      extension: "opus",
      expectedCodec: "opus",
      bitRate: 192_000,
      sampleRate: 24_000,
      expectedSampleRate: 48_000,
      channels: 2,
      quality: "higher",
    },
    {
      profile: "wav-to-ogg",
      codec: "vorbis",
      extension: "ogg",
      expectedCodec: "vorbis",
      bitRate: 0,
      sampleRate: 32_000,
      channels: 1,
      quality: "higher",
    },
    {
      profile: "wav-to-wma",
      codec: "wma",
      extension: "wma",
      expectedCodec: "wmav2",
      bitRate: 192_000,
      sampleRate: 44_100,
      channels: 2,
      quality: "balanced",
    },
    {
      profile: "wav-to-flac",
      codec: "flac",
      extension: "flac",
      expectedCodec: "flac",
      bitRate: 0,
      sampleRate: 32_000,
      channels: 1,
      quality: "automatic",
    },
    {
      profile: "wav-to-alac",
      codec: "alac",
      extension: "m4a",
      expectedCodec: "alac",
      bitRate: 0,
      sampleRate: 48_000,
      channels: 2,
      quality: "automatic",
    },
    {
      profile: "wav-to-aiff",
      codec: "pcm",
      extension: "aiff",
      expectedCodec: "pcm_s16be",
      bitRate: 0,
      sampleRate: 44_100,
      channels: 1,
      quality: "automatic",
    },
    {
      profile: "wav-to-amr",
      codec: "amr",
      extension: "amr",
      expectedCodec: "amr_nb",
      bitRate: 0,
      sampleRate: 8_000,
      channels: 1,
      quality: "automatic",
    },
  ] as const;

  for (const conversion of cases) {
    await page.goto("/?test=1");
    await page.waitForFunction(
      () => window.__WITHIN_TEST__?.getState().workerStatus === "ready",
    );
    await page.locator('[data-testid="file-input"]').setInputFiles(wavFixturePath);
    await page
      .locator('[data-testid="format-select"]')
      .selectOption(conversion.profile);
    await page
      .locator('[data-testid="audio-codec-select"]')
      .selectOption(conversion.codec);
    if (conversion.bitRate !== 0) {
      await page
        .locator('[data-testid="audio-bitrate-select"]')
        .selectOption(String(conversion.bitRate));
    }
    if (conversion.codec !== "amr") {
      await page
        .locator('[data-testid="audio-sample-rate-select"]')
        .selectOption(String(conversion.sampleRate));
      await page
        .locator('[data-testid="audio-channels-select"]')
        .selectOption(String(conversion.channels));
    }
    if (conversion.quality !== "automatic") {
      await page
        .locator('[data-testid="audio-quality-select"]')
        .selectOption(conversion.quality);
    }

    const state = await waitForCompletedConversion(page);
    expect(state.opfsName).toBeTruthy();
    const outputPath = path.join(
      audioMatrixRoot,
      `${conversion.codec}.${conversion.extension}`,
    );
    await copyAndDeleteSmallBrowserOutput(page, state.opfsName!, outputPath);
    const probe = await probeAudio(outputPath);
    expect(probe.streams).toHaveLength(1);
    expect(probe.streams[0]?.codec_name).toBe(conversion.expectedCodec);
    expect(probe.streams[0]?.sample_rate).toBe(
      String("expectedSampleRate" in conversion
        ? conversion.expectedSampleRate
        : conversion.sampleRate),
    );
    expect(probe.streams[0]?.channels).toBe(conversion.channels);
    const measuredDurationSeconds =
      conversion.codec === "amr"
        ? Number(probe.streams[0]?.nb_read_frames) * 0.02
        : Number(probe.format.duration);
    const durationToleranceSeconds = conversion.codec === "aac" ? 0.2 : 0.1;
    expect(
      Math.abs(measuredDurationSeconds - 4),
      `${conversion.codec} output duration delta`,
    ).toBeLessThanOrEqual(durationToleranceSeconds);
    await execFileAsync(
      "ffmpeg",
      ["-hide_banner", "-loglevel", "error", "-i", outputPath, "-f", "null", "NUL"],
      { cwd: projectRoot, windowsHide: true, maxBuffer: 8 * 1024 * 1024 },
    );
  }
});

test("bounded audio metadata preserves compatible tags and cover art", async ({
  page,
}) => {
  const sourceArtworkSha256 = await extractedArtworkSha256(artworkFixturePath);
  const expectedTags = {
    title: "Within artwork title",
    artist: "Within artist",
    album: "Within album",
    genre: "Test genre",
    date: "2026",
    track: "3/9",
    comment: "Within comment",
  } as const;
  const verifyTagsAndArtwork = async (
    outputPath: string,
    expectedCodec: "mp3" | "flac",
  ) => {
    const probe = await probeAudioWithArtwork(outputPath);
    const audio = probe.streams.filter((stream) => stream.codec_type === "audio");
    const artwork = probe.streams.filter(
      (stream) => stream.disposition?.attached_pic === 1,
    );
    expect(audio).toHaveLength(1);
    expect(audio[0]?.codec_name).toBe(expectedCodec);
    expect(artwork).toHaveLength(1);
    expect(artwork[0]?.codec_name).toBe("png");
    expect(artwork[0]?.width).toBe(64);
    expect(artwork[0]?.height).toBe(64);
    for (const [key, value] of Object.entries(expectedTags)) {
      expect(probe.format.tags?.[key]).toBe(value);
    }
    expect(await extractedArtworkSha256(outputPath)).toBe(sourceArtworkSha256);
    await execFileAsync(
      "ffmpeg",
      ["-hide_banner", "-loglevel", "error", "-i", outputPath, "-map", "0:a:0", "-f", "null", "NUL"],
      { cwd: projectRoot, windowsHide: true, maxBuffer: 8 * 1024 * 1024 },
    );
  };
  const generatedArtworkOutputs = new Map<"mp3" | "flac", string>();

  for (const conversion of [
    { profile: "m4a-to-mp3", extension: "mp3", codec: "mp3" },
    { profile: "m4a-to-flac", extension: "flac", codec: "flac" },
  ] as const) {
    await page.goto("/?test=1");
    await page.waitForFunction(
      () => window.__WITHIN_TEST__?.getState().workerStatus === "ready",
    );
    await page.locator('[data-testid="file-input"]').setInputFiles(artworkFixturePath);
    await page
      .locator('[data-testid="format-select"]')
      .selectOption(conversion.profile);
    const state = await waitForCompletedConversion(page);
    expect(state.warnings).toEqual([]);
    expect(state.opfsName).toBeTruthy();

    const outputPath = path.join(
      validationRoot,
      `artwork-output.${conversion.extension}`,
    );
    await copyAndDeleteSmallBrowserOutput(page, state.opfsName!, outputPath);
    await verifyTagsAndArtwork(outputPath, conversion.codec);
    generatedArtworkOutputs.set(conversion.codec, outputPath);
  }

  for (const conversion of [
    {
      profile: "ogg-to-mp3",
      input: vorbisArtworkFixturePath,
      inputCodec: "vorbis",
      outputCodec: "mp3",
    },
    {
      profile: "ogg-to-flac",
      input: vorbisArtworkFixturePath,
      inputCodec: "vorbis",
      outputCodec: "flac",
    },
    {
      profile: "opus-to-mp3",
      input: opusArtworkFixturePath,
      inputCodec: "opus",
      outputCodec: "mp3",
    },
    {
      profile: "opus-to-flac",
      input: opusArtworkFixturePath,
      inputCodec: "opus",
      outputCodec: "flac",
    },
  ] as const) {
    await page.goto("/?test=1");
    await page.waitForFunction(
      () => window.__WITHIN_TEST__?.getState().workerStatus === "ready",
    );
    await page.locator('[data-testid="file-input"]').setInputFiles(conversion.input);
    await page
      .locator('[data-testid="format-select"]')
      .selectOption(conversion.profile);
    const state = await waitForCompletedConversion(page);
    expect(state.warnings).toEqual([]);
    expect(state.opfsName).toBeTruthy();
    const outputPath = path.join(
      validationRoot,
      `artwork-${conversion.inputCodec}-to-${conversion.outputCodec}.${conversion.outputCodec}`,
    );
    await copyAndDeleteSmallBrowserOutput(page, state.opfsName!, outputPath);
    await verifyTagsAndArtwork(outputPath, conversion.outputCodec);
  }

  for (const conversion of [
    {
      profile: "mp3-to-flac",
      inputCodec: "mp3",
      outputCodec: "flac",
    },
    {
      profile: "flac-to-mp3",
      inputCodec: "flac",
      outputCodec: "mp3",
    },
  ] as const) {
    const inputPath = generatedArtworkOutputs.get(conversion.inputCodec);
    expect(inputPath).toBeTruthy();
    await page.goto("/?test=1");
    await page.waitForFunction(
      () => window.__WITHIN_TEST__?.getState().workerStatus === "ready",
    );
    await page.locator('[data-testid="file-input"]').setInputFiles(inputPath!);
    await page
      .locator('[data-testid="format-select"]')
      .selectOption(conversion.profile);
    const state = await waitForCompletedConversion(page);
    expect(state.warnings).toEqual([]);
    expect(state.opfsName).toBeTruthy();
    const outputPath = path.join(
      validationRoot,
      `artwork-${conversion.inputCodec}-to-${conversion.outputCodec}.${conversion.outputCodec}`,
    );
    await copyAndDeleteSmallBrowserOutput(page, state.opfsName!, outputPath);
    await verifyTagsAndArtwork(outputPath, conversion.outputCodec);
  }

  const sourceMp3PayloadSha256 = await copiedAudioPayloadSha256(
    mp3ArtworkFixturePath,
  );
  await page.goto("/?test=1");
  await page.waitForFunction(
    () => window.__WITHIN_TEST__?.getState().workerStatus === "ready",
  );
  await page.locator('[data-testid="file-input"]').setInputFiles(mp3ArtworkFixturePath);
  await page.locator('[data-testid="format-select"]').selectOption("mp4-to-mp3");
  const extractionState = await waitForCompletedConversion(page);
  expect(extractionState.warnings).toEqual([]);
  expect(extractionState.opfsName).toBeTruthy();
  const extractedMp3Path = path.join(validationRoot, "artwork-stream-copy.mp3");
  await copyAndDeleteSmallBrowserOutput(
    page,
    extractionState.opfsName!,
    extractedMp3Path,
  );
  const extractedMp3Probe = await probeAudioWithArtwork(extractedMp3Path);
  expect(
    extractedMp3Probe.streams.filter((stream) => stream.codec_type === "audio"),
  ).toHaveLength(1);
  expect(extractedMp3Probe.streams[0]?.codec_name).toBe("mp3");
  expect(
    extractedMp3Probe.streams.filter(
      (stream) => stream.disposition?.attached_pic === 1,
    ),
  ).toHaveLength(1);
  for (const [key, value] of Object.entries(expectedTags)) {
    expect(extractedMp3Probe.format.tags?.[key]).toBe(value);
  }
  expect(await extractedArtworkSha256(extractedMp3Path)).toBe(
    sourceArtworkSha256,
  );
  expect(await copiedAudioPayloadSha256(extractedMp3Path)).toBe(
    sourceMp3PayloadSha256,
  );

  await page.goto("/?test=1");
  await page.waitForFunction(
    () => window.__WITHIN_TEST__?.getState().workerStatus === "ready",
  );
  await page.locator('[data-testid="file-input"]').setInputFiles(artworkFixturePath);
  await page.locator('[data-testid="format-select"]').selectOption("m4a-to-aac");
  const excludedState = await waitForCompletedConversion(page);
  expect(
    excludedState.warnings.some((warning) =>
      warning.includes("cover art is explicitly excluded"),
    ),
  ).toBe(true);
  expect(excludedState.opfsName).toBeTruthy();
  const rawAacPath = path.join(validationRoot, "artwork-excluded.aac");
  await copyAndDeleteSmallBrowserOutput(page, excludedState.opfsName!, rawAacPath);
  const rawAacProbe = await probeAudioWithArtwork(rawAacPath);
  expect(rawAacProbe.streams).toHaveLength(1);
  expect(rawAacProbe.streams[0]?.codec_name).toBe("aac");
  expect(
    rawAacProbe.streams.some(
      (stream) => stream.disposition?.attached_pic === 1,
    ),
  ).toBe(false);
});

test("native audio quality policies materially change AAC bitrate and size", async ({
  page,
}) => {
  const results: Array<{ quality: "smaller" | "higher"; bytes: number; bitRate: number }> = [];
  for (const quality of ["smaller", "higher"] as const) {
    await page.goto("/?test=1");
    await page.waitForFunction(
      () => window.__WITHIN_TEST__?.getState().workerStatus === "ready",
    );
    await page.locator('[data-testid="file-input"]').setInputFiles(wavFixturePath);
    await page.locator('[data-testid="format-select"]').selectOption("wav-to-aac");
    await page.locator('[data-testid="audio-quality-select"]').selectOption(quality);
    const state = await waitForCompletedConversion(page);
    expect(state.opfsName).toBeTruthy();
    const outputPath = path.join(validationRoot, `aac-${quality}.aac`);
    await copyAndDeleteSmallBrowserOutput(page, state.opfsName!, outputPath);
    const probe = await probeAudio(outputPath);
    expect(probe.streams[0]?.codec_name).toBe("aac");
    results.push({
      quality,
      bytes: (await stat(outputPath)).size,
      bitRate: Number(probe.streams[0]?.bit_rate),
    });
  }

  const smaller = results.find((result) => result.quality === "smaller")!;
  const higher = results.find((result) => result.quality === "higher")!;
  expect(higher.bitRate).toBeGreaterThan(smaller.bitRate * 1.3);
  expect(higher.bytes).toBeGreaterThan(smaller.bytes * 1.3);
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
