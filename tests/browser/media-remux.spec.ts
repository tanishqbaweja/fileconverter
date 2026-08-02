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
const movMp4OutputPath = path.join(outputRoot, "mov-remux-output.mp4");
const threeGpMp4OutputPath = path.join(outputRoot, "3gp-remux-output.mp4");
const mpegTsMp4OutputPath = path.join(outputRoot, "mpeg-ts-remux-output.mp4");
const flvMp4OutputPath = path.join(outputRoot, "flv-remux-output.mp4");
const aviMp4OutputPath = path.join(outputRoot, "avi-remux-output.mp4");
const directMp4OutputPath = path.join(outputRoot, "direct-remux-output.mp4");
const directWavOutputPath = path.join(outputRoot, "direct-audio-output.wav");
const directM4aOutputPath = path.join(outputRoot, "direct-audio-output.m4a");
const directFlacOutputPath = path.join(outputRoot, "direct-audio-output.flac");
const aacM4aOutputPath = path.join(outputRoot, "aac-remux-output.m4a");
const aacWavOutputPath = path.join(outputRoot, "aac-convert-output.wav");
const aacFlacOutputPath = path.join(outputRoot, "aac-convert-output.flac");
const m4aOutputPath = path.join(outputRoot, "extract-output.m4a");
const mp4M4aOutputPath = path.join(outputRoot, "mp4-extract-output.m4a");
const movM4aOutputPath = path.join(outputRoot, "mov-extract-output.m4a");
const threeGpM4aOutputPath = path.join(outputRoot, "3gp-extract-output.m4a");
const mpegTsM4aOutputPath = path.join(outputRoot, "mpeg-ts-extract-output.m4a");
const flvM4aOutputPath = path.join(outputRoot, "flv-extract-output.m4a");
const wavOutputPath = path.join(outputRoot, "convert-output.wav");
const mp4WavOutputPath = path.join(outputRoot, "mp4-convert-output.wav");
const movWavOutputPath = path.join(outputRoot, "mov-convert-output.wav");
const threeGpWavOutputPath = path.join(outputRoot, "3gp-convert-output.wav");
const mpegTsWavOutputPath = path.join(outputRoot, "mpeg-ts-convert-output.wav");
const flvWavOutputPath = path.join(outputRoot, "flv-convert-output.wav");
const aviWavOutputPath = path.join(outputRoot, "avi-convert-output.wav");
const standaloneWavOutputPath = path.join(
  outputRoot,
  "standalone-convert-output.wav",
);
const mp3WavOutputPath = path.join(outputRoot, "mp3-convert-output.wav");
const flacWavOutputPath = path.join(outputRoot, "flac-convert-output.wav");
const m4aFlacOutputPath = path.join(outputRoot, "m4a-convert-output.flac");
const mkvFlacOutputPath = path.join(outputRoot, "mkv-extract-output.flac");
const mp4FlacOutputPath = path.join(outputRoot, "mp4-extract-output.flac");
const movFlacOutputPath = path.join(outputRoot, "mov-extract-output.flac");
const threeGpFlacOutputPath = path.join(outputRoot, "3gp-extract-output.flac");
const mpegTsFlacOutputPath = path.join(outputRoot, "mpeg-ts-extract-output.flac");
const flvFlacOutputPath = path.join(outputRoot, "flv-extract-output.flac");
const aviFlacOutputPath = path.join(outputRoot, "avi-extract-output.flac");
const ogvFlacOutputPath = path.join(outputRoot, "ogv-extract-output.flac");
const mp3FlacOutputPath = path.join(outputRoot, "mp3-convert-output.flac");
const wavFlacOutputPath = path.join(outputRoot, "wav-convert-output.flac");
const alacWavOutputPath = path.join(outputRoot, "alac-decode-output.wav");
const alacFlacOutputPath = path.join(outputRoot, "alac-decode-output.flac");
const wavAlacOutputPath = path.join(outputRoot, "wav-encode-output.m4a");
const flacAlacOutputPath = path.join(outputRoot, "flac-encode-output.m4a");
const wmaWavOutputPath = path.join(outputRoot, "wma-decode-output.wav");
const wmaFlacOutputPath = path.join(outputRoot, "wma-decode-output.flac");
const wavWmaOutputPath = path.join(outputRoot, "wav-encode-output.wma");
const flacWmaOutputPath = path.join(outputRoot, "flac-encode-output.wma");
const amrWavOutputPath = path.join(outputRoot, "amr-decode-output.wav");
const amrFlacOutputPath = path.join(outputRoot, "amr-decode-output.flac");
const aiffWavOutputPath = path.join(outputRoot, "aiff-convert-output.wav");
const oggWavOutputPath = path.join(outputRoot, "ogg-convert-output.wav");
const opusWavOutputPath = path.join(outputRoot, "opus-convert-output.wav");
const aiffFlacOutputPath = path.join(outputRoot, "aiff-convert-output.flac");
const oggFlacOutputPath = path.join(outputRoot, "ogg-convert-output.flac");
const opusFlacOutputPath = path.join(outputRoot, "opus-convert-output.flac");
const mpeg4OutputPath = path.join(outputRoot, "reencode-output.mp4");
const webmOutputPath = path.join(outputRoot, "reencode-output.webm");
const ogvWebmOutputPath = path.join(outputRoot, "ogv-reencode-output.webm");
const vp9WebmOutputPath = path.join(outputRoot, "vp9-reencode-output.webm");
const mp4WebmOutputPath = path.join(outputRoot, "mp4-vp8-output.webm");
const mp4Vp9WebmOutputPath = path.join(outputRoot, "mp4-vp9-output.webm");
const movWebmOutputPath = path.join(outputRoot, "mov-vp8-output.webm");
const movVp9WebmOutputPath = path.join(outputRoot, "mov-vp9-output.webm");
const threeGpWebmOutputPath = path.join(outputRoot, "3gp-vp8-output.webm");
const threeGpVp9WebmOutputPath = path.join(outputRoot, "3gp-vp9-output.webm");
const mpegTsWebmOutputPath = path.join(outputRoot, "mpeg-ts-vp8-output.webm");
const mpegTsVp9WebmOutputPath = path.join(outputRoot, "mpeg-ts-vp9-output.webm");
const flvWebmOutputPath = path.join(outputRoot, "flv-vp8-output.webm");
const flvVp9WebmOutputPath = path.join(outputRoot, "flv-vp9-output.webm");
const aviWebmOutputPath = path.join(outputRoot, "avi-vp8-output.webm");
const aviVp9WebmOutputPath = path.join(outputRoot, "avi-vp9-output.webm");
const ogvVp9WebmOutputPath = path.join(outputRoot, "ogv-vp9-reencode-output.webm");
const ogvWavOutputPath = path.join(outputRoot, "ogv-convert-output.wav");
const m2vMpeg4OutputPath = path.join(outputRoot, "m2v-reencode-output.mp4");
const m2vWebmOutputPath = path.join(outputRoot, "m2v-reencode-output.webm");
const m2vVp9WebmOutputPath = path.join(outputRoot, "m2v-vp9-reencode-output.webm");
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
const mp4InputFixturePath = path.join(
  projectRoot,
  "work",
  "remux-source.mp4",
);
const movInputFixturePath = path.join(
  projectRoot,
  "fixtures",
  "media",
  "quicktime-source.mov",
);
const threeGpInputFixturePath = path.join(
  projectRoot,
  "fixtures",
  "media",
  "mobile-video-source.3gp",
);
const mpegTsInputFixturePath = path.join(
  projectRoot,
  "fixtures",
  "media",
  "transport-source.mpegts",
);
const flvInputFixturePath = path.join(
  projectRoot,
  "fixtures",
  "media",
  "flash-video-source.flv",
);
const aviInputFixturePath = path.join(
  projectRoot,
  "fixtures",
  "media",
  "legacy-video-source.avi",
);
const audioFixturePath = path.join(
  projectRoot,
  "fixtures",
  "media",
  "audio-source.m4a",
);
const alacFixturePath = path.join(
  projectRoot,
  "fixtures",
  "media",
  "audio-source-alac.m4a",
);
const wmaFixturePath = path.join(
  projectRoot,
  "fixtures",
  "media",
  "audio-source.wma",
);
const amrFixturePath = path.join(
  projectRoot,
  "fixtures",
  "media",
  "audio-source.amr",
);
const aacFixturePath = path.join(
  projectRoot,
  "fixtures",
  "media",
  "audio-source.aac",
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
const ogvFixturePath = path.join(
  projectRoot,
  "fixtures",
  "media",
  "theora-video-source.ogv",
);
const m2vFixturePath = path.join(
  projectRoot,
  "fixtures",
  "media",
  "mpeg2-video-source.m2v",
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
  width?: number;
  height?: number;
  sample_rate?: string;
  channels?: number;
  bit_rate?: string;
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
  expectedDurationSeconds?: number;
  durationToleranceSeconds?: number;
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

async function decodedPcmSha256(inputPath: string): Promise<string> {
  const { stdout } = await execFileAsync(
    "ffmpeg",
    [
      "-hide_banner", "-loglevel", "error", "-i", inputPath,
      "-map", "0:a:0", "-c:a", "pcm_s16le", "-f", "hash",
      "-hash", "sha256", "-",
    ],
    { cwd: projectRoot, windowsHide: true, maxBuffer: 8 * 1024 * 1024 },
  );
  return stdout.trim().split("=")[1];
}

async function expectDecodedPcmMatch(
  sourcePath: string,
  outputPath: string,
): Promise<void> {
  expect(await decodedPcmSha256(outputPath)).toBe(
    await decodedPcmSha256(sourcePath),
  );
}

async function expectDecodedAudioPsnr(
  sourcePath: string,
  outputPath: string,
  minimumPsnrDb: number,
): Promise<void> {
  const { stderr } = await execFileAsync(
    "ffmpeg",
    [
      "-hide_banner", "-nostdin", "-i", sourcePath, "-i", outputPath,
      "-filter_complex",
      "[0:a:0]aresample=async=1:first_pts=0,aformat=sample_fmts=fltp[source];[1:a:0]aresample=async=1:first_pts=0,aformat=sample_fmts=fltp[converted];[source][converted]apsnr[quality]",
      "-map", "[quality]", "-f", "null", "NUL",
    ],
    { cwd: projectRoot, windowsHide: true, maxBuffer: 8 * 1024 * 1024 },
  );
  const psnrValues = [
    ...stderr.matchAll(
      /PSNR ch\d+:\s+(inf|[+-]?(?:\d+(?:\.\d+)?|\.\d+))\s+dB/gi,
    ),
  ].map((match) =>
    match[1].toLowerCase() === "inf"
      ? Number.POSITIVE_INFINITY
      : Number.parseFloat(match[1]),
  );
  expect(psnrValues.length).toBeGreaterThan(0);
  for (const value of psnrValues) expect(value).toBeGreaterThanOrEqual(minimumPsnrDb);
}

test.beforeAll(async () => {
  assertProjectLocal(profileRoot);
  assertProjectLocal(mp4OutputPath);
  assertProjectLocal(movMp4OutputPath);
  assertProjectLocal(threeGpMp4OutputPath);
  assertProjectLocal(mpegTsMp4OutputPath);
  assertProjectLocal(flvMp4OutputPath);
  assertProjectLocal(aviMp4OutputPath);
  assertProjectLocal(directMp4OutputPath);
  assertProjectLocal(aacM4aOutputPath);
  assertProjectLocal(aacWavOutputPath);
  assertProjectLocal(aacFlacOutputPath);
  assertProjectLocal(m4aOutputPath);
  assertProjectLocal(mp4M4aOutputPath);
  assertProjectLocal(movM4aOutputPath);
  assertProjectLocal(threeGpM4aOutputPath);
  assertProjectLocal(mpegTsM4aOutputPath);
  assertProjectLocal(flvM4aOutputPath);
  assertProjectLocal(wavOutputPath);
  assertProjectLocal(mp4WavOutputPath);
  assertProjectLocal(movWavOutputPath);
  assertProjectLocal(threeGpWavOutputPath);
  assertProjectLocal(mpegTsWavOutputPath);
  assertProjectLocal(flvWavOutputPath);
  assertProjectLocal(aviWavOutputPath);
  assertProjectLocal(standaloneWavOutputPath);
  assertProjectLocal(mp3WavOutputPath);
  assertProjectLocal(flacWavOutputPath);
  assertProjectLocal(m4aFlacOutputPath);
  assertProjectLocal(mkvFlacOutputPath);
  assertProjectLocal(mp4FlacOutputPath);
  assertProjectLocal(movFlacOutputPath);
  assertProjectLocal(threeGpFlacOutputPath);
  assertProjectLocal(mpegTsFlacOutputPath);
  assertProjectLocal(flvFlacOutputPath);
  assertProjectLocal(aviFlacOutputPath);
  assertProjectLocal(ogvFlacOutputPath);
  assertProjectLocal(mp3FlacOutputPath);
  assertProjectLocal(wavFlacOutputPath);
  assertProjectLocal(alacWavOutputPath);
  assertProjectLocal(alacFlacOutputPath);
  assertProjectLocal(wavAlacOutputPath);
  assertProjectLocal(flacAlacOutputPath);
  assertProjectLocal(wmaWavOutputPath);
  assertProjectLocal(wmaFlacOutputPath);
  assertProjectLocal(wavWmaOutputPath);
  assertProjectLocal(flacWmaOutputPath);
  assertProjectLocal(amrWavOutputPath);
  assertProjectLocal(amrFlacOutputPath);
  assertProjectLocal(aiffWavOutputPath);
  assertProjectLocal(oggWavOutputPath);
  assertProjectLocal(opusWavOutputPath);
  assertProjectLocal(aiffFlacOutputPath);
  assertProjectLocal(oggFlacOutputPath);
  assertProjectLocal(opusFlacOutputPath);
  assertProjectLocal(mpeg4OutputPath);
  assertProjectLocal(webmOutputPath);
  assertProjectLocal(ogvWebmOutputPath);
  assertProjectLocal(vp9WebmOutputPath);
  assertProjectLocal(mp4WebmOutputPath);
  assertProjectLocal(mp4Vp9WebmOutputPath);
  assertProjectLocal(movWebmOutputPath);
  assertProjectLocal(movVp9WebmOutputPath);
  assertProjectLocal(aviWebmOutputPath);
  assertProjectLocal(aviVp9WebmOutputPath);
  assertProjectLocal(ogvVp9WebmOutputPath);
  assertProjectLocal(ogvWavOutputPath);
  assertProjectLocal(m2vMpeg4OutputPath);
  assertProjectLocal(m2vWebmOutputPath);
  assertProjectLocal(m2vVp9WebmOutputPath);
  assertProjectLocal(complexMp4OutputPath);
  assertProjectLocal(corruptFixturePath);
  assertProjectLocal(incompatibleFixturePath);
  assertProjectLocal(mp4InputFixturePath);
  await rm(profileRoot, { recursive: true, force: true });
  await rm(corruptFixturePath, { force: true });
  await rm(incompatibleFixturePath, { force: true });
  await rm(mp4InputFixturePath, { force: true });
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
  await execFileAsync(
    "ffmpeg",
    [
      "-hide_banner",
      "-loglevel",
      "error",
      "-nostdin",
      "-y",
      "-i",
      fixturePath,
      "-map",
      "0:v:0",
      "-map",
      "0:a:0",
      "-c",
      "copy",
      "-map_metadata",
      "0",
      "-movflags",
      "+faststart",
      mp4InputFixturePath,
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
  await rm(movMp4OutputPath, { force: true });
  await rm(threeGpMp4OutputPath, { force: true });
  await rm(mpegTsMp4OutputPath, { force: true });
  await rm(flvMp4OutputPath, { force: true });
  await rm(aviMp4OutputPath, { force: true });
  await rm(directMp4OutputPath, { force: true });
  await rm(directWavOutputPath, { force: true });
  await rm(directM4aOutputPath, { force: true });
  await rm(directFlacOutputPath, { force: true });
  await rm(aacM4aOutputPath, { force: true });
  await rm(aacWavOutputPath, { force: true });
  await rm(aacFlacOutputPath, { force: true });
  await rm(m4aOutputPath, { force: true });
  await rm(mp4M4aOutputPath, { force: true });
  await rm(movM4aOutputPath, { force: true });
  await rm(threeGpM4aOutputPath, { force: true });
  await rm(mpegTsM4aOutputPath, { force: true });
  await rm(flvM4aOutputPath, { force: true });
  await rm(wavOutputPath, { force: true });
  await rm(mp4WavOutputPath, { force: true });
  await rm(movWavOutputPath, { force: true });
  await rm(threeGpWavOutputPath, { force: true });
  await rm(mpegTsWavOutputPath, { force: true });
  await rm(flvWavOutputPath, { force: true });
  await rm(aviWavOutputPath, { force: true });
  await rm(standaloneWavOutputPath, { force: true });
  await rm(mp3WavOutputPath, { force: true });
  await rm(flacWavOutputPath, { force: true });
  await rm(m4aFlacOutputPath, { force: true });
  await rm(mkvFlacOutputPath, { force: true });
  await rm(mp4FlacOutputPath, { force: true });
  await rm(movFlacOutputPath, { force: true });
  await rm(threeGpFlacOutputPath, { force: true });
  await rm(mpegTsFlacOutputPath, { force: true });
  await rm(flvFlacOutputPath, { force: true });
  await rm(aviFlacOutputPath, { force: true });
  await rm(ogvFlacOutputPath, { force: true });
  await rm(mp3FlacOutputPath, { force: true });
  await rm(wavFlacOutputPath, { force: true });
  await rm(alacWavOutputPath, { force: true });
  await rm(alacFlacOutputPath, { force: true });
  await rm(wavAlacOutputPath, { force: true });
  await rm(flacAlacOutputPath, { force: true });
  await rm(wmaWavOutputPath, { force: true });
  await rm(wmaFlacOutputPath, { force: true });
  await rm(wavWmaOutputPath, { force: true });
  await rm(flacWmaOutputPath, { force: true });
  await rm(amrWavOutputPath, { force: true });
  await rm(amrFlacOutputPath, { force: true });
  await rm(aiffWavOutputPath, { force: true });
  await rm(oggWavOutputPath, { force: true });
  await rm(opusWavOutputPath, { force: true });
  await rm(aiffFlacOutputPath, { force: true });
  await rm(oggFlacOutputPath, { force: true });
  await rm(opusFlacOutputPath, { force: true });
  await rm(mpeg4OutputPath, { force: true });
  await rm(webmOutputPath, { force: true });
  await rm(ogvWebmOutputPath, { force: true });
  await rm(vp9WebmOutputPath, { force: true });
  await rm(mp4WebmOutputPath, { force: true });
  await rm(mp4Vp9WebmOutputPath, { force: true });
  await rm(movWebmOutputPath, { force: true });
  await rm(movVp9WebmOutputPath, { force: true });
  await rm(threeGpWebmOutputPath, { force: true });
  await rm(threeGpVp9WebmOutputPath, { force: true });
  await rm(mpegTsWebmOutputPath, { force: true });
  await rm(mpegTsVp9WebmOutputPath, { force: true });
  await rm(flvWebmOutputPath, { force: true });
  await rm(flvVp9WebmOutputPath, { force: true });
  await rm(aviWebmOutputPath, { force: true });
  await rm(aviVp9WebmOutputPath, { force: true });
  await rm(ogvVp9WebmOutputPath, { force: true });
  await rm(ogvWavOutputPath, { force: true });
  await rm(m2vMpeg4OutputPath, { force: true });
  await rm(m2vWebmOutputPath, { force: true });
  await rm(m2vVp9WebmOutputPath, { force: true });
  await rm(complexMp4OutputPath, { force: true });
  await rm(corruptFixturePath, { force: true });
  await rm(incompatibleFixturePath, { force: true });
  await rm(mp4InputFixturePath, { force: true });
  await rm(profileRoot, { recursive: true, force: true });
});

async function removeBrowserStorageEntry(name: string): Promise<void> {
  await page.evaluate(async (entryName) => {
    const root = await navigator.storage.getDirectory();
    await root.removeEntry(entryName).catch((error) => {
      if (!(error instanceof DOMException) || error.name !== "NotFoundError") {
        throw error;
      }
    });
  }, name);
}

async function copyAndDeleteBrowserStorageEntry(
  name: string,
  outputPath: string,
): Promise<void> {
  const sink = createWriteStream(outputPath, { flags: "w" });
  validationSink = sink;
  try {
    await page.evaluate(async (entryName) => {
      const root = await navigator.storage.getDirectory();
      try {
        const handle = await root.getFileHandle(entryName);
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
      } finally {
        await root.removeEntry(entryName).catch(() => {});
      }
    }, name);
    sink.end();
    await once(sink, "finish");
  } catch (error) {
    sink.destroy();
    throw error;
  } finally {
    if (validationSink === sink) validationSink = null;
  }
}

async function runMediaRoute(
  profileId:
    | "mkv-to-mp4"
    | "mov-to-mp4"
    | "3gp-to-mp4"
    | "mpeg-ts-to-mp4"
    | "flv-to-mp4"
    | "avi-to-mp4"
    | "mkv-to-m4a"
    | "mov-to-m4a"
    | "3gp-to-m4a"
    | "mpeg-ts-to-m4a"
    | "flv-to-m4a"
    | "mp4-to-m4a"
    | "aac-to-m4a"
    | "mkv-to-wav"
    | "mov-to-wav"
    | "3gp-to-wav"
    | "mpeg-ts-to-wav"
    | "flv-to-wav"
    | "avi-to-wav"
    | "mp4-to-wav"
    | "m4a-to-wav"
    | "aac-to-wav"
    | "mp3-to-wav"
    | "flac-to-wav"
    | "m4a-to-flac"
    | "mkv-to-flac"
    | "mp4-to-flac"
    | "mov-to-flac"
    | "3gp-to-flac"
    | "mpeg-ts-to-flac"
    | "flv-to-flac"
    | "avi-to-flac"
    | "ogv-to-flac"
    | "aac-to-flac"
    | "mp3-to-flac"
    | "wav-to-flac"
    | "wav-to-alac"
    | "flac-to-alac"
    | "wma-to-wav"
    | "wma-to-flac"
    | "wav-to-wma"
    | "flac-to-wma"
    | "amr-to-wav"
    | "amr-to-flac"
    | "aiff-to-wav"
    | "ogg-to-wav"
    | "opus-to-wav"
    | "aiff-to-flac"
    | "ogg-to-flac"
    | "opus-to-flac"
    | "mkv-to-webm"
    | "mp4-to-webm"
    | "mov-to-webm"
    | "3gp-to-webm"
    | "mpeg-ts-to-webm"
    | "flv-to-webm"
    | "avi-to-webm"
    | "ogv-to-webm"
    | "ogv-to-wav"
    | "m2v-to-mp4-mpeg4"
    | "m2v-to-webm"
    | "mkv-to-webm-vp9"
    | "mp4-to-webm-vp9"
    | "mov-to-webm-vp9"
    | "3gp-to-webm-vp9"
    | "mpeg-ts-to-webm-vp9"
    | "flv-to-webm-vp9"
    | "avi-to-webm-vp9"
    | "ogv-to-webm-vp9"
    | "m2v-to-webm-vp9"
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
    } else if (
      profileId === "mkv-to-mp4" ||
      profileId === "mov-to-mp4" ||
      profileId === "3gp-to-mp4" ||
      profileId === "mpeg-ts-to-mp4" ||
      profileId === "flv-to-mp4" ||
      profileId === "avi-to-mp4"
    ) {
      expect(state.warnings).toEqual([]);
    } else if (
      profileId === "mkv-to-m4a" ||
      profileId === "mov-to-m4a" ||
      profileId === "3gp-to-m4a" ||
      profileId === "mp4-to-m4a" ||
      profileId === "mkv-to-wav" ||
      profileId === "mov-to-wav" ||
      profileId === "3gp-to-wav" ||
      profileId === "mp4-to-wav"
    ) {
      expect(state.warnings.some((warning) => warning.includes("video stream"))).toBe(
        true,
      );
    } else if (
      profileId === "m4a-to-wav" ||
      profileId === "aac-to-m4a" ||
      profileId === "aac-to-wav" ||
      profileId === "mp3-to-wav" ||
      profileId === "flac-to-wav" ||
      profileId === "m4a-to-flac" ||
      profileId === "aac-to-flac" ||
      profileId === "mp3-to-flac" ||
      profileId === "wav-to-flac" ||
      profileId === "wav-to-alac" ||
      profileId === "flac-to-alac" ||
      profileId === "wma-to-wav" ||
      profileId === "wma-to-flac" ||
      profileId === "wav-to-wma" ||
      profileId === "flac-to-wma" ||
      profileId === "amr-to-wav" ||
      profileId === "amr-to-flac" ||
      profileId === "aiff-to-wav" ||
      profileId === "ogg-to-wav" ||
      profileId === "opus-to-wav" ||
      profileId === "aiff-to-flac" ||
      profileId === "ogg-to-flac" ||
      profileId === "opus-to-flac"
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
    if (
      profileId === "mkv-to-webm" ||
      profileId === "mp4-to-webm" ||
      profileId === "mov-to-webm" ||
      profileId === "3gp-to-webm" ||
      profileId === "mpeg-ts-to-webm" ||
      profileId === "flv-to-webm" ||
      profileId === "avi-to-webm" ||
      profileId === "ogv-to-webm" ||
      profileId === "m2v-to-webm"
    ) {
      expect(state.metrics?.activeWorkerCount).toBe(9);
    } else if (
      profileId === "mkv-to-webm-vp9" ||
      profileId === "mp4-to-webm-vp9" ||
      profileId === "mov-to-webm-vp9" ||
      profileId === "3gp-to-webm-vp9" ||
      profileId === "mpeg-ts-to-webm-vp9" ||
      profileId === "flv-to-webm-vp9" ||
      profileId === "avi-to-webm-vp9" ||
      profileId === "ogv-to-webm-vp9" ||
      profileId === "m2v-to-webm-vp9"
    ) {
      expect(state.metrics?.activeWorkerCount).toBe(9);
    } else if (
      profileId === "mkv-to-mp4-mpeg4" ||
      profileId === "m2v-to-mp4-mpeg4"
    ) {
      expect(state.metrics?.activeWorkerCount).toBe(5);
    }

    await copyAndDeleteBrowserStorageEntry(state.opfsName!, outputPath);

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
    const outputDuration = Number(probe.format.duration);
    if (options.expectedDurationSeconds == null) {
      expect(outputDuration).toBeGreaterThan(3.9);
      expect(outputDuration).toBeLessThan(4.2);
    } else {
      expect(
        Math.abs(outputDuration - options.expectedDurationSeconds),
      ).toBeLessThanOrEqual(options.durationToleranceSeconds ?? 0.1);
    }
    await options.validate?.(probe, outputPath);
  } finally {
    validationSink?.destroy();
    validationSink = null;
    await rm(outputPath, { force: true });
  }
}

async function validateMpeg2VideoOutput(
  probe: MediaProbe,
  outputPath: string,
): Promise<void> {
  const video = probe.streams.find((stream) => stream.codec_type === "video");
  expect(video?.width).toBe(640);
  expect(video?.height).toBe(360);
  expect(probe.streams).toHaveLength(1);
  expect(probe.chapters ?? []).toEqual([]);

  const { stderr } = await execFileAsync(
    "ffmpeg",
    [
      "-hide_banner", "-nostdin",
      "-ss", "2", "-i", m2vFixturePath,
      "-ss", "2", "-i", outputPath,
      "-filter_complex",
      "[0:v:0]format=yuv420p,setpts=PTS-STARTPTS[source];[1:v:0]format=yuv420p,setpts=PTS-STARTPTS[converted];[source][converted]ssim[quality]",
      "-map", "[quality]", "-frames:v", "1", "-f", "null", "NUL",
    ],
    { cwd: projectRoot, windowsHide: true, maxBuffer: 8 * 1024 * 1024 },
  );
  const similarity = Number.parseFloat(
    stderr.match(/SSIM[^\r\n]*All:([0-9.]+)/)?.[1] ?? "",
  );
  expect(similarity).toBeGreaterThan(0.35);
}

async function validateContainerWebmOutput(
  probe: MediaProbe,
  outputPath: string,
): Promise<void> {
  const video = probe.streams.find((stream) => stream.codec_type === "video");
  expect(video?.width).toBe(640);
  expect(video?.height).toBe(360);
  expect(probe.streams).toHaveLength(1);
  expect(probe.chapters ?? []).toEqual([]);
  await execFileAsync(
    "ffmpeg",
    ["-v", "error", "-i", outputPath, "-map", "0:v:0", "-f", "null", "NUL"],
    { cwd: projectRoot, windowsHide: true, maxBuffer: 8 * 1024 * 1024 },
  );
}

async function runSmallDirectAudioRoute(
  profileId: "mkv-to-m4a" | "mp3-to-flac",
  inputPath: string,
  outputName: string,
  outputPath: string,
  expectedCodec: "aac" | "flac",
  minimumBytes: number,
): Promise<void> {
  try {
    await page.goto("/?test=1&directory=1");
    await page.waitForFunction(
      () => window.__WITHIN_TEST__?.getState().workerStatus === "ready",
    );
    await removeBrowserStorageEntry(outputName);
    await page.locator('[data-testid="file-input"]').setInputFiles(inputPath);
    await page.locator('[data-testid="format-select"]').selectOption(profileId);
    await page.locator('[data-testid="convert-button"]').click();
    await expect
      .poll(async () => (await currentState()).jobState, { timeout: 60_000 })
      .not.toBe("running");

    const state = await currentState();
    expect(state.jobState, state.error ?? state.phase).toBe("complete");
    expect(state.opfsName).toBeNull();
    expect(state.batchOutputNames).toEqual([outputName]);
    expect(state.metrics?.maxReadChunkBytes).toBeLessThanOrEqual(256 * 1024);
    expect(state.metrics?.maxWriteChunkBytes).toBeGreaterThan(0);
    expect(state.metrics?.maxWriteChunkBytes).toBeLessThanOrEqual(256 * 1024);
    expect(state.metrics?.peakQueuedBytes).toBeLessThanOrEqual(256 * 1024);
    expect(state.metrics?.peakPendingOperations).toBeLessThanOrEqual(1);
    expect(state.metrics?.pendingOperations).toBe(0);
    expect(state.metrics?.queuedBytes).toBe(0);
    expect(state.metrics?.activeWorkerCount).toBe(2);

    await copyAndDeleteBrowserStorageEntry(outputName, outputPath);
    expect((await stat(outputPath)).size).toBeGreaterThan(minimumBytes);
    const { stdout } = await execFileAsync(
      "ffprobe",
      [
        "-v",
        "error",
        "-show_entries",
        "stream=codec_name:format=duration",
        "-of",
        "json",
        outputPath,
      ],
      { cwd: projectRoot, windowsHide: true, maxBuffer: 8 * 1024 * 1024 },
    );
    const probe = JSON.parse(stdout) as MediaProbe;
    expect(probe.streams.map((stream) => stream.codec_name)).toEqual([
      expectedCodec,
    ]);
    expect(Number(probe.format.duration)).toBeGreaterThan(3.9);
    expect(Number(probe.format.duration)).toBeLessThan(4.2);
    await execFileAsync(
      "ffmpeg",
      [
        "-hide_banner",
        "-loglevel",
        "error",
        "-i",
        outputPath,
        "-f",
        "null",
        "-",
      ],
      { cwd: projectRoot, windowsHide: true, maxBuffer: 8 * 1024 * 1024 },
    );
  } finally {
    validationSink?.destroy();
    validationSink = null;
    await removeBrowserStorageEntry(outputName).catch(() => {});
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

test("browser FFmpeg AVIO remuxes genuine QuickTime MOV to valid MP4", async () => {
  await runMediaRoute(
    "mov-to-mp4",
    movMp4OutputPath,
    ["h264", "aac"],
    500_000,
    movInputFixturePath,
  );
});

test("browser FFmpeg AVIO remuxes H.264/AAC 3GP to valid MP4", async () => {
  await runMediaRoute(
    "3gp-to-mp4",
    threeGpMp4OutputPath,
    ["h264", "aac"],
    500_000,
    threeGpInputFixturePath,
  );
});

test("browser FFmpeg AVIO remuxes MPEG transport stream to valid MP4", async () => {
  await runMediaRoute(
    "mpeg-ts-to-mp4",
    mpegTsMp4OutputPath,
    ["h264", "aac"],
    500_000,
    mpegTsInputFixturePath,
  );
});

test("browser FFmpeg AVIO remuxes Flash Video to valid MP4", async () => {
  await runMediaRoute(
    "flv-to-mp4",
    flvMp4OutputPath,
    ["h264", "aac"],
    500_000,
    flvInputFixturePath,
  );
});

test("browser FFmpeg AVIO remuxes MPEG-4 Part 2/MP3 AVI to valid MP4", async () => {
  await runMediaRoute(
    "avi-to-mp4",
    aviMp4OutputPath,
    ["mpeg4", "mp3"],
    500_000,
    aviInputFixturePath,
  );
});

test("browser FFmpeg AVIO writes a valid MP4 through the asynchronous direct-save adapter", async () => {
  const outputName = "remux-source.mp4";
  try {
    await page.goto("/?test=1&directory=1");
    await page.waitForFunction(
      () => window.__WITHIN_TEST__?.getState().workerStatus === "ready",
    );
    await removeBrowserStorageEntry(outputName);
    await page.locator('[data-testid="file-input"]').setInputFiles(fixturePath);
    await page
      .locator('[data-testid="format-select"]')
      .selectOption("mkv-to-mp4");
    await page.locator('[data-testid="convert-button"]').click();
    await expect
      .poll(async () => (await currentState()).jobState, { timeout: 15_000 })
      .not.toBe("idle");
    await expect
      .poll(async () => (await currentState()).jobState, { timeout: 60_000 })
      .not.toBe("running");

    const state = await currentState();
    expect(state.jobState, state.error ?? state.phase).toBe("complete");
    expect(state.opfsName).toBeNull();
    expect(state.batchOutputNames).toEqual([outputName]);
    expect(state.metrics?.maxReadChunkBytes).toBeLessThanOrEqual(256 * 1024);
    expect(state.metrics?.maxWriteChunkBytes).toBeLessThanOrEqual(1024 * 1024);
    expect(state.metrics?.peakQueuedBytes).toBeLessThanOrEqual(1024 * 1024);
    expect(state.metrics?.peakPendingOperations).toBeLessThanOrEqual(1);
    expect(state.metrics?.pendingOperations).toBe(0);
    expect(state.metrics?.queuedBytes).toBe(0);
    expect(state.metrics?.activeWorkerCount).toBe(2);
    expect(state.metrics?.sharedArrayBufferBytes).toBeGreaterThan(
      state.metrics?.peakWasmMemoryBytes ?? 0,
    );
    expect(
      (state.metrics?.sharedArrayBufferBytes ?? 0) -
        (state.metrics?.peakWasmMemoryBytes ?? 0),
    ).toBeLessThanOrEqual(1030 * 1024);

    await copyAndDeleteBrowserStorageEntry(outputName, directMp4OutputPath);
    const { size } = await stat(directMp4OutputPath);
    expect(size).toBeGreaterThan(250_000);
    const { stdout } = await execFileAsync(
      "ffprobe",
      [
        "-v",
        "error",
        "-show_entries",
        "stream=codec_name:format=duration",
        "-of",
        "json",
        directMp4OutputPath,
      ],
      { cwd: projectRoot, windowsHide: true, maxBuffer: 8 * 1024 * 1024 },
    );
    const probe = JSON.parse(stdout) as MediaProbe;
    expect(probe.streams.map((stream) => stream.codec_name)).toEqual([
      "h264",
      "aac",
    ]);
    expect(Number(probe.format.duration)).toBeGreaterThan(3.9);
    expect(Number(probe.format.duration)).toBeLessThan(4.2);
    await execFileAsync(
      "ffmpeg",
      [
        "-hide_banner",
        "-loglevel",
        "error",
        "-i",
        directMp4OutputPath,
        "-map",
        "0:v:0",
        "-map",
        "0:a:0",
        "-f",
        "null",
        "-",
      ],
      { cwd: projectRoot, windowsHide: true, maxBuffer: 8 * 1024 * 1024 },
    );
  } finally {
    validationSink?.destroy();
    validationSink = null;
    await removeBrowserStorageEntry(outputName).catch(() => {});
    await rm(directMp4OutputPath, { force: true });
  }
});

test("browser FFmpeg coalesces PCM packets for a bounded direct WAV save", async () => {
  const outputName = "audio-source.wav";
  try {
    await page.goto("/?test=1&directory=1");
    await page.waitForFunction(
      () => window.__WITHIN_TEST__?.getState().workerStatus === "ready",
    );
    await removeBrowserStorageEntry(outputName);
    await page.locator('[data-testid="file-input"]').setInputFiles(mp3FixturePath);
    await page
      .locator('[data-testid="format-select"]')
      .selectOption("mp3-to-wav");
    await page.locator('[data-testid="convert-button"]').click();
    await expect
      .poll(async () => (await currentState()).jobState, { timeout: 60_000 })
      .not.toBe("running");

    const state = await currentState();
    expect(state.jobState, state.error ?? state.phase).toBe("complete");
    expect(state.opfsName).toBeNull();
    expect(state.batchOutputNames).toEqual([outputName]);
    expect(state.metrics?.maxReadChunkBytes).toBeLessThanOrEqual(256 * 1024);
    expect(state.metrics?.maxWriteChunkBytes).toBeGreaterThan(128 * 1024);
    expect(state.metrics?.maxWriteChunkBytes).toBeLessThanOrEqual(256 * 1024);
    expect(state.metrics?.peakQueuedBytes).toBeLessThanOrEqual(256 * 1024);
    expect(state.metrics?.peakPendingOperations).toBeLessThanOrEqual(1);
    expect(state.metrics?.pendingOperations).toBe(0);
    expect(state.metrics?.queuedBytes).toBe(0);
    expect(state.metrics?.activeWorkerCount).toBe(2);

    await copyAndDeleteBrowserStorageEntry(outputName, directWavOutputPath);
    const { size } = await stat(directWavOutputPath);
    expect(size).toBeGreaterThan(300_000);
    const { stdout } = await execFileAsync(
      "ffprobe",
      [
        "-v",
        "error",
        "-show_entries",
        "stream=codec_name:format=duration",
        "-of",
        "json",
        directWavOutputPath,
      ],
      { cwd: projectRoot, windowsHide: true, maxBuffer: 8 * 1024 * 1024 },
    );
    const probe = JSON.parse(stdout) as MediaProbe;
    expect(probe.streams.map((stream) => stream.codec_name)).toEqual([
      "pcm_s16le",
    ]);
    expect(Number(probe.format.duration)).toBeGreaterThan(3.9);
    expect(Number(probe.format.duration)).toBeLessThan(4.2);
    await execFileAsync(
      "ffmpeg",
      [
        "-hide_banner",
        "-loglevel",
        "error",
        "-i",
        directWavOutputPath,
        "-f",
        "null",
        "-",
      ],
      { cwd: projectRoot, windowsHide: true, maxBuffer: 8 * 1024 * 1024 },
    );
  } finally {
    validationSink?.destroy();
    validationSink = null;
    await removeBrowserStorageEntry(outputName).catch(() => {});
    await rm(directWavOutputPath, { force: true });
  }
});

test("browser FFmpeg flushes a bounded direct M4A save correctly", async () => {
  await runSmallDirectAudioRoute(
    "mkv-to-m4a",
    fixturePath,
    "remux-source.m4a",
    directM4aOutputPath,
    "aac",
    20_000,
  );
});

test("browser FFmpeg flushes a bounded direct FLAC save correctly", async () => {
  await runSmallDirectAudioRoute(
    "mp3-to-flac",
    mp3FixturePath,
    "audio-source.flac",
    directFlacOutputPath,
    "flac",
    20_000,
  );
});

test("direct WAV coalescing propagates write failure and releases the partial file", async () => {
  const outputName = "audio-source.wav";
  try {
    await page.goto("/?test=1&directory=1&fault=write");
    await page.waitForFunction(
      () => window.__WITHIN_TEST__?.getState().workerStatus === "ready",
    );
    await removeBrowserStorageEntry(outputName);
    await page.locator('[data-testid="file-input"]').setInputFiles(mp3FixturePath);
    await page
      .locator('[data-testid="format-select"]')
      .selectOption("mp3-to-wav");
    await page.locator('[data-testid="convert-button"]').click();
    await expect
      .poll(async () => (await currentState()).jobState, { timeout: 30_000 })
      .toBe("error");

    const state = await currentState();
    expect(state.error?.toLowerCase()).toContain(
      "destination rejected a bounded write",
    );
    expect(state.opfsName).toBeNull();
    expect(state.batchOutputNames).toEqual([outputName]);
    expect(state.metrics?.pendingOperations).toBe(0);
    expect(state.metrics?.queuedBytes).toBe(0);
    expect(state.metrics?.peakPendingOperations).toBeLessThanOrEqual(1);
    expect(state.metrics?.maxWriteChunkBytes).toBeLessThanOrEqual(256 * 1024);
    const abandonedSize = await page.evaluate(async (entryName) => {
      const root = await navigator.storage.getDirectory();
      try {
        const handle = await root.getFileHandle(entryName);
        const size = (await handle.getFile()).size;
        await root.removeEntry(entryName);
        return size;
      } catch (error) {
        if (error instanceof DOMException && error.name === "NotFoundError") {
          return null;
        }
        throw error;
      }
    }, outputName);
    expect(abandonedSize === null || abandonedSize === 0).toBe(true);
  } finally {
    await removeBrowserStorageEntry(outputName).catch(() => {});
  }
});

for (const route of [
  ["m2v-to-webm-vp9", m2vFixturePath],
  ["mp4-to-webm", mp4InputFixturePath],
  ["mp4-to-webm-vp9", mp4InputFixturePath],
  ["mov-to-webm", movInputFixturePath],
  ["mov-to-webm-vp9", movInputFixturePath],
  ["3gp-to-webm", threeGpInputFixturePath],
  ["3gp-to-webm-vp9", threeGpInputFixturePath],
  ["mpeg-ts-to-webm", mpegTsInputFixturePath],
  ["mpeg-ts-to-webm-vp9", mpegTsInputFixturePath],
  ["flv-to-webm", flvInputFixturePath],
  ["flv-to-webm-vp9", flvInputFixturePath],
  ["avi-to-webm", aviInputFixturePath],
  ["avi-to-webm-vp9", aviInputFixturePath],
  ["mkv-to-flac", fixturePath],
  ["mp4-to-flac", mp4InputFixturePath],
  ["mov-to-flac", movInputFixturePath],
  ["3gp-to-flac", threeGpInputFixturePath],
  ["mpeg-ts-to-flac", mpegTsInputFixturePath],
  ["flv-to-flac", flvInputFixturePath],
  ["avi-to-flac", aviInputFixturePath],
  ["ogv-to-flac", ogvFixturePath],
] as const) {
  test(`${route[0]} propagates a destination failure and removes partial output`, async () => {
    await page.goto("/?test=1&fault=write");
    await page.waitForFunction(
      () => window.__WITHIN_TEST__?.getState().workerStatus === "ready",
    );
    await page.locator('[data-testid="file-input"]').setInputFiles(route[1]);
    await page.locator('[data-testid="format-select"]').selectOption(route[0]);
    await page.locator('[data-testid="convert-button"]').click();
    await expect
      .poll(async () => (await currentState()).jobState, { timeout: 30_000 })
      .toBe("error");
    const state = await currentState();
    expect(state.error?.toLowerCase()).toContain(
      "destination rejected a bounded write",
    );
    expect(state.opfsName).toBeNull();
    expect(state.metrics?.pendingOperations).toBe(0);
    expect(state.metrics?.queuedBytes).toBe(0);
    const leftovers = await page.evaluate(async (profileId) => {
      const root = await navigator.storage.getDirectory();
      const names: string[] = [];
      for await (const [name] of root.entries()) {
        if (name.startsWith(`within-test-${profileId}`)) names.push(name);
      }
      return names;
    }, route[0]);
    expect(leftovers).toEqual([]);
  });
}

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

for (const route of [
  {
    profileId: "mkv-to-mp4",
    title: "MP4",
    expectedError: "Lossless MP4 stream copy accepts AAC audio",
  },
  {
    profileId: "mkv-to-m4a",
    title: "M4A",
    expectedError: "Lossless M4A stream copy accepts AAC audio",
  },
] as const) {
  test(`browser planner rejects a codec combination that ${route.title} cannot stream-copy`, async () => {
    await page.goto("/?test=1");
    await page.waitForFunction(
      () => window.__WITHIN_TEST__?.getState().workerStatus === "ready",
    );
    await page
      .locator('[data-testid="file-input"]')
      .setInputFiles(incompatibleFixturePath);
    await page
      .locator('[data-testid="format-select"]')
      .selectOption(route.profileId);
    await page.locator('[data-testid="convert-button"]').click();
    await expect
      .poll(async () => (await currentState()).jobState, { timeout: 30_000 })
      .toBe("error");
    const failed = await currentState();
    expect(failed.error).toContain(route.expectedError);
    expect(failed.opfsName).toBeNull();
    const leftovers = await page.evaluate(async (profileId) => {
      const root = await navigator.storage.getDirectory();
      const names: string[] = [];
      for await (const [name] of root.entries()) {
        if (name.startsWith(`within-test-${profileId}`)) names.push(name);
      }
      return names;
    }, route.profileId);
    expect(leftovers).toEqual([]);
    await expect
      .poll(async () => (await currentState()).workerStatus, {
        timeout: 15_000,
      })
      .toBe("ready");
  });
}

test("browser FFmpeg AVIO extracts MKV audio to valid M4A with bounded I/O", async () => {
  await runMediaRoute("mkv-to-m4a", m4aOutputPath, ["aac"], 20_000);
});

test("browser FFmpeg AVIO extracts MP4 audio to valid M4A with bounded I/O", async () => {
  await runMediaRoute(
    "mp4-to-m4a",
    mp4M4aOutputPath,
    ["aac"],
    20_000,
    mp4InputFixturePath,
  );
});

test("browser FFmpeg losslessly remuxes raw AAC into bounded M4A", async () => {
  await runMediaRoute(
    "aac-to-m4a",
    aacM4aOutputPath,
    ["aac"],
    20_000,
    aacFixturePath,
    {
      expectedWarningFragments: [],
      validate: async (_probe, outputPath) => {
        await execFileAsync(
          "ffmpeg",
          ["-v", "error", "-i", outputPath, "-map", "0:a:0", "-f", "null", "NUL"],
          { cwd: projectRoot, windowsHide: true, maxBuffer: 8 * 1024 * 1024 },
        );
      },
    },
  );
});

test("browser FFmpeg AVIO extracts QuickTime MOV audio to valid M4A", async () => {
  await runMediaRoute(
    "mov-to-m4a",
    movM4aOutputPath,
    ["aac"],
    20_000,
    movInputFixturePath,
  );
});

test("browser FFmpeg AVIO extracts 3GP audio to valid M4A", async () => {
  await runMediaRoute(
    "3gp-to-m4a",
    threeGpM4aOutputPath,
    ["aac"],
    20_000,
    threeGpInputFixturePath,
    { expectedWarningFragments: ["video stream"] },
  );
});

test("browser FFmpeg AVIO extracts MPEG-TS audio to valid M4A", async () => {
  await runMediaRoute(
    "mpeg-ts-to-m4a",
    mpegTsM4aOutputPath,
    ["aac"],
    20_000,
    mpegTsInputFixturePath,
    { expectedWarningFragments: ["video stream"] },
  );
});

test("browser FFmpeg AVIO extracts Flash Video audio to valid M4A", async () => {
  await runMediaRoute(
    "flv-to-m4a",
    flvM4aOutputPath,
    ["aac"],
    20_000,
    flvInputFixturePath,
    { expectedWarningFragments: ["video stream"] },
  );
});

test("browser FFmpeg decodes AAC and encodes bounded PCM WAV", async () => {
  await runMediaRoute(
    "mkv-to-wav",
    wavOutputPath,
    ["pcm_s16le"],
    300_000,
  );
});

test("browser FFmpeg extracts MP4 audio and encodes bounded PCM WAV", async () => {
  await runMediaRoute(
    "mp4-to-wav",
    mp4WavOutputPath,
    ["pcm_s16le"],
    300_000,
    mp4InputFixturePath,
  );
});

test("browser FFmpeg decodes QuickTime MOV audio to bounded PCM WAV", async () => {
  await runMediaRoute(
    "mov-to-wav",
    movWavOutputPath,
    ["pcm_s16le"],
    300_000,
    movInputFixturePath,
  );
});

test("browser FFmpeg decodes 3GP AAC audio to bounded PCM WAV", async () => {
  await runMediaRoute(
    "3gp-to-wav",
    threeGpWavOutputPath,
    ["pcm_s16le"],
    300_000,
    threeGpInputFixturePath,
    { expectedWarningFragments: ["video stream"] },
  );
});

test("browser FFmpeg decodes MPEG-TS audio to bounded PCM WAV", async () => {
  await runMediaRoute(
    "mpeg-ts-to-wav",
    mpegTsWavOutputPath,
    ["pcm_s16le"],
    300_000,
    mpegTsInputFixturePath,
    { expectedWarningFragments: ["video stream"] },
  );
});

test("browser FFmpeg decodes Flash Video audio to bounded PCM WAV", async () => {
  await runMediaRoute(
    "flv-to-wav",
    flvWavOutputPath,
    ["pcm_s16le"],
    300_000,
    flvInputFixturePath,
    { expectedWarningFragments: ["video stream"] },
  );
});

test("browser FFmpeg decodes AVI MP3 audio to bounded PCM WAV", async () => {
  await runMediaRoute(
    "avi-to-wav",
    aviWavOutputPath,
    ["pcm_s16le"],
    300_000,
    aviInputFixturePath,
    { expectedWarningFragments: ["video stream"] },
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

test("browser FFmpeg decodes raw AAC to bounded PCM WAV", async () => {
  await runMediaRoute(
    "aac-to-wav",
    aacWavOutputPath,
    ["pcm_s16le"],
    300_000,
    aacFixturePath,
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

for (const route of [
  ["mkv-to-flac", fixturePath, mkvFlacOutputPath, "AAC"],
  ["mp4-to-flac", mp4InputFixturePath, mp4FlacOutputPath, "AAC"],
  ["mov-to-flac", movInputFixturePath, movFlacOutputPath, "AAC"],
  ["3gp-to-flac", threeGpInputFixturePath, threeGpFlacOutputPath, "AAC"],
  ["mpeg-ts-to-flac", mpegTsInputFixturePath, mpegTsFlacOutputPath, "AAC"],
  ["flv-to-flac", flvInputFixturePath, flvFlacOutputPath, "AAC"],
  ["avi-to-flac", aviInputFixturePath, aviFlacOutputPath, "MP3"],
  ["ogv-to-flac", ogvFixturePath, ogvFlacOutputPath, "Vorbis"],
] as const) {
  test(`browser FFmpeg extracts ${route[0]} ${route[3]} audio to FLAC`, async () => {
    await runMediaRoute(route[0], route[2], ["flac"], 20_000, route[1], {
      expectedWarningFragments: ["video stream"],
      validate: async (_probe, outputPath) =>
        expectDecodedAudioPsnr(route[1], outputPath, 60),
    });
  });
}

test("browser FFmpeg decodes raw AAC and encodes FLAC", async () => {
  await runMediaRoute(
    "aac-to-flac",
    aacFlacOutputPath,
    ["flac"],
    20_000,
    aacFixturePath,
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

test("browser FFmpeg decodes ALAC M4A to bounded PCM WAV", async () => {
  await runMediaRoute(
    "m4a-to-wav",
    alacWavOutputPath,
    ["pcm_s16le"],
    700_000,
    alacFixturePath,
    { validate: async (_probe, outputPath) => expectDecodedPcmMatch(alacFixturePath, outputPath) },
  );
});

test("browser FFmpeg converts ALAC M4A to lossless FLAC", async () => {
  await runMediaRoute(
    "m4a-to-flac",
    alacFlacOutputPath,
    ["flac"],
    20_000,
    alacFixturePath,
    { validate: async (_probe, outputPath) => expectDecodedPcmMatch(alacFixturePath, outputPath) },
  );
});

test("browser FFmpeg losslessly encodes PCM WAV as ALAC M4A", async () => {
  await runMediaRoute(
    "wav-to-alac",
    wavAlacOutputPath,
    ["alac"],
    20_000,
    wavFixturePath,
    { validate: async (_probe, outputPath) => expectDecodedPcmMatch(wavFixturePath, outputPath) },
  );
});

test("browser FFmpeg losslessly transcodes FLAC to ALAC M4A", async () => {
  await runMediaRoute(
    "flac-to-alac",
    flacAlacOutputPath,
    ["alac"],
    20_000,
    flacFixturePath,
    { validate: async (_probe, outputPath) => expectDecodedPcmMatch(flacFixturePath, outputPath) },
  );
});

test("browser FFmpeg decodes WMA2 to bounded PCM WAV", async () => {
  await runMediaRoute(
    "wma-to-wav",
    wmaWavOutputPath,
    ["pcm_s16le"],
    700_000,
    wmaFixturePath,
    { validate: async (_probe, outputPath) => expectDecodedAudioPsnr(wmaFixturePath, outputPath, 60) },
  );
});

test("browser FFmpeg converts WMA2 to FLAC", async () => {
  await runMediaRoute(
    "wma-to-flac",
    wmaFlacOutputPath,
    ["flac"],
    20_000,
    wmaFixturePath,
    { validate: async (_probe, outputPath) => expectDecodedAudioPsnr(wmaFixturePath, outputPath, 60) },
  );
});

test("browser FFmpeg encodes PCM WAV as WMA2", async () => {
  await runMediaRoute(
    "wav-to-wma",
    wavWmaOutputPath,
    ["wmav2"],
    20_000,
    wavFixturePath,
    {
      validate: async (probe, outputPath) => {
        expect(probe.streams[0]?.sample_rate).toBe("48000");
        expect(probe.streams[0]?.bit_rate).toBe("320000");
        await expectDecodedAudioPsnr(wavFixturePath, outputPath, 60);
      },
    },
  );
});

test("browser FFmpeg encodes FLAC as WMA2", async () => {
  await runMediaRoute(
    "flac-to-wma",
    flacWmaOutputPath,
    ["wmav2"],
    20_000,
    flacFixturePath,
    {
      validate: async (probe, outputPath) => {
        expect(probe.streams[0]?.sample_rate).toBe("48000");
        expect(probe.streams[0]?.bit_rate).toBe("320000");
        await expectDecodedAudioPsnr(flacFixturePath, outputPath, 60);
      },
    },
  );
});

test("browser FFmpeg decodes AMR-NB to bounded PCM WAV", async () => {
  await runMediaRoute(
    "amr-to-wav",
    amrWavOutputPath,
    ["pcm_s16le"],
    50_000,
    amrFixturePath,
    {
      expectedDurationSeconds: 4.02,
      validate: async (_probe, outputPath) =>
        expectDecodedPcmMatch(amrFixturePath, outputPath),
    },
  );
});

test("browser FFmpeg converts AMR-NB to FLAC", async () => {
  await runMediaRoute(
    "amr-to-flac",
    amrFlacOutputPath,
    ["flac"],
    5_000,
    amrFixturePath,
    {
      expectedDurationSeconds: 4.02,
      validate: async (_probe, outputPath) =>
        expectDecodedPcmMatch(amrFixturePath, outputPath),
    },
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

test("browser FFmpeg losslessly encodes AIFF PCM as FLAC", async () => {
  await runMediaRoute(
    "aiff-to-flac",
    aiffFlacOutputPath,
    ["flac"],
    20_000,
    aiffFixturePath,
    {
      validate: async (_probe, outputPath) =>
        expectDecodedPcmMatch(aiffFixturePath, outputPath),
    },
  );
});

test("browser FFmpeg converts Ogg Vorbis to FLAC", async () => {
  await runMediaRoute(
    "ogg-to-flac",
    oggFlacOutputPath,
    ["flac"],
    20_000,
    oggFixturePath,
    {
      validate: async (_probe, outputPath) =>
        expectDecodedAudioPsnr(oggFixturePath, outputPath, 60),
    },
  );
});

test("browser FFmpeg converts Opus to FLAC", async () => {
  await runMediaRoute(
    "opus-to-flac",
    opusFlacOutputPath,
    ["flac"],
    20_000,
    opusFixturePath,
    {
      validate: async (_probe, outputPath) =>
        expectDecodedAudioPsnr(opusFixturePath, outputPath, 60),
    },
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

test("browser FFmpeg decodes video and encodes a genuine VP9 WebM", async () => {
  await runMediaRoute(
    "mkv-to-webm-vp9",
    vp9WebmOutputPath,
    ["vp9"],
    50_000,
  );
});

for (const route of [
  ["mp4-to-webm", mp4InputFixturePath, mp4WebmOutputPath, "vp8"],
  ["mp4-to-webm-vp9", mp4InputFixturePath, mp4Vp9WebmOutputPath, "vp9"],
  ["mov-to-webm", movInputFixturePath, movWebmOutputPath, "vp8"],
  ["mov-to-webm-vp9", movInputFixturePath, movVp9WebmOutputPath, "vp9"],
  ["3gp-to-webm", threeGpInputFixturePath, threeGpWebmOutputPath, "vp8"],
  ["3gp-to-webm-vp9", threeGpInputFixturePath, threeGpVp9WebmOutputPath, "vp9"],
  ["mpeg-ts-to-webm", mpegTsInputFixturePath, mpegTsWebmOutputPath, "vp8"],
  ["mpeg-ts-to-webm-vp9", mpegTsInputFixturePath, mpegTsVp9WebmOutputPath, "vp9"],
  ["flv-to-webm", flvInputFixturePath, flvWebmOutputPath, "vp8"],
  ["flv-to-webm-vp9", flvInputFixturePath, flvVp9WebmOutputPath, "vp9"],
  ["avi-to-webm", aviInputFixturePath, aviWebmOutputPath, "vp8"],
  ["avi-to-webm-vp9", aviInputFixturePath, aviVp9WebmOutputPath, "vp9"],
] as const) {
  test(`browser FFmpeg converts ${route[0]} with bounded optimized workers`, async () => {
    await runMediaRoute(route[0], route[2], [route[3]], 50_000, route[1], {
      expectedWarningFragments: ["audio stream"],
      validate: validateContainerWebmOutput,
    });
  });
}

test("browser FFmpeg converts Theora/Vorbis OGV to VP8/Vorbis WebM", async () => {
  await runMediaRoute(
    "ogv-to-webm",
    ogvWebmOutputPath,
    ["vp8", "vorbis"],
    50_000,
    ogvFixturePath,
    {
      expectedWarningFragments: [],
      validate: async (probe, outputPath) => {
        const audio = probe.streams.find(
          (stream) => stream.codec_type === "audio",
        );
        expect(audio?.tags?.language).toBe("eng");
        expect(probe.chapters ?? []).toEqual([]);
        await execFileAsync(
          "ffmpeg",
          [
            "-v", "error", "-i", outputPath,
            "-map", "0:v:0", "-map", "0:a:0",
            "-f", "null", "NUL",
          ],
          { cwd: projectRoot, windowsHide: true, maxBuffer: 8 * 1024 * 1024 },
        );
      },
    },
  );
});

test("browser FFmpeg converts Theora/Vorbis OGV to VP9/Vorbis WebM", async () => {
  await runMediaRoute(
    "ogv-to-webm-vp9",
    ogvVp9WebmOutputPath,
    ["vp9", "vorbis"],
    50_000,
    ogvFixturePath,
    {
      expectedWarningFragments: [],
      validate: async (probe, outputPath) => {
        const audio = probe.streams.find(
          (stream) => stream.codec_type === "audio",
        );
        expect(audio?.tags?.language).toBe("eng");
        await execFileAsync(
          "ffmpeg",
          ["-v", "error", "-i", outputPath, "-map", "0:v:0", "-map", "0:a:0", "-f", "null", "NUL"],
          { cwd: projectRoot, windowsHide: true, maxBuffer: 8 * 1024 * 1024 },
        );
      },
    },
  );
});

test("browser FFmpeg decodes OGV Vorbis audio to bounded PCM WAV", async () => {
  await runMediaRoute(
    "ogv-to-wav",
    ogvWavOutputPath,
    ["pcm_s16le"],
    300_000,
    ogvFixturePath,
    { expectedWarningFragments: ["video stream"] },
  );
});

test("browser FFmpeg converts MPEG-2 elementary video to MPEG-4 MP4", async () => {
  await runMediaRoute(
    "m2v-to-mp4-mpeg4",
    m2vMpeg4OutputPath,
    ["mpeg4"],
    100_000,
    m2vFixturePath,
    {
      expectedWarningFragments: [],
      validate: validateMpeg2VideoOutput,
    },
  );
});

test("browser FFmpeg converts MPEG-2 elementary video to VP8 WebM", async () => {
  await runMediaRoute(
    "m2v-to-webm",
    m2vWebmOutputPath,
    ["vp8"],
    50_000,
    m2vFixturePath,
    {
      expectedWarningFragments: [],
      validate: validateMpeg2VideoOutput,
    },
  );
});

test("browser FFmpeg converts MPEG-2 elementary video to VP9 WebM", async () => {
  await runMediaRoute(
    "m2v-to-webm-vp9",
    m2vVp9WebmOutputPath,
    ["vp9"],
    50_000,
    m2vFixturePath,
    {
      expectedWarningFragments: [],
      validate: validateMpeg2VideoOutput,
    },
  );
});

declare global {
  interface Window {
    __withinMediaValidationChunk(base64: string): Promise<void>;
  }
}
