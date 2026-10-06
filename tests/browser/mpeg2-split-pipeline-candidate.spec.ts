import { expect, test } from "@playwright/test";
import { execFile } from "node:child_process";
import { createHash } from "node:crypto";
import { existsSync } from "node:fs";
import { mkdir, mkdtemp, open, readFile, rm, stat, writeFile } from "node:fs/promises";
import path from "node:path";
import { promisify } from "node:util";
import { validateCopiedAudioTiming } from "../../scripts/lib/copied-audio-timing.mjs";
import { validateSmallMatroskaMp4Timeline } from "../../scripts/lib/small-matroska-mp4-timeline.mjs";

const root = path.resolve(import.meta.dirname, "../..");
const candidateName = process.env.WITHIN_MPEG2_SPLIT_CANDIDATE_DIR ?? "mpeg2-split-pipeline-output";
if (!/^(mpeg2-split-pipeline-output|mpeg2-split-pipeline-[0-9]{8,})$/.test(candidateName))
  throw new Error("Private candidate must remain in its named repository-local tool slot");
const candidate = path.join(root, "work", candidateName);
const expectedManifest = existsSync(path.join(candidate, "build-manifest.json"))
  ? JSON.parse(await readFile(path.join(candidate, "build-manifest.json"), "utf8")) as {
    aggregateWasmMemoryBytes: number; allowMemoryGrowth: boolean;
    nativeStackBytesPerCore?: number;
  }
  : null;
const expectedMemoryBytes = expectedManifest?.aggregateWasmMemoryBytes ?? null;
if (expectedMemoryBytes !== null && expectedMemoryBytes !== 48 * 1024 * 1024) {
  throw new Error("Private MPEG2 tests require the documented fixed32+16MiB split candidate");
}
if (expectedManifest && (expectedManifest.aggregateWasmMemoryBytes !== expectedMemoryBytes || expectedManifest.allowMemoryGrowth !== false)) {
  throw new Error("Private MPEG2 memory must be fixed with growth disabled");
}
let work: string;
const report = path.join(root, `output/playwright/${new Date().toISOString().replaceAll(":", "-")}-${candidateName}-artwork.json`);
const exec = promisify(execFile);
const rows: Array<Record<string, unknown>> = [];
type ProcessSample = { timestamp: string; privateBytes: number | null; rssBytes: number | null; processes: unknown; phase: string; realms?: unknown };
const memorySamples: ProcessSample[] = [];
const forbiddenRequests: string[] = [];
const stackReserveSamples: Array<{ nativeStackBytes: number; encoderNativeStackBytes: number; decoderMemoryBytes: number; encoderMemoryBytes: number; aggregateWasmMemoryBytes: number; asyncifyStackBytes: number;
  stackOverflowCheck: number; scope: string }> = [];
let sampling = false;
let memoryTask: Promise<void> | null = null;
const title = "MPEG-2 café — 音楽";
const adapters = [
  { container: "mp4", source: "mkv", fixture: "source", sourceCodec: "mpeg4", frames: 48, profile: "mkv-to-mp4" },
  { container: "mp4", source: "mkv", fixture: "hevc", sourceCodec: "hevc", frames: 96, profile: "mkv-to-mp4" },
] as const;

test.use({ channel: process.env.WITHIN_BROWSER_CHANNEL || undefined, serviceWorkers: "block" });
test.skip(!existsSync(path.join(candidate, "within-mpeg2-split.wasm")), "Private candidate is not built; this is not a public route gate.");

async function native(args: string[], executable = "ffmpeg") {
  return exec(executable, args, { cwd: root, windowsHide: true, maxBuffer: 4 * 1024 * 1024 });
}

async function probe(file: string) {
  const { stdout } = await native(["-v", "error", "-count_frames", "-show_streams", "-show_format", "-show_chapters", "-of", "json", file], "ffprobe");
  return JSON.parse(stdout) as {
    streams: Array<{
      index: number; codec_type: string; codec_name: string; width?: number; height?: number;
      nb_read_frames?: string; tags?: Record<string, string>; disposition?: { attached_pic: number };
    }>;
    format: { start_time: string; duration: string; tags: Record<string, string> };
    chapters: Array<{ start_time: string; end_time: string; tags: Record<string, string> }>;
  };
}

async function audioHashes(file: string) {
  const { stdout } = await native(["-v", "error", "-i", file, "-map", "0:a", "-c", "copy", "-f", "streamhash", "-hash", "sha256", "pipe:1"]);
  return stdout.trim().split(/\r?\n/).map((line) => line.split(",").at(-1)?.trim());
}

async function decodedAudioHashes(file: string) {
  // Independent validator only: compare the complete audible sample content,
  // not only compressed packet identity or decoder frame counts.
  const { stdout } = await native(["-v", "error", "-xerror", "-i", file, "-map", "0:a",
    "-c:a", "pcm_s32le", "-f", "streamhash", "-hash", "sha256", "pipe:1"]);
  return stdout.trim().split(/\r?\n/).map((line) => line.split(",").at(-1)?.trim());
}

async function frameTimes(file: string) {
  const { stdout } = await native(["-v", "error", "-select_streams", "v:0", "-show_frames",
    "-show_entries", "frame=best_effort_timestamp_time", "-of", "json", file], "ffprobe");
  const data = JSON.parse(stdout) as { frames: Array<{ best_effort_timestamp_time: string }> };
  return data.frames.map((frame) => Number(frame.best_effort_timestamp_time));
}

async function copiedAudioTimeline(file: string) {
  const { stdout } = await native(["-v", "error", "-select_streams", "a", "-show_packets",
    "-show_entries", "packet=stream_index,pts_time,dts_time,duration_time", "-of", "json", file], "ffprobe");
  return (JSON.parse(stdout) as { packets: Array<{
    stream_index: number; pts_time: string; dts_time: string; duration_time: string;
    side_data_list?: Array<{ side_data_type: string; skip_samples: number; discard_padding: number }>;
  }> }).packets;
}

async function compareFrames(source: string, output: string, ordinal: boolean) {
  const align = ordinal ? "settb=1/1,setpts=N" : "setpts=PTS-STARTPTS";
  const { stderr } = await native(["-v", "info", "-i", source, "-i", output, "-filter_complex",
    `[0:v:0]${align}[ref];[1:v:0]${align}[out];[ref][out]ssim`, "-an", "-f", "null", "-"]);
  return Number(/All:([0-9.]+)/.exec(stderr)?.[1]);
}

async function sampleTree(rootPid: number, phase: string): Promise<ProcessSample> {
  const timestamp = new Date().toISOString();
  if (process.platform !== "win32") return { timestamp, phase, privateBytes: null, rssBytes: null, processes: null };
  try {
    const script = `
      $all = @(Get-CimInstance Win32_Process | Select-Object ProcessId,ParentProcessId,CommandLine,CreationDate,PrivatePageCount,WorkingSetSize)
      $ids = New-Object 'System.Collections.Generic.HashSet[int]'
      [void]$ids.Add(${rootPid})
      $createdAt = @{}
      foreach ($entry in $all) { $createdAt[[int]$entry.ProcessId] = [datetime]$entry.CreationDate }
      do {
        $changed = $false
        foreach ($entry in $all) {
          $parentId = [int]$entry.ParentProcessId
          if ($ids.Contains($parentId) -and -not $ids.Contains([int]$entry.ProcessId) -and
              $createdAt.ContainsKey($parentId) -and [datetime]$entry.CreationDate -ge [datetime]$createdAt[$parentId]) {
            [void]$ids.Add([int]$entry.ProcessId); $changed = $true
          }
        }
      } while ($changed)
      @($all | Where-Object { $ids.Contains([int]$_.ProcessId) } | ForEach-Object {
        $type = 'browser'; if ($_.CommandLine -match '--type=([^ ]+)') { $type = $Matches[1] }
        [pscustomobject]@{pid=[int]$_.ProcessId;parentPid=[int]$_.ParentProcessId;type=$type;privateBytes=[double]$_.PrivatePageCount;rssBytes=[double]$_.WorkingSetSize}
      }) | ConvertTo-Json -Compress
    `;
    const { stdout } = await exec("powershell.exe", ["-NoProfile", "-NonInteractive", "-Command", script], {
      windowsHide: true, maxBuffer: 1024 * 1024, timeout: 5000,
    });
    const parsed = JSON.parse(stdout);
    const processes = (Array.isArray(parsed) ? parsed : [parsed]) as Array<{ pid: number; privateBytes: number; rssBytes: number }>;
    if (!processes.some((entry) => entry.pid === rootPid) || processes.some((entry) =>
      !Number.isFinite(entry.privateBytes) || entry.privateBytes <= 0 || !Number.isFinite(entry.rssBytes))) {
      throw new Error("Incomplete process-tree sample");
    }
    return { timestamp, phase, processes,
      privateBytes: processes.reduce((sum, entry) => sum + entry.privateBytes, 0),
      rssBytes: processes.reduce((sum, entry) => sum + entry.rssBytes, 0) };
  } catch {
    return { timestamp, phase, privateBytes: null, rssBytes: null, processes: null };
  }
}

test.beforeAll(async () => {
  await mkdir(path.join(root, "work"), { recursive: true });
  work = await mkdtemp(path.join(root, "work/mpeg2-artwork-validation-"));
  const metadata = path.join(work, "chapters.ffmetadata");
  await writeFile(metadata, `;FFMETADATA1\ntitle=${title}\ncreation_time=2000-01-01T00:00:00.000000Z\nWEBSiTE=example.invalid/café\ncustom_音楽=Unicode retained\n[CHAPTER]\nTIMEBASE=1/1000\nSTART=0\nEND=2000\ntitle=Chapitre café\n`);
  const artwork = path.join(work, "artwork.png");
  await native(["-v", "error", "-f", "lavfi", "-i", "color=c=red:size=250x140",
    "-frames:v", "1", "-threads", "1", "-c:v", "png", artwork]);
  // Additional HEVC reordered-frame correctness coverage for decoder caching.
  // Small fixtures never substitute for the full unchanged protected gate.
  const fixtures = [
    { name: "source", seconds: 2, codec: ["-c:v", "mpeg4", "-q:v", "2", "-bf", "0"] },
    { name: "hevc", seconds: 4, codec: ["-c:v", "libx265", "-preset", "ultrafast", "-crf", "18",
      "-threads:v", "1", "-x265-params", "pools=none:frame-threads=1:wpp=0:bframes=2:keyint=48:scenecut=0:log-level=error"] },
  ];
  for (const fixture of fixtures) {
    await native([
      "-v", "error", "-y", "-f", "lavfi", "-i", `testsrc2=size=320x240:rate=24:duration=${fixture.seconds}`,
      "-f", "lavfi", "-i", `sine=frequency=997:sample_rate=48000:duration=${fixture.seconds}`,
      "-f", "lavfi", "-i", `sine=frequency=440:sample_rate=48000:duration=${fixture.seconds}`,
      "-f", "ffmetadata", "-i", metadata, "-map", "0:v", "-map", "1:a", "-map", "2:a",
      "-map_metadata", "3", "-map_chapters", "3", ...fixture.codec,
      "-c:a", "aac", "-b:a", "128k", "-metadata:s:a:0", "language=eng",
      "-metadata:s:a:1", "language=hin", "-metadata:s:a:0", "title=First café",
      "-metadata:s:a:1", "title=Second 音楽", "-avoid_negative_ts", "make_zero",
      "-fflags", "+bitexact", "-flags:v", "+bitexact", "-flags:a", "+bitexact",
      "-attach", artwork, "-metadata:s:t:0", "mimetype=image/png",
      "-metadata:s:t:0", "filename=cover.png", path.join(work, `${fixture.name}.mkv`),
    ]);
    expect((await stat(path.join(work, `${fixture.name}.mkv`))).size).toBeLessThan(16 * 1024 * 1024);
  }
  // Separate synthetic safety fixture, never a substitute for the protected
  // full-resolution input. Enough real frames to cancel after written output.
  await native(["-v", "error", "-f", "lavfi", "-i",
    "testsrc2=size=640x360:rate=24:duration=20", "-c:v", "mpeg4", "-q:v", "2",
    "-bf", "0", "-threads", "1", path.join(work, "cancel.mkv")]);
  expect((await stat(path.join(work, "cancel.mkv"))).size).toBeLessThan(16 * 1024 * 1024);
});

test.beforeEach(async ({ context, browser, page }) => {
  forbiddenRequests.length = 0;
  stackReserveSamples.length = 0;
  page.on("console", (message) => {
    const text = message.text(), prefix = "WITHIN_MPEG2_STACK_RESERVE ";
    if (text.startsWith(prefix) && text.length <= 512 && stackReserveSamples.length < 16)
      stackReserveSamples.push(JSON.parse(text.slice(prefix.length)));
  });
  const origin = new URL(process.env.WITHIN_TEST_BASE_URL ?? `http://127.0.0.1:${process.env.WITHIN_TEST_PORT ?? "3000"}`).origin;
  context.on("request", (request) => {
    if (new URL(request.url()).origin !== origin || !["GET", "HEAD"].includes(request.method()) || request.postData()) {
      if (forbiddenRequests.length < 32) forbiddenRequests.push(`${request.method()} ${request.url()}`);
    }
  });
  memorySamples.length = 0;
  const session = await browser.newBrowserCDPSession();
  const info = await session.send("SystemInfo.getProcessInfo");
  await session.detach();
  const rootPid = info.processInfo.find((entry) => entry.type === "browser")?.id;
  if (!rootPid) throw new Error("The whole Chromium tree root could not be identified.");
  memorySamples.push(await sampleTree(rootPid, "blank-diagnostic-not-certified-stable-baseline"));
  sampling = true;
  memoryTask = (async () => {
    const pendingHeaps = new WeakSet<object>();
    const boundedHeap = async (realm: object, operation: () => Promise<number | null>) => {
      if (pendingHeaps.has(realm)) return null;
      pendingHeaps.add(realm);
      const promise = operation().catch(() => null).finally(() => pendingHeaps.delete(realm));
      let timer: ReturnType<typeof setTimeout> | undefined;
      try {
        return await Promise.race([promise, new Promise<null>((resolve) => {
          timer = setTimeout(() => resolve(null), 1000);
        })]);
      } finally { clearTimeout(timer); }
    };
    while (sampling) {
      const phase = await page.evaluate(() => window.__WITHIN_TEST__?.getState().jobState ?? "loading").catch(() => "unavailable");
      const sample = await sampleTree(rootPid, phase);
      const diagnosticHeap = () => {
        const memory = (performance as Performance & { memory?: { usedJSHeapSize: number } }).memory;
        return memory?.usedJSHeapSize ?? null;
      };
      sample.realms = {
        pageUsedJSHeapBytes: await boundedHeap(page, () => page.evaluate(diagnosticHeap)),
        workers: await Promise.all(page.workers().map(async (worker) => ({
          url: worker.url(), usedJSHeapBytes: await boundedHeap(worker, () => worker.evaluate(diagnosticHeap)),
        }))),
      };
      if (memorySamples.length === 256) memorySamples.shift();
      memorySamples.push(sample);
      if (sampling) await new Promise((resolve) => setTimeout(resolve, 250));
    }
  })();
  // Explicit staged-module adapter in disposable dist assets. Production
  // worker, original File, AVIO, cancellation and writers remain unchanged.
  // Worker imports cannot be reliably substituted with context.route here.
  const staged = await readFile(path.join(root, "dist/client/engines/remux/within-remux.mjs"), "utf8");
  expect(staged).toContain("PRIVATE_MPEG2_SPLIT_PRODUCTION_ADAPTER_NOT_PUBLIC_SUPPORT");
});

test.afterEach(async ({ page }) => {
  sampling = false;
  await memoryTask;
  memoryTask = null;
  expect(forbiddenRequests, "conversion must not transmit data or contact external origins").toEqual([]);
  rows.push({ memoryScope: "Whole-process diagnostic samples; short fixtures and non-stabilized baseline do not certify the 250 MiB contract", samples: [...memorySamples] });
  rows.push({ kind: "actual-native-stack-reserve", samples: [...stackReserveSamples],
    scope: "Reserved capacity, not measured high-water or memory acceptance" });
  if (expectedManifest?.nativeStackBytesPerCore !== undefined) {
    expect(stackReserveSamples.length).toBeGreaterThan(0);
    for (const sample of stackReserveSamples) {
      expect(sample.nativeStackBytes).toBe(262144); expect(sample.asyncifyStackBytes).toBe(262144);
      expect(sample.stackOverflowCheck).toBe(2);
      expect(sample.encoderNativeStackBytes).toBe(262144);
      expect(sample.decoderMemoryBytes).toBe(33554432); expect(sample.encoderMemoryBytes).toBe(16777216);
      expect(sample.aggregateWasmMemoryBytes).toBe(50331648);
      expect(sample.scope).toBe("reserved-not-high-water-not-acceptance");
    }
  }
  if (page.isClosed()) return;
  const entries = await page.evaluate(async () => {
    const directory = await navigator.storage.getDirectory();
    const names: string[] = [];
    for await (const [name] of directory.entries()) names.push(name);
    for (const name of names) await directory.removeEntry(name, { recursive: true });
    return names;
  });
  rows.push({ cleanupRemovedEntries: entries });
});

test.afterAll(async () => {
  try {
    await mkdir(path.dirname(report), { recursive: true });
    if (rows.length > 1024) throw new Error("Diagnostic history cap reached: retain compact evidence before another run.");
    await writeFile(report, `${JSON.stringify({
      recordedAt: new Date().toISOString(),
      scope: "Private MPEG2 kernel substituted through production browser worker/I/O; NOT public-profile, stress or complete-process memory certification",
      manifest: JSON.parse(await readFile(path.join(candidate, "build-manifest.json"), "utf8")),
      candidateName, rows,
    }, null, 2)}\n`, { flag: "wx" });
  } finally {
    if (work) {
      expect(path.dirname(work)).toBe(path.join(root, "work"));
      await rm(work, { recursive: true, force: true });
    }
  }
});

for (const adapter of adapters) {
  test(`private split MPEG2 ${adapter.sourceCodec} to ${adapter.container}: genuine encode preserves bounded PNG attached art plus audio and metadata`, async ({ page }) => {
    const source = path.join(work, `${adapter.fixture}.${adapter.source}`);
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
      expect(state.metrics?.wasmMemoryBytes).toBe(expectedMemoryBytes);
      expect(state.metrics?.peakWasmMemoryBytes).toBe(expectedMemoryBytes);
      expect(state.metrics?.maxReadChunkBytes).toBeLessThanOrEqual(256 * 1024);
      expect(state.metrics?.maxWriteChunkBytes).toBeLessThanOrEqual(256 * 1024);
      expect(state.metrics?.peakQueuedBytes).toBeLessThanOrEqual(256 * 1024);
      expect(state.metrics?.peakPendingOperations).toBeLessThanOrEqual(1);
      expect(state.metrics?.pendingOperations).toBe(0);
      expect(state.metrics?.queuedBytes).toBe(0);
      const outputHandle = await open(output, "wx");
      try {
        const size = await page.evaluate(async (name) => {
          const directory = await navigator.storage.getDirectory();
          return (await (await directory.getFileHandle(name)).getFile()).size;
        }, state.opfsName!);
        if (size > 16 * 1024 * 1024) throw new Error("Small independent validator exceeded 16 MiB.");
        for (let position = 0; position < size; position += 65536) {
          const bytes = await page.evaluate(async ({ name, position }) => {
            const directory = await navigator.storage.getDirectory();
            const file = await (await directory.getFileHandle(name)).getFile();
            return Array.from(new Uint8Array(await file.slice(position, position + 65536).arrayBuffer()));
          }, { name: state.opfsName!, position });
          const buffer = Buffer.from(bytes);
          let written = 0;
          while (written < buffer.length) {
            const result = await outputHandle.write(buffer, written, buffer.length - written, position + written);
            if (!result.bytesWritten) throw new Error("Independent validator short write.");
            written += result.bytesWritten;
          }
        }
      } finally { await outputHandle.close(); }
      const after = await probe(output);
      rows.push({ kind: "independent-pre-assertion-probes", sourceProbe: before, outputProbe: after,
        outputBytes: (await stat(output)).size,
        outputSha256: createHash("sha256").update(await readFile(output)).digest("hex"), metrics: state.metrics });
      const beforeVideo = before.streams.find((stream) => stream.codec_type === "video")!;
      const afterVideo = after.streams.find((stream) => stream.codec_type === "video")!;
      expect(beforeVideo.codec_name).toBe(adapter.sourceCodec);
      expect(afterVideo.codec_name).toBe("mpeg2video");
      expect(afterVideo.width).toBe(beforeVideo.width);
      expect(afterVideo.height).toBe(beforeVideo.height);
      expect(afterVideo.nb_read_frames).toBe(beforeVideo.nb_read_frames);
      expect(Number(afterVideo.nb_read_frames)).toBe(adapter.frames);
      const inputArt = before.streams.find((s) => s.disposition?.attached_pic);
      const outputArt = after.streams.find((s) => s.disposition?.attached_pic);
      expect(after.streams.filter((s) => s.disposition?.attached_pic)).toHaveLength(1);
      expect(after.streams.filter((s) => s.codec_type === "video" && !s.disposition?.attached_pic)).toHaveLength(1);
      expect(after.streams.every((s) => Boolean(s.codec_name)), "No undeclared empty/unknown tracks").toBe(true);
      expect(inputArt?.codec_name).toBe("png");
      expect(outputArt?.codec_name).toBe("png");
      expect(outputArt?.width).toBe(250); expect(outputArt?.height).toBe(140);
      const compressedArtworkHash = async (file: string, index: number) => (await native([
        "-v", "error", "-i", file, "-map", `0:${index}`, "-c", "copy", "-f", "hash",
        "-hash", "sha256", "pipe:1"])).stdout.trim();
      const originalArtworkHash = await compressedArtworkHash(source, inputArt!.index);
      expect(await compressedArtworkHash(output, outputArt!.index)).toBe(originalArtworkHash);
      expect(afterVideo.tags?.encoder).toBe("Within FFmpeg MPEG-2");
      rows.push({ kind: "attached-picture-preservation", status: "passed",
        inputArt, outputArt, compressedArtworkHash: originalArtworkHash,
        actualVideoEncoderTag: afterVideo.tags?.encoder });
      const audio = after.streams.filter((stream) => stream.codec_type === "audio");
      expect(audio.map((stream) => stream.codec_name)).toEqual(["aac", "aac"]);
      expect(audio.map((stream) => stream.tags?.language)).toEqual(["eng", "hin"]);
      expect(await audioHashes(output)).toEqual(await audioHashes(source));
      expect(after.format.tags.title).toBe(before.format.tags.title);
      const normalizedTags = (tags: Record<string, string>) => Object.fromEntries(
        Object.entries(tags).map(([key, value]) => [key.toLowerCase(), value]));
      const beforeTags = normalizedTags(before.format.tags), afterTags = normalizedTags(after.format.tags);
      expect(afterTags.website).toBe(beforeTags.website);
      expect(afterTags["custom_音楽"]).toBe(beforeTags["custom_音楽"]);
      expect(after.chapters).toHaveLength(1);
      expect(after.chapters[0].tags.title).toBe(before.chapters[0].tags.title);
      expect(Number(after.chapters[0].start_time)).toBeCloseTo(Number(before.chapters[0].start_time), 3);
      expect(Number(after.chapters[0].end_time)).toBeCloseTo(Number(before.chapters[0].end_time), 3);
      await native(["-v", "error", "-xerror", "-i", output, "-map", "0:v:0", "-map", "0:a", "-f", "null", "-"]);
      const sourceFrameTimes = await frameTimes(source);
      const outputFrameTimes = await frameTimes(output);
      const ssim = await compareFrames(source, output, false);
      const ordinalSsim = await compareFrames(source, output, true);
      rows.push({ container: adapter.container, kind: "independent-frame-diagnostic", status: "diagnostic-not-accepted",
        sourceProbe: before, outputProbe: after, sourceFrameTimes, outputFrameTimes,
        timestampAlignedSsim: ssim, ordinalSsim, nativeFullDecodePassed: true,
        audioPacketHashes: await audioHashes(output), sourceBytes: (await stat(source)).size,
        outputBytes: (await stat(output)).size,
        outputSha256: createHash("sha256").update(await readFile(output)).digest("hex"), metrics: state.metrics });
      const sourceAudioTimeline = await copiedAudioTimeline(source);
      const outputAudioTimeline = await copiedAudioTimeline(output);
      rows.push({ kind: "independent-copied-audio-timeline", sourceCodec: adapter.sourceCodec,
        sourceFormatStart: before.format.start_time, sourceFormatDuration: before.format.duration,
        outputFormatStart: after.format.start_time, outputFormatDuration: after.format.duration,
        sourceAudioTimeline, outputAudioTimeline });
      const sourceDecodedAudioHashes = await decodedAudioHashes(source);
      const outputDecodedAudioHashes = await decodedAudioHashes(output);
      rows.push({ kind: "independent-decoded-audio", sourceCodec: adapter.sourceCodec,
        sourceDecodedAudioHashes, outputDecodedAudioHashes });
      const copiedAudioTiming = validateCopiedAudioTiming(sourceAudioTimeline, outputAudioTimeline,
        before.streams.filter((s) => s.codec_type === "audio").map((s) => s.index), audio.map((s) => s.index));
      rows.push({ kind: "copied-audio-timing-passed", sourceCodec: adapter.sourceCodec, tracks: copiedAudioTiming });
      expect(outputDecodedAudioHashes, "Preserve complete decoded audible sample content and exact trim").toEqual(sourceDecodedAudioHashes);
      // Retain raw duration scalars above, but do not compare unlike origins:
      // Matroska Segment Duration versus MP4's fragment-derived stream span.
      // Require every actual track start/end within 1ms, exact decoded audio,
      // and BOTH headers independently consistent at the original 60ms.
      const presentationTimeline = validateSmallMatroskaMp4Timeline({
        sourceProbe: before, outputProbe: after, sourceFrames: sourceFrameTimes, outputFrames: outputFrameTimes,
        sourcePackets: sourceAudioTimeline, outputPackets: outputAudioTimeline,
        sourceDecodedAudioHashes, outputDecodedAudioHashes,
      });
      rows.push({ kind: "independent-presentation-timeline-passed", sourceCodec: adapter.sourceCodec,
        presentationTimeline });
      expect(outputFrameTimes).toHaveLength(sourceFrameTimes.length);
      for (let index = 0; index < sourceFrameTimes.length; index++) {
        expect(Number.isFinite(outputFrameTimes[index])).toBe(true);
        expect(Math.abs(outputFrameTimes[index] - sourceFrameTimes[index]), `frame ${index} presentation time`)
          .toBeLessThanOrEqual(0.001);
      }
      // Compare corresponding decoded frames, not framesync's prior frame at
      // a rounded container timestamp. The separate exact timeline gate above
      // prevents an ordinal quality comparison from hiding timing corruption.
      expect(ordinalSsim).toBeGreaterThanOrEqual(0.98);
      // Match the full protected gate's compatible container-field contract.
      // Do not let a shorter metadata allowlist conceal original encoder or
      // creation-time loss before starting an expensive original-size job.
      for (const [key, value] of Object.entries(beforeTags)) {
        expect(afterTags[key], `Preserve compatible container metadata ${key}`).toBe(value);
      }
      rows.push({ container: adapter.container, status: "passed", sourceBytes: (await stat(source)).size,
        outputBytes: (await stat(output)).size, sourceCodec: beforeVideo.codec_name,
        outputCodec: afterVideo.codec_name, frames: afterVideo.nb_read_frames, audioTracks: audio.length,
        audioPacketHashes: await audioHashes(output), ssim: ordinalSsim, timestampAlignedSsim: ssim,
        sourceFrameTimes, outputFrameTimes, metrics: state.metrics,
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

test("private split MPEG2 propagates direct output write failure and removes partial output", async ({ page }) => {
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

test("private split MPEG2 cancels after genuine direct output and removes partial output", async ({ page }) => {
  try {
    await page.goto("/?test=1&directory=1");
    await page.waitForFunction(() => window.__WITHIN_TEST__?.getState().workerStatus === "ready");
    await page.locator('[data-testid="file-input"]').setInputFiles(path.join(work, "cancel.mkv"));
    await page.locator('[data-testid="format-select"]').selectOption("mkv-to-mp4");
    await page.locator('[data-testid="convert-button"]').click();
    await page.waitForFunction(() => {
      const state = window.__WITHIN_TEST__?.getState();
      return state?.jobState === "running" && (state.metrics?.outputBytes ?? 0) > 32768;
    });
    const beforeCancel = await page.evaluate(() => window.__WITHIN_TEST__!.getState());
    await page.getByRole("button", { name: "Cancel safely", exact: true }).click();
    await page.waitForFunction(() => window.__WITHIN_TEST__?.getState().jobState === "cancelled");
    const state = await page.evaluate(() => window.__WITHIN_TEST__!.getState());
    expect(beforeCancel.jobState).toBe("running");
    expect(beforeCancel.metrics?.outputBytes).toBeGreaterThan(32768);
    expect(state.metrics?.pendingOperations).toBe(0);
    expect(state.metrics?.queuedBytes).toBe(0);
    expect(state.opfsName).toBeNull();
    const partialBytes = await page.evaluate(async () => {
      const directory = await navigator.storage.getDirectory();
      const sizes: number[] = [];
      for await (const [, handle] of directory.entries()) {
        if (handle.kind === "file") sizes.push((await (handle as FileSystemFileHandle).getFile()).size);
      }
      return sizes;
    });
    expect(partialBytes.every((size) => size === 0)).toBe(true);
    rows.push({ kind: "cancel-after-direct-output", status: "passed", beforeCancel: beforeCancel.metrics,
      terminalState: state.jobState, metrics: state.metrics, partialBytes });
  } catch (error) {
    rows.push({ kind: "cancel-after-direct-output", status: "failed", error: String(error),
      state: await page.evaluate(() => window.__WITHIN_TEST__?.getState()).catch(() => null) });
    throw error;
  }
});
