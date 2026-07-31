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
import { mkdir, rm, stat, writeFile } from "node:fs/promises";
import path from "node:path";
import { promisify } from "node:util";

const execFileAsync = promisify(execFile);
const projectRoot = path.resolve(import.meta.dirname, "..", "..");
const testPort = process.env.WITHIN_TEST_PORT ?? "3000";
const baseURL =
  process.env.WITHIN_TEST_BASE_URL ?? `http://127.0.0.1:${testPort}`;
const profileRoot = path.join(projectRoot, "work", "playwright-profile-media");
const outputRoot = path.join(projectRoot, "outputs", "browser-media-smoke");
const mp4OutputPath = path.join(outputRoot, "remux-output.mp4");
const m4aOutputPath = path.join(outputRoot, "extract-output.m4a");
const wavOutputPath = path.join(outputRoot, "convert-output.wav");
const standaloneWavOutputPath = path.join(
  outputRoot,
  "standalone-convert-output.wav",
);
const mp3WavOutputPath = path.join(outputRoot, "mp3-convert-output.wav");
const flacWavOutputPath = path.join(outputRoot, "flac-convert-output.wav");
const m4aFlacOutputPath = path.join(outputRoot, "m4a-convert-output.flac");
const mp3FlacOutputPath = path.join(outputRoot, "mp3-convert-output.flac");
const wavFlacOutputPath = path.join(outputRoot, "wav-convert-output.flac");
const aiffWavOutputPath = path.join(outputRoot, "aiff-convert-output.wav");
const oggWavOutputPath = path.join(outputRoot, "ogg-convert-output.wav");
const opusWavOutputPath = path.join(outputRoot, "opus-convert-output.wav");
const mpeg4OutputPath = path.join(outputRoot, "reencode-output.mp4");
const webmOutputPath = path.join(outputRoot, "reencode-output.webm");
const complexMp4OutputPath = path.join(outputRoot, "complex-remux-output.mp4");
const fixturePath = path.join(
  projectRoot,
  "fixtures",
  "media",
  "remux-source.mkv",
);
const complexFixturePath = path.join(
  projectRoot,
  "fixtures",
  "media",
  "complex-remux-source.mkv",
);
const corruptFixturePath = path.join(
  projectRoot,
  "work",
  "corrupt-source.mkv",
);
const incompatibleFixturePath = path.join(
  projectRoot,
  "work",
  "incompatible-audio-source.mkv",
);
const audioFixturePath = path.join(
  projectRoot,
  "fixtures",
  "media",
  "audio-source.m4a",
);
const mp3FixturePath = path.join(
  projectRoot,
  "fixtures",
  "media",
  "audio-source.mp3",
);
const flacFixturePath = path.join(
  projectRoot,
  "fixtures",
  "media",
  "audio-source.flac",
);
const wavFixturePath = path.join(
  projectRoot,
  "fixtures",
  "media",
  "audio-source.wav",
);
const aiffFixturePath = path.join(
  projectRoot,
  "fixtures",
  "media",
  "audio-source.aiff",
);
const oggFixturePath = path.join(
  projectRoot,
  "fixtures",
  "media",
  "audio-source.ogg",
);
const opusFixturePath = path.join(
  projectRoot,
  "fixtures",
  "media",
  "audio-source.opus",
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

interface ProbeStream {
  codec_name: string;
  codec_type: string;
  tags?: Record<string, string>;
  disposition?: Record<string, number>;
}

interface MediaProbe {
  streams: ProbeStream[];
  chapters?: unknown[];
  format: {
    duration: string;
    tags?: Record<string, string>;
  };
}

interface MediaRouteOptions {
  expectedWarningFragments?: readonly string[];
  validate?: (probe: MediaProbe, outputPath: string) => Promise<void>;
}

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
  assertProjectLocal(standaloneWavOutputPath);
  assertProjectLocal(mp3WavOutputPath);
  assertProjectLocal(flacWavOutputPath);
  assertProjectLocal(m4aFlacOutputPath);
  assertProjectLocal(mp3FlacOutputPath);
  assertProjectLocal(wavFlacOutputPath);
  assertProjectLocal(aiffWavOutputPath);
  assertProjectLocal(oggWavOutputPath);
  assertProjectLocal(opusWavOutputPath);
  assertProjectLocal(mpeg4OutputPath);
  assertProjectLocal(webmOutputPath);
  assertProjectLocal(complexMp4OutputPath);
  assertProjectLocal(corruptFixturePath);
  assertProjectLocal(incompatibleFixturePath);
  await rm(profileRoot, { recursive: true, force: true });
  await rm(corruptFixturePath, { force: true });
  await rm(incompatibleFixturePath, { force: true });
  await mkdir(profileRoot, { recursive: true });
  await mkdir(outputRoot, { recursive: true });
  await writeFile(
    corruptFixturePath,
    Buffer.concat([
      Buffer.from("Within deliberately corrupt Matroska fixture.\n", "utf8"),
      Buffer.alloc(4096, 0xa5),
    ]),
  );
  await execFileAsync(
    "ffmpeg",
    [
      "-hide_banner",
      "-loglevel",
      "error",
      "-y",
      "-f",
      "lavfi",
      "-i",
      "testsrc2=size=320x180:rate=24:duration=2",
      "-f",
      "lavfi",
      "-i",
      "sine=frequency=660:sample_rate=48000:duration=2",
      "-map",
      "0:v:0",
      "-map",
      "1:a:0",
      "-c:v",
      "libx264",
      "-preset",
      "ultrafast",
      "-pix_fmt",
      "yuv420p",
      "-c:a",
      "libvorbis",
      "-f",
      "matroska",
      incompatibleFixturePath,
    ],
    { cwd: projectRoot, windowsHide: true, maxBuffer: 8 * 1024 * 1024 },
  );

  context = await chromium.launchPersistentContext(profileRoot, {
    executablePath: chromePath,
    headless: true,
    acceptDownloads: false,
    baseURL,
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
  await rm(standaloneWavOutputPath, { force: true });
  await rm(mp3WavOutputPath, { force: true });
  await rm(flacWavOutputPath, { force: true });
  await rm(m4aFlacOutputPath, { force: true });
  await rm(mp3FlacOutputPath, { force: true });
  await rm(wavFlacOutputPath, { force: true });
  await rm(aiffWavOutputPath, { force: true });
  await rm(oggWavOutputPath, { force: true });
  await rm(opusWavOutputPath, { force: true });
  await rm(mpeg4OutputPath, { force: true });
  await rm(webmOutputPath, { force: true });
  await rm(complexMp4OutputPath, { force: true });
  await rm(corruptFixturePath, { force: true });
  await rm(incompatibleFixturePath, { force: true });
  await rm(profileRoot, { recursive: true, force: true });
});

async function runMediaRoute(
  profileId:
    | "mkv-to-mp4"
    | "mkv-to-m4a"
    | "mkv-to-wav"
    | "m4a-to-wav"
    | "mp3-to-wav"
    | "flac-to-wav"
    | "m4a-to-flac"
    | "mp3-to-flac"
    | "wav-to-flac"
    | "aiff-to-wav"
    | "ogg-to-wav"
    | "opus-to-wav"
    | "mkv-to-webm"
    | "mkv-to-mp4-mpeg4",
  outputPath: string,
  expectedCodecs: string[],
  minimumBytes: number,
  inputPath = fixturePath,
  options: MediaRouteOptions = {},
) {
  try {
    await page.goto("/?test=1");
    await page.waitForFunction(
      () => window.__WITHIN_TEST__?.getState().workerStatus === "ready",
    );
    await page.locator('[data-testid="file-input"]').setInputFiles(inputPath);
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
    if (options.expectedWarningFragments) {
      for (const fragment of options.expectedWarningFragments) {
        expect(
          state.warnings.some((warning) => warning.includes(fragment)),
          `Expected a warning containing ${fragment}.`,
        ).toBe(true);
      }
    } else if (profileId === "mkv-to-mp4") {
      expect(state.warnings).toEqual([]);
    } else if (profileId === "mkv-to-m4a" || profileId === "mkv-to-wav") {
      expect(state.warnings.some((warning) => warning.includes("video stream"))).toBe(
        true,
      );
    } else if (
      profileId === "m4a-to-wav" ||
      profileId === "mp3-to-wav" ||
      profileId === "flac-to-wav" ||
      profileId === "m4a-to-flac" ||
      profileId === "mp3-to-flac" ||
      profileId === "wav-to-flac" ||
      profileId === "aiff-to-wav" ||
      profileId === "ogg-to-wav" ||
      profileId === "opus-to-wav"
    ) {
      expect(state.warnings).toEqual([]);
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
        "-show_chapters",
        "-of",
        "json",
        outputPath,
      ],
      { cwd: projectRoot, windowsHide: true, maxBuffer: 8 * 1024 * 1024 },
    );
    const probe = JSON.parse(stdout) as MediaProbe;
    expect(
      probe.streams.map(
        (stream: { codec_name: string }) => stream.codec_name,
      ),
    ).toEqual(expectedCodecs);
    expect(Number(probe.format.duration)).toBeGreaterThan(3.9);
    expect(Number(probe.format.duration)).toBeLessThan(4.2);
    await options.validate?.(probe, outputPath);
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

test("browser remux preserves multiple audio tracks and VFR timing while disclosing exclusions", async () => {
  await runMediaRoute(
    "mkv-to-mp4",
    complexMp4OutputPath,
    ["h264", "aac", "aac"],
    400_000,
    complexFixturePath,
    {
      expectedWarningFragments: ["subtitle", "attachment", "chapter"],
      validate: async (probe, outputPath) => {
        const audio = probe.streams.filter(
          (stream) => stream.codec_type === "audio",
        );
        expect(audio).toHaveLength(2);
        expect(audio.map((stream) => stream.tags?.language)).toEqual([
          "eng",
          "spa",
        ]);
        expect(audio.map((stream) => stream.disposition?.default)).toEqual([
          1,
          0,
        ]);
        expect(probe.chapters ?? []).toEqual([]);
        expect(probe.format.tags?.title).toBe(
          "Within complex remux fixture",
        );

        const { stdout: packetOutput } = await execFileAsync(
          "ffprobe",
          [
            "-v",
            "error",
            "-select_streams",
            "v:0",
            "-show_entries",
            "packet=pts_time",
            "-show_packets",
            "-of",
            "json",
            outputPath,
          ],
          { cwd: projectRoot, windowsHide: true, maxBuffer: 8 * 1024 * 1024 },
        );
        const packets = JSON.parse(packetOutput) as {
          packets: Array<{ pts_time: string }>;
        };
        const timestamps = packets.packets
          .map((packet) => Number(packet.pts_time))
          .sort((left, right) => left - right);
        const deltasMs = new Set(
          timestamps
            .slice(1)
            .map((timestamp, index) =>
              Math.round((timestamp - timestamps[index]) * 1000),
            ),
        );
        expect([...deltasMs].some((delta) => delta >= 82 && delta <= 84)).toBe(
          true,
        );
        expect([...deltasMs].some((delta) => delta >= 41 && delta <= 43)).toBe(
          true,
        );

        await execFileAsync(
          "ffmpeg",
          [
            "-hide_banner",
            "-loglevel",
            "error",
            "-i",
            outputPath,
            "-map",
            "0:v:0",
            "-map",
            "0:a",
            "-f",
            "null",
            "-",
          ],
          { cwd: projectRoot, windowsHide: true, maxBuffer: 8 * 1024 * 1024 },
        );
      },
    },
  );
});

test("browser FFmpeg rejects corrupt MKV and removes its partial output", async () => {
  await page.goto("/?test=1");
  await page.waitForFunction(
    () => window.__WITHIN_TEST__?.getState().workerStatus === "ready",
  );
  await page
    .locator('[data-testid="file-input"]')
    .setInputFiles(corruptFixturePath);
  await page
    .locator('[data-testid="format-select"]')
    .selectOption("mkv-to-mp4");
  await page.locator('[data-testid="convert-button"]').click();
  await expect
    .poll(async () => (await currentState()).jobState, { timeout: 30_000 })
    .toBe("error");
  const failed = await currentState();
  expect(failed.error).toMatch(/input|matroska|invalid data/i);
  expect(failed.opfsName).toBeNull();
  const leftovers = await page.evaluate(async () => {
    const root = await navigator.storage.getDirectory();
    const names: string[] = [];
    for await (const [name] of root.entries()) {
      if (name.startsWith("within-test-mkv-to-mp4")) names.push(name);
    }
    return names;
  });
  expect(leftovers).toEqual([]);
  await expect
    .poll(async () => (await currentState()).workerStatus, { timeout: 15_000 })
    .toBe("ready");
});

test("browser planner rejects a codec combination that MP4 cannot stream-copy", async () => {
  await page.goto("/?test=1");
  await page.waitForFunction(
    () => window.__WITHIN_TEST__?.getState().workerStatus === "ready",
  );
  await page
    .locator('[data-testid="file-input"]')
    .setInputFiles(incompatibleFixturePath);
  await page
    .locator('[data-testid="format-select"]')
    .selectOption("mkv-to-mp4");
  await page.locator('[data-testid="convert-button"]').click();
  await expect
    .poll(async () => (await currentState()).jobState, { timeout: 30_000 })
    .toBe("error");
  const failed = await currentState();
  expect(failed.error).toContain(
    "MKV-to-MP4 lossless stream copy accepts AAC audio",
  );
  expect(failed.opfsName).toBeNull();
  const leftovers = await page.evaluate(async () => {
    const root = await navigator.storage.getDirectory();
    const names: string[] = [];
    for await (const [name] of root.entries()) {
      if (name.startsWith("within-test-mkv-to-mp4")) names.push(name);
    }
    return names;
  });
  expect(leftovers).toEqual([]);
  await expect
    .poll(async () => (await currentState()).workerStatus, { timeout: 15_000 })
    .toBe("ready");
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

test("browser FFmpeg converts a standalone M4A audio file to PCM WAV", async () => {
  await runMediaRoute(
    "m4a-to-wav",
    standaloneWavOutputPath,
    ["pcm_s16le"],
    300_000,
    audioFixturePath,
  );
});

test("browser FFmpeg decodes a standalone MP3 file to PCM WAV", async () => {
  await runMediaRoute(
    "mp3-to-wav",
    mp3WavOutputPath,
    ["pcm_s16le"],
    300_000,
    mp3FixturePath,
  );
});

test("browser FFmpeg decodes a standalone FLAC file to PCM WAV", async () => {
  await runMediaRoute(
    "flac-to-wav",
    flacWavOutputPath,
    ["pcm_s16le"],
    300_000,
    flacFixturePath,
  );
});

test("browser FFmpeg converts standalone M4A audio to FLAC", async () => {
  await runMediaRoute(
    "m4a-to-flac",
    m4aFlacOutputPath,
    ["flac"],
    20_000,
    audioFixturePath,
  );
});

test("browser FFmpeg converts standalone MP3 audio to FLAC", async () => {
  await runMediaRoute(
    "mp3-to-flac",
    mp3FlacOutputPath,
    ["flac"],
    20_000,
    mp3FixturePath,
  );
});

test("browser FFmpeg losslessly encodes PCM WAV as FLAC", async () => {
  await runMediaRoute(
    "wav-to-flac",
    wavFlacOutputPath,
    ["flac"],
    20_000,
    wavFixturePath,
  );
});

test("browser FFmpeg converts AIFF PCM to PCM WAV", async () => {
  await runMediaRoute(
    "aiff-to-wav",
    aiffWavOutputPath,
    ["pcm_s16le"],
    300_000,
    aiffFixturePath,
  );
});

test("browser FFmpeg decodes Ogg Vorbis to PCM WAV", async () => {
  await runMediaRoute(
    "ogg-to-wav",
    oggWavOutputPath,
    ["pcm_s16le"],
    300_000,
    oggFixturePath,
  );
});

test("browser FFmpeg decodes Opus to PCM WAV", async () => {
  await runMediaRoute(
    "opus-to-wav",
    opusWavOutputPath,
    ["pcm_s16le"],
    300_000,
    opusFixturePath,
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

test("browser FFmpeg decodes video and encodes a genuine VP8 WebM", async () => {
  await runMediaRoute(
    "mkv-to-webm",
    webmOutputPath,
    ["vp8"],
    50_000,
  );
});

declare global {
  interface Window {
    __withinMediaValidationChunk(base64: string): Promise<void>;
  }
}
