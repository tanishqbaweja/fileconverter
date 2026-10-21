// Private backend qualification, not public selector, memory or stress acceptance.
import { chromium, expect, test, type BrowserContext, type Page } from "@playwright/test";
import { execFile } from "node:child_process";
import { createHash } from "node:crypto";
import { createReadStream, existsSync } from "node:fs";
import { copyFile, lstat, mkdir, open, readFile, rm, statfs, writeFile } from "node:fs/promises";
import path from "node:path";
import { pathToFileURL } from "node:url";
import { promisify } from "node:util";
import { auditVpxDecoderArtifact } from "../../scripts/lib/vpx-decoder-artifact.mjs";
import { startOwnedProductionTestServer } from "../../scripts/lib/owned-production-test-server.mjs";
import { createOwnedRuntimeScratch, finishOwnedCleanup } from "../../scripts/lib/owned-runtime-scratch.mjs";
import { inspectStressHostMemory } from "../../scripts/lib/host-memory-preflight.mjs";
import { startChromiumMemoryMonitor } from "../../scripts/lib/persistent-chromium-memory.mjs";
import { stableWindow } from "../../scripts/lib/chromium-private-memory.mjs";
import type { VideoConversionOptions } from "../../lib/media-conversion-options";
import type { VpxQualificationResult } from "../../lib/vpx-qualification-job";
import type { StartConversionMessage } from "../../lib/conversion-protocol";

const root = path.resolve(import.meta.dirname, "../.."), exec = promisify(execFile);
const sha = (bytes: Uint8Array) => createHash("sha256").update(bytes).digest("hex");
const hashFile = async (file: string) => { const hash = createHash("sha256");
  for await (const chunk of createReadStream(file)) hash.update(chunk); return hash.digest("hex"); };
const reportFile = path.join(root, `output/playwright/vpx-decoder-qualification-${new Date().toISOString().replaceAll(":", "-")}.json`);
const rows: Array<Record<string, unknown>> = [], forbiddenRequests: string[] = [];
const logs: string[] = [], workerEvents: Array<{ type: string; url: string; at: number }> = [];
const report: Record<string, unknown> = { scope: "private-production-coordinator-CPU-decode-and-MPEG4-encode-small-fixtures",
  publicAcceptance: false, uiPlannerCoverage: false, scalingCoverage: false, headedCoverage: false,
  primaryIncrementalPrivateMiB: null, memoryAcceptance: false,
  memoryLimitation: "This correctness gate does not measure the required same-instance whole-tree private-memory baseline/peak; Wasm metrics cannot replace it.", rows };
let runtime: Awaited<ReturnType<typeof createOwnedRuntimeScratch>> | undefined;
let server: Awaited<ReturnType<typeof startOwnedProductionTestServer>> | undefined;
let context: BrowserContext | undefined, page: Page;
let env: NodeJS.ProcessEnv, assetIdentity: Awaited<ReturnType<typeof lstat>> | undefined;
let audit: Awaited<ReturnType<typeof auditVpxDecoderArtifact>>;
let validationTarget: Awaited<ReturnType<typeof open>> | undefined;
let monitor: Awaited<ReturnType<typeof startChromiumMemoryMonitor>> | undefined;
let monitorTimer: ReturnType<typeof setInterval> | undefined, monitorBusy = false;
let pendingSample = Promise.resolve(), monitorFailure: unknown, blankBaseline: { privateBytes: number } | undefined;
const phases = [{ phase: "blank", at: Date.now() }];
const samples: Array<{ privateBytes: number | null; rssBytes: number | null; phase: string; timestamp: string; elapsedMs: number }> = [];
const pause = (ms: number) => new Promise(resolve => setTimeout(resolve, ms));
const phase = (value: string) => phases.push({ phase: value, at: Date.now() });
async function drainMemory() {
  if (!monitor) return;
  const batch = await monitor.drain(); expect(samples.length + batch.samples.length).toBeLessThanOrEqual(6000);
  for (const sample of batch.samples) samples.push({ ...sample,
    phase: phases.findLast(value => value.at <= Date.parse(sample.timestamp))?.phase ?? "unavailable",
    elapsedMs: Date.parse(sample.timestamp) - phases[0].at });
}
const assetDirectory = path.join(root, "dist/client/engines/vpx");
const controls: VideoConversionOptions = { codec: "mpeg4", maxWidth: 320, bitRateBps: 4_000_000, frameRateFps: 15, quality: "balanced" };
const native = (args: string[], executable = "ffmpeg") => exec(executable, args,
  { cwd: root, env, windowsHide: true, timeout: 120_000, maxBuffer: 4 * 1024 ** 2 });
const probe = async (file: string) => JSON.parse((await native(["-v", "error", "-count_frames", "-show_streams", "-show_format", "-of", "json", file], "ffprobe")).stdout) as {
  streams: Array<{ codec_type: string; codec_name: string; width?: number; height?: number; nb_read_frames?: string; tags?: Record<string, string> }>;
  format: { duration: string; tags: Record<string, string> };
};
test.skip(process.env.WITHIN_PRIVATE_VPX_QUALIFICATION !== "1",
  "Private native candidate requires explicit playwright.vpx.config.ts; not a public support gate");

test.beforeAll(async () => {
  test.setTimeout(240_000);
  // Guard INSIDE setup, before builds, runtime, profile or browser creation.
  if (process.platform === "win32") {
    report.hostMemory = await inspectStressHostMemory();
    expect((report.hostMemory as { safeToStart: boolean }).safeToStart, "Keep the2GiB physical+virtual safety guard").toBe(true);
  } else {
    const memory = await readFile("/proc/meminfo", "utf8");
    const physical = Number(/^MemAvailable:\s+(\d+) kB$/m.exec(memory)?.[1]) * 1024;
    const swap = Number(/^SwapFree:\s+(\d+) kB$/m.exec(memory)?.[1]) * 1024;
    expect(Number.isFinite(physical) && Number.isFinite(swap) && physical >= 2 * 1024 ** 3).toBe(true);
    report.hostMemory = { freePhysicalBytes: physical, freeVirtualBytes: physical + swap, safeToStart: true };
  }
  const disk = await statfs(root); expect(disk.bavail * disk.bsize).toBeGreaterThanOrEqual(2 * 1024 ** 3);
  audit = await auditVpxDecoderArtifact(process.env.WITHIN_VPX_CANDIDATE_DIRECTORY ?? path.join(root, "work/vpx-decoders-39523641019")); report.artifact = audit;
  runtime = await createOwnedRuntimeScratch("vd-");
  env = { ...runtime.env, WRANGLER_SEND_METRICS: "false", NEXT_TELEMETRY_DISABLED: "1",
    NODE_OPTIONS: [process.env.NODE_OPTIONS ?? "", "--import=" + pathToFileURL(path.join(root, "scripts/lib/hidden-unit-subprocesses.mjs")).href].filter(Boolean).join(" ") };
  if (process.platform === "linux") expect(Buffer.byteLength(path.join(runtime.directory, "org.chromium.Chromium.XXXXXX", "SingletonSocket"))).toBeLessThan(108);
  await exec(process.execPath, ["node_modules/vinext/dist/cli.js", "build"],
    { cwd: root, env, windowsHide: true, timeout: 180_000, maxBuffer: 4 * 1024 ** 2 });
  await mkdir(assetDirectory); assetIdentity = await lstat(assetDirectory);
  for (const [file, hash] of Object.entries(audit.deliveredArtifacts)) {
    await copyFile(path.join(audit.directory, file), path.join(assetDirectory, file));
    expect(sha(await readFile(path.join(assetDirectory, file)))).toBe(hash);
  }
  for (const codec of ["vp8", "vp9"]) {
    await native(["-v", "error", "-f", "lavfi", "-i", "testsrc2=size=480x270:rate=24:duration=2",
      "-f", "lavfi", "-i", "sine=frequency=997:sample_rate=48000:duration=2", "-map", "0:v", "-map", "1:a",
      "-c:v", codec === "vp8" ? "libvpx" : "libvpx-vp9", "-deadline", "good", "-cpu-used", "4", "-threads:v", "1",
      "-b:v", "0", "-crf", "4", "-c:a", "aac", "-b:a", "128k", "-metadata", "title=VPX café 音楽",
      "-metadata:s:a:0", "language=eng", "-fflags", "+bitexact", "-flags:v", "+bitexact", "-flags:a", "+bitexact",
      path.join(runtime.directory, codec + ".mkv")]);
  }
  server = await startOwnedProductionTestServer({ root, directory: runtime.directory, env, port: 3231 });
  for (const [file, hash] of Object.entries(audit.deliveredArtifacts)) {
    const response = await fetch(server.baseURL + "/engines/vpx/" + file);
    expect(response.status).toBe(200); expect(sha(new Uint8Array(await response.arrayBuffer()))).toBe(hash); // Static tool asset, never media.
  }
  const installed = "C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe";
  context = await chromium.launchPersistentContext(path.join(runtime.directory, "profile"), {
    executablePath: process.platform === "win32" && existsSync(installed) ? installed : chromium.executablePath(),
    headless: true, env, serviceWorkers: "block" });
  report.browserVersion = context.browser()?.version() ?? null;
  page = context.pages()[0] ?? await context.newPage();
  await page.exposeFunction("receiveVpxValidationChunk", async (chunk: number[]) => {
    expect(Array.isArray(chunk) && chunk.length > 0 && chunk.length <= 65536).toBe(true);
    expect(validationTarget, "No validation destination is active").toBeTruthy(); await validationTarget!.write(Buffer.from(chunk));
  });
  if (process.platform === "win32") {
    const session = await context.browser()!.newBrowserCDPSession();
    const info = await session.send("SystemInfo.getProcessInfo"); await session.detach();
    const rootPid = info.processInfo.find(entry => entry.type === "browser")?.id;
    expect(rootPid).toBeTruthy(); monitor = await startChromiumMemoryMonitor(rootPid!, runtime.directory, 100);
    const observations: typeof samples = [], stable: Array<{ privateBytes: number }> = [];
    for (let attempt = 0; attempt < 20; attempt++) {
      await pause(2100); await drainMemory(); observations.push(samples.at(-1)!);
      const window = stableWindow(observations, 8000); if (window) stable.push(window);
      if (stable.length >= 2) break;
    }
    expect(stable.length, "Stable same-instance clean blank baseline required").toBeGreaterThanOrEqual(2);
    blankBaseline = stable.reduce((lower, next) => next.privateBytes < lower.privateBytes ? next : lower);
    report.blankBaseline = blankBaseline;
    monitorTimer = setInterval(() => { if (monitorBusy) return; monitorBusy = true;
      pendingSample = drainMemory().catch(error => { monitorFailure ??= error; }).finally(() => { monitorBusy = false; }); }, 500);
  }
  await context.route("**/*", async route => {
    const request = route.request(), url = new URL(request.url());
    const invalid = url.origin !== server!.baseURL || !["GET", "HEAD"].includes(request.method()) || request.postData() !== null || /(?:vp8|vp9)\.mkv/.test(url.href);
    if (invalid) { if (forbiddenRequests.length < 32) forbiddenRequests.push(request.method() + " " + url.href.slice(0, 256)); await route.abort(); }
    else await route.continue();
  });
  page.on("console", message => { if (logs.length === 32) logs.shift(); logs.push(message.type() + ":" + message.text().slice(0, 512)); });
  page.on("pageerror", error => { if (logs.length === 32) logs.shift(); logs.push("pageerror:" + error.message.slice(0, 512)); });
  page.on("worker", worker => {
    const record = (type: string) => { if (workerEvents.length === 64) workerEvents.shift(); workerEvents.push({ type, url: worker.url(), at: Date.now() }); };
    record("created"); worker.on("close", () => record("closed"));
  });
  phase("loaded");
  const response = await page.goto(server.baseURL + "/?test=1"); expect(response?.status()).toBe(200);
  const headers = response!.headers(); expect(headers["cross-origin-opener-policy"]).toBe("same-origin");
  expect(headers["cross-origin-embedder-policy"]).toBe("require-corp"); expect(headers["content-security-policy"]).toBeTruthy();
  await page.waitForFunction(() => window.__WITHIN_TEST__?.getState().workerStatus === "ready");
  expect(await page.evaluate(async () => { const names = []; for await (const [name] of (await navigator.storage.getDirectory()).entries()) names.push(name); return names; })).toEqual([]);
});

async function run(codec: "vp8" | "vp9", options?: VideoConversionOptions, fault?: "write", preCancelled = false, wrongProfile = false) {
  const source = path.join(runtime!.directory, codec + ".mkv");
  await page.locator('input[type="file"]').first().setInputFiles(source);
  await page.waitForFunction(() => window.__WITHIN_TEST__?.getState().workerStatus === "ready" && window.__WITHIN_TEST__?.getState().jobState !== "running");
  const eventStart = workerEvents.length;
  phase("conversion-" + codec);
  const result = await page.evaluate(async ({ codec, options, fault, preCancelled, wrongProfile }) => {
    const file = document.querySelector<HTMLInputElement>('input[type="file"]')!.files![0];
    const directory = await navigator.storage.getDirectory(), outputName = "vpx-qualification-output.mp4";
    const handle = await directory.getFileHandle(outputName, { create: true });
    const jobId = crypto.randomUUID(), profileId = `mkv-${wrongProfile ? "vp9" : codec}-to-mp4-mpeg4`, cancellationBuffer = new SharedArrayBuffer(4);
    if (preCancelled) Atomics.store(new Int32Array(cancellationBuffer), 0, 1);
    let timer: ReturnType<typeof setTimeout> | undefined;
    try {
      const bridge = window.__WITHIN_TEST__ as unknown as { runQualificationJob(request: StartConversionMessage): Promise<VpxQualificationResult> };
      return await Promise.race([bridge.runQualificationJob({ type: "start", jobId, profileId, file,
        videoOptions: options, testFault: fault, cancellationBuffer,
        destination: { mode: "staged-handle", handle, stagingName: `within-stage-${profileId}-${jobId}` } }),
      new Promise<never>((_, reject) => { timer = setTimeout(() => { Atomics.store(new Int32Array(cancellationBuffer), 0, 1); reject(new Error("Private VPX job exceeded60s")); }, 60_000); })]);
    } finally { clearTimeout(timer); }
  }, { codec, options, fault, preCancelled, wrongProfile }) as VpxQualificationResult;
  phase("recovery");
  rows.push({ codec, options: options ?? "automatic", fault: fault ?? null, preCancelled, wrongProfile, sourceBytes: (await lstat(source)).size,
    sourceSha256: await hashFile(source), result, workerEvents: workerEvents.slice(eventStart) });
  return { result, source, events: workerEvents.slice(eventStart) };
}

async function validate(codec: "vp8" | "vp9", options?: VideoConversionOptions) {
  const { result, source, events } = await run(codec, options);
  expect(result.type, JSON.stringify(result)).toBe("complete");
  expect(result.phases).toContain(`Decoding ${codec.toUpperCase()} (CPU) / encoding MPEG-4 MP4`);
  expect(result.phases).toContain("Copying staged MP4 to selected destination");
  const nativeMetrics = result.nativeMetrics!; expect(nativeMetrics).toBeTruthy();
  expect(nativeMetrics.wasmMemoryBytes).toBeGreaterThanOrEqual(32 * 1024 ** 2);
  expect(nativeMetrics.wasmMemoryBytes).toBeLessThanOrEqual(96 * 1024 ** 2);
  expect(nativeMetrics.maxReadChunkBytes).toBeLessThanOrEqual(262144); expect(nativeMetrics.maxWriteChunkBytes).toBeLessThanOrEqual(262144);
  expect(nativeMetrics.peakQueuedBytes).toBeLessThanOrEqual(262144); expect(nativeMetrics.peakPendingOperations).toBe(1);
  expect(result.metrics.wasmMemoryBytes).toBe(0); expect(result.metrics.scratchBytes).toBe(0);
  expect(result.metrics.peakWasmMemoryBytes).toBeLessThanOrEqual(96 * 1024 ** 2);
  expect(result.metrics.maxWriteChunkBytes).toBeLessThanOrEqual(524288); expect(result.metrics.peakQueuedBytes).toBeLessThanOrEqual(524288);
  expect(result.metrics.pendingOperations).toBe(0); expect(result.metrics.peakPendingOperations).toBe(1);
  const retired = events.find(event => event.type === "closed" && event.url.includes("conversion.worker"));
  const saver = events.find(event => event.type === "created" && event.url.includes("staged-save.worker"));
  expect(retired).toBeTruthy(); expect(saver).toBeTruthy(); expect(retired!.at).toBeLessThanOrEqual(saver!.at);
  const output = path.join(runtime!.directory, "validation.mp4"), target = await open(output, "wx");
  validationTarget = target; phase("independent-validation");
  try {
      await page.evaluate(async () => {
        const directory = await navigator.storage.getDirectory(), handle = await directory.getFileHandle("vpx-qualification-output.mp4");
        const reader = (await handle.getFile()).stream().getReader({ mode: "byob" }); let buffer = new Uint8Array(65536);
        try { for (;;) { const { done, value } = await reader.read(buffer); if (done) break;
          await (window as unknown as { receiveVpxValidationChunk(chunk: number[]): Promise<void> }).receiveVpxValidationChunk(Array.from(value)); buffer = new Uint8Array(value.buffer); } }
        finally { await reader.cancel(); }
      });
    await target.close();
    const original = await probe(source), converted = await probe(output);
    rows.push({ codec, options: options ?? "automatic", sourceProbe: original, outputProbe: converted });
    const fps = options ? 15 : 24, frames = options ? 30 : 48;
    expect(original.streams.find(stream => stream.codec_type === "video")!.codec_name).toBe(codec);
    expect(converted.streams.map(stream => stream.codec_name)).toEqual(["mpeg4", "aac"]);
    expect(Number(converted.streams[0].nb_read_frames)).toBe(frames);
    expect(converted.streams[0].width).toBe(options ? 320 : 480); expect(converted.streams[0].height).toBe(options ? 180 : 270);
    expect(converted.streams[1].tags?.language).toBe("eng"); expect(converted.format.tags.title).toBe(original.format.tags.title);
    expect(Math.abs(Number(converted.format.duration) - Number(original.format.duration))).toBeLessThan(0.08);
    await native(["-v", "error", "-xerror", "-i", output, "-f", "null", "-"]);
    const audioHash = async (file: string) => (await native(["-v", "error", "-i", file, "-map", "0:a", "-c", "copy", "-f", "streamhash", "-hash", "sha256", "pipe:1"])).stdout.trim();
    expect(await audioHash(output)).toBe(await audioHash(source));
    const selection = options ? "select='eq(n,0)+gt(floor(n*15/24),floor((n-1)*15/24))',scale=320:180:flags=bilinear," : "";
    const comparison = await native(["-v", "info", "-i", source, "-i", output, "-filter_complex",
      `[0:v:0]${selection}settb=1/1,setpts=N[ref];[1:v:0]settb=1/1,setpts=N[out];[ref][out]ssim`, "-an", "-f", "null", "-"]);
    const ssim = Number(/All:([0-9.]+)/.exec(comparison.stderr)?.[1]); expect(ssim).toBeGreaterThanOrEqual(0.98);
    const timing = JSON.parse((await native(["-v", "error", "-select_streams", "v:0", "-show_frames", "-show_entries", "frame=best_effort_timestamp_time", "-of", "json", output], "ffprobe")).stdout) as { frames: Array<{ best_effort_timestamp_time: string }> };
    expect(timing.frames.length).toBe(frames);
    for (let i = 1; i < frames; i++) expect(Math.abs(Number(timing.frames[i].best_effort_timestamp_time) - Number(timing.frames[i - 1].best_effort_timestamp_time) - 1 / fps)).toBeLessThan(0.001);
    rows.push({ codec, options: options ?? "automatic", independentValidation: { fullDecode: true, frames, fps, ssim, audioPacketsIdentical: true,
      sourceBytes: (await lstat(source)).size, outputBytes: (await lstat(output)).size, outputSha256: await hashFile(output) } });
  } finally { validationTarget = undefined; await target.close().catch(() => {}); await rm(output, { force: true }); }
}

for (const codec of ["vp8", "vp9"] as const) {
  test(`genuine CPU ${codec} decode to MPEG4 with default settings`, async () => validate(codec));
  test(`genuine CPU ${codec} decode preserves nondefault12-argument video controls`, async () => validate(codec, controls));
}
test("mismatched source rejected before encoding", async () => {
  const { result } = await run("vp8", undefined, undefined, false, true);
  expect(result.type).toBe("error"); if (result.type === "error") expect(result.message).toContain("matching VP8 or VP9");
  expect(result.nativeMetrics).toBeNull();
});
test("pre-cancelled job cleans up without claiming mid-conversion cancellation coverage", async () => {
  expect((await run("vp8", undefined, undefined, true)).result.type).toBe("cancelled");
});
test("bounded selected-destination write failure aborts and removes stage", async () => {
  const { result } = await run("vp9", undefined, "write");
  expect(result.type).toBe("error"); if (result.type === "error") expect(result.message).toContain("rejected a bounded write");
  expect(result.metrics.scratchBytes).toBe(0); expect(result.metrics.pendingOperations).toBe(0);
});
test("real conversion recovers after rejection, pre-cancel and destination failure", async () => validate("vp8"));
test("complete same-instance Chromium tree remains within250MiB over clean blank", async () => {
  test.skip(process.platform !== "win32", "Primary Windows private-memory sampler unavailable here; correctness is not memory acceptance");
  clearInterval(monitorTimer); await pendingSample; await drainMemory();
  expect(monitorFailure).toBeUndefined(); expect(blankBaseline).toBeTruthy();
  const active = samples.filter(sample => sample.phase !== "blank" && sample.privateBytes !== null);
  expect(active.length).toBeGreaterThan(0);
  const peak = Math.max(...active.map(sample => sample.privateBytes!));
  const incrementalPrivateMiB = (peak - blankBaseline!.privateBytes) / 1048576;
  report.primaryIncrementalPrivateMiB = incrementalPrivateMiB; report.memoryAcceptance = incrementalPrivateMiB <= 250;
  report.memoryLimitation = "Small private backend qualification only; not large-file, final planner/UI or public profile acceptance.";
  expect(incrementalPrivateMiB, "All Chromium descendants count; no heap substitution, GC or loaded baseline subtraction").toBeLessThanOrEqual(250);
});

test.afterEach(async ({}, testInfo) => {
  rows.push({ test: testInfo.title, status: testInfo.status, error: testInfo.error?.message?.slice(0, 2048) ?? null });
  if (!page || page.isClosed()) return;
  const names = await page.evaluate(async () => {
    const directory = await navigator.storage.getDirectory(), names: string[] = [];
    for await (const [name] of directory.entries()) names.push(name);
    const stages = names.filter(name => name.startsWith("within-stage-mkv-vp"));
    try { await directory.removeEntry("vpx-qualification-output.mp4"); } catch (error) { if (!(error instanceof DOMException && error.name === "NotFoundError")) throw error; }
    // Failed cleanup is an assertion, not swept away and called successful.
    return stages;
  });
  expect(names, "production terminal paths must remove their own stages").toEqual([]);
  expect(forbiddenRequests).toEqual([]);
});
test.afterAll(async () => {
  const cleanup: Array<() => Promise<unknown>> = [];
  if (assetIdentity) cleanup.push(async () => {
    const current = await lstat(assetDirectory); expect(current.dev).toBe(assetIdentity!.dev); expect(current.ino).toBe(assetIdentity!.ino);
    for (const [file, hash] of Object.entries(audit.deliveredArtifacts)) expect(sha(await readFile(path.join(assetDirectory, file)))).toBe(hash);
    await rm(assetDirectory, { recursive: true });
  });
  if (runtime) cleanup.push(() => runtime!.close());
  try {
    clearInterval(monitorTimer); await pendingSample;
    await finishOwnedCleanup([
      async () => { if (monitor) { await drainMemory(); await monitor.close(); monitor = undefined; } },
      async () => { if (context) { await context.close(); context = undefined; } },
      async () => { if (server) { report.serverCleanup = await server.close(); server = undefined; } },
    ]);
    await finishOwnedCleanup(cleanup); report.disposableDataRemoved = true;
  }
  finally { report.logs = logs; report.forbiddenRequests = forbiddenRequests; report.workerEvents = workerEvents;
    report.memorySamples = samples; report.monitorFailure = monitorFailure ? String(monitorFailure).slice(0, 2048) : null;
    await mkdir(path.dirname(reportFile), { recursive: true }); await writeFile(reportFile, JSON.stringify(report, null, 2) + "\n"); }
});
