import { expect, test } from "@playwright/test";
import { execFile } from "node:child_process";
import { createHash } from "node:crypto";
import { existsSync } from "node:fs";
import { mkdir, readFile, rm, stat, writeFile } from "node:fs/promises";
import path from "node:path";
import { promisify } from "node:util";

const root = path.resolve(import.meta.dirname, "../..");
const candidate = path.join(root, "work/h264-candidate-output");
const work = path.join(root, "work/h264-browser-validation");
const report = path.join(root, "output/playwright/h264-candidate.json");
const exec = promisify(execFile);
const rows: Array<Record<string, unknown>> = [];
const title = "H.264 café — 音楽";
const adapters = [
  { container: "mp4", source: "mkv", profile: "mkv-to-mp4" },
  { container: "mkv", source: "mp4", profile: "mp4-to-mkv" },
] as const;

test.use({ channel: process.env.WITHIN_BROWSER_CHANNEL || undefined, serviceWorkers: "block" });
test.skip(!existsSync(path.join(candidate, "within-h264.wasm")), "Private candidate is not built; this is not a public route gate.");

async function native(args: string[], executable = "ffmpeg") {
  return exec(executable, args, { cwd: root, windowsHide: true, maxBuffer: 4 * 1024 * 1024 });
}

async function probe(file: string) {
  const { stdout } = await native(["-v", "error", "-count_frames", "-show_streams", "-show_format", "-show_chapters", "-of", "json", file], "ffprobe");
  return JSON.parse(stdout) as {
    streams: Array<{
      codec_type: string; codec_name: string; width?: number; height?: number;
      nb_read_frames?: string; tags?: Record<string, string>;
    }>;
    format: { duration: string; tags: Record<string, string> };
    chapters: Array<{ start_time: string; end_time: string; tags: Record<string, string> }>;
  };
}

async function audioHashes(file: string) {
  const { stdout } = await native(["-v", "error", "-i", file, "-map", "0:a", "-c", "copy", "-f", "streamhash", "-hash", "sha256", "pipe:1"]);
  return stdout.trim().split(/\r?\n/).map((line) => line.split(",").at(-1)?.trim());
}

test.beforeAll(async () => {
  await mkdir(work, { recursive: true });
  const metadata = path.join(work, "chapters.ffmetadata");
  await writeFile(metadata, `;FFMETADATA1\ntitle=${title}\n[CHAPTER]\nTIMEBASE=1/1000\nSTART=0\nEND=2000\ntitle=Chapitre café\n`);
  for (const extension of ["mkv", "mp4"]) {
    await native([
      "-v", "error", "-y", "-f", "lavfi", "-i", "testsrc2=size=320x240:rate=24:duration=2",
      "-f", "lavfi", "-i", "sine=frequency=997:sample_rate=48000:duration=2",
      "-f", "lavfi", "-i", "sine=frequency=440:sample_rate=48000:duration=2",
      "-f", "ffmetadata", "-i", metadata, "-map", "0:v", "-map", "1:a", "-map", "2:a",
      "-map_metadata", "3", "-map_chapters", "3", "-c:v", "mpeg4", "-q:v", "2", "-bf", "0",
      "-c:a", "aac", "-b:a", "128k", "-metadata:s:a:0", "language=eng",
      "-metadata:s:a:1", "language=hin", "-metadata:s:a:0", "title=First café",
      "-metadata:s:a:1", "title=Second 音楽", "-avoid_negative_ts", "make_zero",
      "-fflags", "+bitexact", "-flags:v", "+bitexact", "-flags:a", "+bitexact",
      path.join(work, `source.${extension}`),
    ]);
  }
});

test.beforeEach(async ({ context }) => {
  // Explicit module-only adapter: the actual production worker, original File,
  // AVIO bridge, cancellation and OPFS/direct writer remain unchanged. No
  // registry/UI claims are inferred from the existing route labels.
  await context.route("**/__h264-candidate/base.mjs", async (route) => {
    await route.fulfill({ path: path.join(candidate, "within-h264.mjs"), contentType: "text/javascript" });
  });
  await context.route("**/engines/remux/within-remux.mjs", async (route) => {
    await route.fulfill({ contentType: "text/javascript", body: `
      import factory from "/__h264-candidate/base.mjs";
      export default async function(options) {
        const core = await factory(options);
        const call = core.ccall.bind(core);
        core.ccall = (name, type, types, args, settings) => {
          const mapped = [...args];
          if (mapped[0] === 1) mapped[0] = 6;
          return call(name, type, types, mapped, settings);
        };
        return core;
      }
    ` });
  });
  await context.route("**/engines/remux/within-remux.wasm", async (route) => {
    await route.fulfill({ path: path.join(candidate, "within-h264.wasm"), contentType: "application/wasm" });
  });
});

test.afterEach(async ({ page }) => {
  if (page.isClosed()) return;
  const entries = await page.evaluate(async () => {
    const directory = await navigator.storage.getDirectory();
    const names: string[] = [];
    for await (const [name] of directory.entries()) names.push(name);
    for (const name of names) await directory.removeEntry(name, { recursive: true });
    return names;
  }).catch(() => []);
  rows.push({ cleanupRemovedEntries: entries });
});

test.afterAll(async () => {
  try {
    await mkdir(path.dirname(report), { recursive: true });
    const previous = JSON.parse(await readFile(report, "utf8").catch(() => '{"rows":[]}')) as { rows: Array<Record<string, unknown>> };
    await writeFile(report, `${JSON.stringify({
      recordedAt: new Date().toISOString(),
      scope: "Private H264 kernel substituted through production browser worker/I/O; NOT public-profile, stress or complete-process memory certification",
      manifest: JSON.parse(await readFile(path.join(candidate, "build-manifest.json"), "utf8")),
      rows: [...previous.rows, ...rows],
    }, null, 2)}\n`);
  } finally {
    await rm(work, { recursive: true, force: true });
  }
});

for (const adapter of adapters) {
  test(`private H264 ${adapter.container}: genuine encode plus two compatible audio tracks and metadata`, async ({ page }) => {
    const source = path.join(work, `source.${adapter.source}`);
    const output = path.join(work, `result.${adapter.container}`);
    const before = await probe(source);
    try {
      await page.goto("/?test=1");
      await page.waitForFunction(() => window.__WITHIN_TEST__?.getState().workerStatus === "ready");
      await page.locator('[data-testid="file-input"]').setInputFiles(source);
      await page.locator('[data-testid="format-select"]').selectOption(adapter.profile);
      await expect(page.locator('[data-testid="convert-button"]')).toBeEnabled();
      await page.locator('[data-testid="convert-button"]').click();
      await page.waitForFunction(() => {
        const state = window.__WITHIN_TEST__?.getState().jobState;
        return state && !["idle", "running"].includes(state);
      });
      const state = await page.evaluate(() => window.__WITHIN_TEST__!.getState());
      expect(state.jobState, state.error ?? state.phase).toBe("complete");
      expect(state.opfsName).toBeTruthy();
      expect(state.metrics?.wasmMemoryBytes).toBe(64 * 1024 * 1024);
      expect(state.metrics?.peakWasmMemoryBytes).toBe(64 * 1024 * 1024);
      expect(state.metrics?.maxReadChunkBytes).toBeLessThanOrEqual(256 * 1024);
      expect(state.metrics?.maxWriteChunkBytes).toBeLessThanOrEqual(256 * 1024);
      expect(state.metrics?.peakQueuedBytes).toBeLessThanOrEqual(256 * 1024);
      expect(state.metrics?.peakPendingOperations).toBeLessThanOrEqual(1);
      expect(state.metrics?.pendingOperations).toBe(0);
      expect(state.metrics?.queuedBytes).toBe(0);
      const bytes = await page.evaluate(async (name) => {
        const directory = await navigator.storage.getDirectory();
        const file = await (await directory.getFileHandle(name)).getFile();
        if (file.size > 1024 * 1024) throw new Error("Small validator copy exceeded 1 MiB.");
        return Array.from(new Uint8Array(await file.arrayBuffer()));
      }, state.opfsName!);
      await writeFile(output, Buffer.from(bytes));
      const after = await probe(output);
      const beforeVideo = before.streams.find((stream) => stream.codec_type === "video")!;
      const afterVideo = after.streams.find((stream) => stream.codec_type === "video")!;
      expect(beforeVideo.codec_name).toBe("mpeg4");
      expect(afterVideo.codec_name).toBe("h264");
      expect(afterVideo.width).toBe(beforeVideo.width);
      expect(afterVideo.height).toBe(beforeVideo.height);
      expect(afterVideo.nb_read_frames).toBe(beforeVideo.nb_read_frames);
      expect(Number(afterVideo.nb_read_frames)).toBe(48);
      const audio = after.streams.filter((stream) => stream.codec_type === "audio");
      expect(audio.map((stream) => stream.codec_name)).toEqual(["aac", "aac"]);
      expect(audio.map((stream) => stream.tags?.language)).toEqual(["eng", "hin"]);
      expect(await audioHashes(output)).toEqual(await audioHashes(source));
      expect(after.format.tags.title).toBe(before.format.tags.title);
      expect(after.chapters).toHaveLength(1);
      expect(after.chapters[0].tags.title).toBe(before.chapters[0].tags.title);
      expect(Number(after.chapters[0].start_time)).toBeCloseTo(Number(before.chapters[0].start_time), 3);
      expect(Number(after.chapters[0].end_time)).toBeCloseTo(Number(before.chapters[0].end_time), 3);
      expect(Math.abs(Number(after.format.duration) - Number(before.format.duration))).toBeLessThan(0.06);
      await native(["-v", "error", "-xerror", "-i", output, "-map", "0:v:0", "-map", "0:a", "-f", "null", "-"]);
      const { stderr } = await native([
        "-v", "info", "-i", source, "-i", output, "-filter_complex",
        "[0:v:0]setpts=PTS-STARTPTS[ref];[1:v:0]setpts=PTS-STARTPTS[out];[ref][out]ssim",
        "-an", "-f", "null", "-",
      ]);
      const ssim = Number(/All:([0-9.]+)/.exec(stderr)?.[1]);
      expect(ssim).toBeGreaterThanOrEqual(0.98);
      rows.push({ container: adapter.container, status: "passed", sourceBytes: (await stat(source)).size,
        outputBytes: (await stat(output)).size, sourceCodec: beforeVideo.codec_name,
        outputCodec: afterVideo.codec_name, frames: afterVideo.nb_read_frames, audioTracks: audio.length,
        audioPacketHashes: await audioHashes(output), ssim, metrics: state.metrics,
        outputSha256: createHash("sha256").update(await readFile(output)).digest("hex"), warnings: state.warnings,
      });
    } catch (error) {
      rows.push({ container: adapter.container, status: "failed", error: String(error),
        state: await page.evaluate(() => window.__WITHIN_TEST__?.getState()).catch(() => null) });
      throw error;
    } finally {
      try {
        await page.evaluate(async () => {
          const directory = await navigator.storage.getDirectory();
          for await (const [name] of directory.entries()) await directory.removeEntry(name, { recursive: true });
          const remaining = [];
          for await (const [name] of directory.entries()) remaining.push(name);
          if (remaining.length) throw new Error("Candidate OPFS cleanup failed.");
        });
      } finally { await rm(output, { force: true }); }
    }
  });
}

test("private H264 propagates direct output write failure and removes partial output", async ({ page }) => {
  await page.goto("/?test=1&directory=1&fault=write");
  await page.waitForFunction(() => window.__WITHIN_TEST__?.getState().workerStatus === "ready");
  await page.locator('[data-testid="file-input"]').setInputFiles(path.join(work, "source.mkv"));
  await page.locator('[data-testid="format-select"]').selectOption("mkv-to-mp4");
  await page.locator('[data-testid="convert-button"]').click();
  await page.waitForFunction(() => window.__WITHIN_TEST__?.getState().jobState === "error");
  const state = await page.evaluate(() => window.__WITHIN_TEST__!.getState());
  expect(state.error?.toLowerCase()).toContain("destination rejected a bounded write");
  expect(state.metrics?.pendingOperations).toBe(0);
  expect(state.metrics?.queuedBytes).toBe(0);
  expect(state.opfsName).toBeNull();
  const files = await page.evaluate(async () => {
    const directory = await navigator.storage.getDirectory();
    const sizes: number[] = [];
    for await (const [, handle] of directory.entries()) {
      if (handle.kind === "file") sizes.push((await (handle as FileSystemFileHandle).getFile()).size);
    }
    return sizes;
  });
  expect(files.every((size) => size === 0)).toBe(true);
  rows.push({ kind: "direct-write-failure", status: "passed", error: state.error, metrics: state.metrics, partialBytes: files });
});
