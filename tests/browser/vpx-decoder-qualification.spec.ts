// Private backend qualification, not public selector or large-file/stress acceptance.
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
import { sampleChromiumTree, stableWindow } from "../../scripts/lib/chromium-private-memory.mjs";
import { annotateNativeProcessTypes, connectPlaywrightRealmSampler } from "../../scripts/lib/chromium-attribution.mjs";
import { captureLiveMemoryInfra } from "../../scripts/lib/live-memory-infra.mjs";
import { inspectInstalledChromePin, assertInstalledChromePinsEqual } from "../../scripts/lib/installed-chrome-pin.mjs";
import type { VideoConversionOptions } from "../../lib/media-conversion-options";
import type { VpxQualificationResult } from "../../lib/vpx-qualification-job";
import type { StartConversionMessage } from "../../lib/conversion-protocol";
import { validateSmallCopiedAac } from "../../scripts/lib/small-aac-copy-fidelity.mjs";
import { encodeBoundedValidationChunk, decodeBoundedValidationChunk } from "../../scripts/lib/bounded-validation-chunk.mjs";
import { createBoundedPeriodicRealmObserver } from "../../scripts/lib/bounded-periodic-realm-observer.mjs";

const root = path.resolve(import.meta.dirname, "../.."), exec = promisify(execFile);
const sha = (bytes: Uint8Array) => createHash("sha256").update(bytes).digest("hex");
const hashFile = async (file: string) => { const hash = createHash("sha256");
  for await (const chunk of createReadStream(file)) hash.update(chunk); return hash.digest("hex"); };
const reportFile = path.join(root, `output/playwright/vpx-decoder-qualification-${new Date().toISOString().replaceAll(":", "-")}.json`);
const rows: Array<Record<string, unknown>> = [], forbiddenRequests: string[] = [];
const validationTransport = { mode: "one-base64-string-per-at-most64KiB-chunk-not-whole-file-base64", chunks: 0,
  totalDecodedBytes: 0, maximumDecodedChunkBytes: 0, maximumEncodedCharacters: 0, pending: 0, peakPending: 0,
  fileDataOverHttp: false, completeOutputBuffered: false };
const logs: string[] = [], workerEvents: Array<{ type: string; url: string; at: number }> = [];
const report: Record<string, unknown> = { scope: "private-production-coordinator-CPU-decode-and-MPEG4-encode-small-fixtures",
  publicAcceptance: false, uiPlannerCoverage: false, scalingCoverage: false, headedCoverage: false,
  primaryIncrementalPrivateMiB: null, memoryAcceptance: false,
  memoryLimitation: "Primary memory gate not yet completed. The Windows sampler is unavailable on other platforms; Wasm metrics cannot replace it.", rows };
let runtime: Awaited<ReturnType<typeof createOwnedRuntimeScratch>> | undefined;
let server: Awaited<ReturnType<typeof startOwnedProductionTestServer>> | undefined;
let context: BrowserContext | undefined, page: Page;
let browserLaunched = false;
let conversionOrdinal = 0;
const staticCompilation = { coldCompiles: 0, reuses: 0 };
let env: NodeJS.ProcessEnv, assetIdentity: Awaited<ReturnType<typeof lstat>> | undefined;
let audit: Awaited<ReturnType<typeof auditVpxDecoderArtifact>>;
let browserPin: Awaited<ReturnType<typeof inspectInstalledChromePin>> | undefined;
const sourcePins: Record<string, string> = {};
let validationTarget: Awaited<ReturnType<typeof open>> | undefined;
let monitor: Awaited<ReturnType<typeof startChromiumMemoryMonitor>> | undefined;
let monitorTimer: ReturnType<typeof setInterval> | undefined, monitorBusy = false;
let pendingSample = Promise.resolve(), monitorFailure: unknown, blankBaseline: { privateBytes: number } | undefined;
const diagnoseAllocations = process.env.WITHIN_VPX_ALLOCATION_DIAGNOSTIC === "1";
report.allocationDiagnostics = { enabled: diagnoseAllocations, checkpointLimit: 8, targetLimit: 16,
  pendingCdpLimit: 64, maximumCdpReplyBytes: 1048576, maximumLightTraceBytes: 8388608,
  postMeasurementDumpOnly: true, forcedGc: false, processTreeFormulaChanged: false };
let browserRootPid: number | undefined;
let realmSampler: Awaited<ReturnType<typeof connectPlaywrightRealmSampler>> | undefined;
let realmObserver: ReturnType<typeof createBoundedPeriodicRealmObserver> | undefined;
const attribution = { scope: "Up to8 bounded process/realm checkpoints, not exact heap peaks or replacement private bytes",
  references: [] as Array<Record<string, unknown>>, realms: [] as Array<Record<string, unknown>> };
async function captureAttribution(label: string) {
  if (!diagnoseAllocations || !realmSampler || !browserRootPid || attribution.references.length >= 8) return;
  const startedAt = new Date().toISOString();
  const [os, realms] = await Promise.allSettled([sampleChromiumTree(browserRootPid), realmObserver!.observe()]);
  attribution.references.push({ label, startedAt, completedAt: new Date().toISOString(),
    tree: os.status === "fulfilled" ? os.value : null, error: os.status === "rejected" ? String(os.reason).slice(0, 512) : null });
  attribution.realms.push({ label, startedAt, completedAt: new Date().toISOString(),
    observation: realms.status === "fulfilled" ? realms.value : null, error: realms.status === "rejected" ? String(realms.reason).slice(0, 512) : null });
}
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
const probe = async (file: string) => JSON.parse((await native(["-v", "error", "-count_frames", "-show_streams", "-show_format", "-show_chapters", "-of", "json", file], "ffprobe")).stdout) as {
  streams: Array<{ codec_type: string; codec_name: string; width?: number; height?: number; nb_read_frames?: string; tags?: Record<string, string> }>;
  format: { duration: string; tags: Record<string, string> };
  chapters: Array<{ start_time: string; end_time: string; tags: Record<string, string> }>;
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
  audit = await auditVpxDecoderArtifact(process.env.WITHIN_VPX_CANDIDATE_DIRECTORY ?? path.join(root, "work/vpx-chapter-end-39623553380")); report.artifact = audit;
  for (const file of ["app/converter/ConverterApp.tsx", "workers/conversion.worker.ts", "workers/media-remux.ts", "workers/vpx-core-loader.ts",
    "workers/random-access-destination.ts", "workers/staged-save.worker.ts", "workers/staged-save-runtime.ts", "lib/staged-worker-coordinator.ts",
    "lib/staged-copy-protocol.ts", "lib/vpx-decoder-policy.ts", "lib/media-native-arguments.ts", "lib/vpx-qualification-job.ts",
    "tests/browser/vpx-decoder-qualification.spec.ts", "scripts/lib/vpx-decoder-artifact.mjs", "scripts/lib/vpx-postbuild-recovery.mjs", "scripts/lib/owned-production-test-server.mjs",
    "scripts/lib/persistent-chromium-memory.mjs", "scripts/lib/chromium-private-memory.mjs", "scripts/lib/windows-tree-monitor.ps1",
    "scripts/lib/small-aac-copy-fidelity.mjs", "scripts/lib/pcm-prefix-diagnostic.mjs", "scripts/lib/copied-audio-timing.mjs",
    "scripts/lib/small-mp4-sample-duration.mjs", "scripts/lib/chromium-attribution.mjs", "scripts/lib/cdp-realm-memory.mjs",
    "scripts/lib/live-memory-infra.mjs", "scripts/lib/memory-infra-attribution.mjs", "lib/browser-capabilities.ts",
    "scripts/lib/bounded-validation-chunk.mjs", "scripts/lib/bounded-periodic-realm-observer.mjs",
    "lib/vpx-compiled-core.ts", "lib/conversion-protocol.ts"])
    sourcePins[file] = sha(await readFile(path.join(root, file)));
  report.executedSourcePins = sourcePins;
  if (process.platform === "win32") { browserPin = await inspectInstalledChromePin(); report.browserPin = browserPin; }
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
  if (process.platform === "win32") expect(await hashFile(path.join(runtime.directory, "vp8.mkv")),
    "Keep the actual AAC-loss reproduction input identical for the changed-core comparison").toBe("6e2baa02fe7d9469a2bd84dc516caa995a697eead2ad9f23eb3de2ecd2c74ab9");
  const chapterMetadata = path.join(runtime.directory, "chapters.ffmetadata");
  await writeFile(chapterMetadata, ";FFMETADATA1\n[CHAPTER]\nTIMEBASE=1/1000\nSTART=500\nEND=1500\ntitle=VPX chapitre café\n");
  await native(["-v", "error", "-i", path.join(runtime.directory, "vp8.mkv"), "-f", "lavfi", "-i", "sine=frequency=440:sample_rate=48000:duration=2",
    "-f", "ffmetadata", "-i", chapterMetadata, "-map", "0:v", "-map", "0:a", "-map", "1:a", "-map_metadata", "0", "-map_chapters", "2",
    "-c", "copy", "-c:a:1", "aac", "-b:a:1", "128k", "-metadata:s:a:0", "language=eng", "-metadata:s:a:1", "language=hin",
    "-fflags", "+bitexact", "-flags:a", "+bitexact", path.join(runtime.directory, "vp8-multi.mkv")]);
  server = await startOwnedProductionTestServer({ root, directory: runtime.directory, env, port: 3231 });
  for (const [file, hash] of Object.entries(audit.deliveredArtifacts)) {
    const response = await fetch(server.baseURL + "/engines/vpx/" + file);
    expect(response.status).toBe(200); expect(sha(new Uint8Array(await response.arrayBuffer()))).toBe(hash); // Static tool asset, never media.
  }
  const installed = "C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe";
  context = await chromium.launchPersistentContext(path.join(runtime.directory, "profile"), {
    executablePath: browserPin?.launcher.path ?? (process.platform === "win32" && existsSync(installed) ? installed : chromium.executablePath()),
    headless: true, env, serviceWorkers: "block" });
  browserLaunched = true;
  report.browserVersion = context.browser()?.version() ?? null;
  page = context.pages()[0] ?? await context.newPage();
  await context.addInitScript({ content: "Object.defineProperty(globalThis, '__WITHIN_ENCODE_VALIDATION_CHUNK__', { value: (" + encodeBoundedValidationChunk.toString() + ") });" });
  await page.exposeFunction("receiveVpxValidationChunk", async (chunk: string) => {
    const bytes = decodeBoundedValidationChunk(chunk);
    expect(validationTarget, "No validation destination is active").toBeTruthy();
    expect(validationTransport.pending).toBe(0); validationTransport.pending = 1; validationTransport.peakPending = 1;
    try {
      await validationTarget!.write(bytes); validationTransport.chunks++; validationTransport.totalDecodedBytes += bytes.length;
      validationTransport.maximumDecodedChunkBytes = Math.max(validationTransport.maximumDecodedChunkBytes, bytes.length);
      validationTransport.maximumEncodedCharacters = Math.max(validationTransport.maximumEncodedCharacters, chunk.length);
    } finally { validationTransport.pending = 0; }
  });
  if (process.platform === "win32") {
    const session = await context.browser()!.newBrowserCDPSession();
    const info = await session.send("SystemInfo.getProcessInfo"); await session.detach();
    browserRootPid = info.processInfo.find(entry => entry.type === "browser")?.id;
    expect(browserRootPid).toBeTruthy(); monitor = await startChromiumMemoryMonitor(browserRootPid!, runtime.directory, 100);
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
    if (diagnoseAllocations) {
      realmSampler = await connectPlaywrightRealmSampler(context.browser()!, server.baseURL);
      realmObserver = createBoundedPeriodicRealmObserver({ sample: () => realmSampler!.sample(), readPhase: () => phases.at(-1)!.phase });
      await captureAttribution("stable-blank");
      realmObserver.start();
    }
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
  await captureAttribution("loaded-ready");
});

async function run(codec: "vp8" | "vp9", options?: VideoConversionOptions, fault?: "write", preCancelled = false, wrongProfile = false, multi = false) {
  const source = path.join(runtime!.directory, codec + (multi ? "-multi" : "") + ".mkv");
  await page.locator('input[type="file"]').first().setInputFiles(source);
  await page.waitForFunction(() => window.__WITHIN_TEST__?.getState().workerStatus === "ready" && window.__WITHIN_TEST__?.getState().jobState !== "running");
  await captureAttribution("before-conversion-" + (conversionOrdinal + 1));
  const eventStart = workerEvents.length;
  const ordinal = ++conversionOrdinal, startedAt = Date.now(), conversionPhase = "conversion-" + codec + "-" + ordinal;
  phase(conversionPhase);
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
  const endedAt = Date.now(); phase("recovery");
  rows.push({ codec, multi, options: options ?? "automatic", fault: fault ?? null, preCancelled, wrongProfile, sourceBytes: (await lstat(source)).size,
    sourceSha256: await hashFile(source), conversionWindow: { ordinal, startedAt, endedAt, phase: conversionPhase }, result, workerEvents: workerEvents.slice(eventStart) });
  if (result.phases.includes("Compiled VPX code")) {
    staticCompilation.coldCompiles++;
    expect(staticCompilation.coldCompiles, "Same pinned asset must survive actual app coordinator replacement").toBe(1);
  }
  if (result.phases.includes("Reusing compiled VPX code")) {
    expect(staticCompilation.coldCompiles).toBe(1); staticCompilation.reuses++;
  }
  await captureAttribution("after-conversion-" + ordinal);
  return { result, source, events: workerEvents.slice(eventStart) };
}

async function validate(codec: "vp8" | "vp9", options?: VideoConversionOptions, multi = false) {
  const { result, source, events } = await run(codec, options, undefined, false, false, multi);
  expect(result.type, JSON.stringify(result)).toBe("complete");
  expect(result.phases).toContain(`Decoding ${codec.toUpperCase()} (CPU) / encoding MPEG-4 MP4`);
  expect(result.phases.some(phase => phase === "Compiled VPX code" || phase === "Reusing compiled VPX code"),
    "Actual private factory must report observed cold compilation or code reuse").toBe(true);
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
          const bridge = window as unknown as { __WITHIN_ENCODE_VALIDATION_CHUNK__(chunk: Uint8Array): string; receiveVpxValidationChunk(chunk: string): Promise<void> };
          await bridge.receiveVpxValidationChunk(bridge.__WITHIN_ENCODE_VALIDATION_CHUNK__(value)); buffer = new Uint8Array(value.buffer); } }
        finally { await reader.cancel(); }
      });
    await target.close();
    const original = await probe(source), converted = await probe(output);
    rows.push({ codec, options: options ?? "automatic", sourceProbe: original, outputProbe: converted });
    const fps = options ? 15 : 24, frames = options ? 30 : 48;
    expect(original.streams.find(stream => stream.codec_type === "video")!.codec_name).toBe(codec);
    if (multi) {
      // Preserve bounded independent mux/edit-list evidence BEFORE a chapter
      // assertion fails. This is diagnosis, never permission to retime chapters.
      const trace = await native(["-v", "trace", "-show_chapters", "-of", "json", output], "ffprobe");
      const chapterTrace = trace.stderr.split(/\r?\n/).filter(line =>
        /type:'(?:elst|chpl|tfdt|tfhd|trun|stts|mdhd|tkhd|chap)'|edit_count|duration=.*time=|Processing st:|time_offset/.test(line));
      rows.push({ codec, multi, chapterDiagnosis: { traceBytes: Buffer.byteLength(trace.stderr),
        matchingLines: chapterTrace.length, lines: chapterTrace.slice(0, 96).map(line => line.slice(0, 512)),
        ignoreEditListProbe: JSON.parse((await native(["-v", "error", "-ignore_editlist", "1", "-show_chapters", "-show_streams", "-of", "json", output], "ffprobe")).stdout),
        assertionToleranceSecondsUnchanged: 0.002, notChapterAcceptance: true } });
      expect(converted.streams.filter(stream => stream.codec_type === "video").map(stream => stream.codec_name)).toEqual(["mpeg4"]);
      expect(converted.streams.filter(stream => stream.codec_type === "audio").map(stream => stream.codec_name)).toEqual(["aac", "aac"]);
      expect(converted.streams.every(stream => ["mpeg4", "aac", "bin_data"].includes(stream.codec_name))).toBe(true);
      expect(converted.streams.filter(stream => stream.codec_type === "audio").map(stream => stream.tags?.language)).toEqual(["eng", "hin"]);
      expect(converted.chapters).toHaveLength(1); expect(converted.chapters[0].tags.title).toBe(original.chapters[0].tags.title);
    } else expect(converted.streams.map(stream => stream.codec_name)).toEqual(["mpeg4", "aac"]);
    expect(Number(converted.streams[0].nb_read_frames)).toBe(frames);
    expect(converted.streams[0].width).toBe(options ? 320 : 480); expect(converted.streams[0].height).toBe(options ? 180 : 270);
    expect(converted.streams[1].tags?.language).toBe("eng"); expect(converted.format.tags.title).toBe(original.format.tags.title);
    expect(Math.abs(Number(converted.format.duration) - Number(original.format.duration))).toBeLessThan(0.08);
    await native(["-v", "error", "-xerror", "-i", output, "-map", "0:v", "-map", "0:a", "-f", "null", "-"]);
    const audioHash = async (file: string) => (await native(["-v", "error", "-i", file, "-map", "0:a", "-c", "copy", "-f", "streamhash", "-hash", "sha256", "pipe:1"])).stdout.trim();
    expect(await audioHash(output)).toBe(await audioHash(source));
    const selection = options ? "select='eq(n,0)+gt(floor(n*15/24),floor((n-1)*15/24))',scale=320:180:flags=bilinear," : "";
    const comparison = await native(["-v", "info", "-i", source, "-i", output, "-filter_complex",
      `[0:v:0]${selection}settb=1/1,setpts=N[ref];[1:v:0]settb=1/1,setpts=N[out];[ref][out]ssim`, "-an", "-f", "null", "-"]);
    const ssim = Number(/All:([0-9.]+)/.exec(comparison.stderr)?.[1]); expect(ssim).toBeGreaterThanOrEqual(0.98);
    const timing = JSON.parse((await native(["-v", "error", "-select_streams", "v:0", "-show_frames", "-show_entries", "frame=best_effort_timestamp_time", "-of", "json", output], "ffprobe")).stdout) as { frames: Array<{ best_effort_timestamp_time: string }> };
    const sourceTiming = JSON.parse((await native(["-v", "error", "-select_streams", "v:0", "-show_frames", "-show_entries", "frame=best_effort_timestamp_time", "-of", "json", source], "ffprobe")).stdout) as { frames: Array<{ best_effort_timestamp_time: string }> };
    expect(sourceTiming.frames.length).toBe(48);
    rows.push({ codec, multi, validationBeforeTimingAssertion: { fullDecode: true, frames, fps, ssim, audioPacketsIdentical: true,
      sourceFrameTimes: sourceTiming.frames, frameTimes: timing.frames } });
    expect(timing.frames.length).toBe(frames);
    for (let i = 1; i < frames; i++) expect(Math.abs(Number(timing.frames[i].best_effort_timestamp_time) - Number(timing.frames[i - 1].best_effort_timestamp_time) - 1 / fps)).toBeLessThan(0.001);
    const decodedAudioHash = async (file: string) => (await native(["-v", "error", "-i", file, "-map", "0:a", "-c:a", "pcm_s16le", "-f", "streamhash", "-hash", "sha256", "pipe:1"])).stdout.trim();
    const sourceDecodedAudio = await decodedAudioHash(source), outputDecodedAudio = await decodedAudioHash(output);
    rows.push({ codec, multi, rawDefaultDecoderComparison: { source: sourceDecodedAudio, output: outputDecodedAudio,
      identical: sourceDecodedAudio === outputDecodedAudio, note: "Retained diagnostic; old Matroska decoder may leave declared priming in these default samples." } });
    for (let audioOrdinal = 0; audioOrdinal < original.streams.filter(stream => stream.codec_type === "audio").length; audioOrdinal++) {
      try {
        const exactAac = await validateSmallCopiedAac(source, output, { env, audioOrdinal });
        rows.push({ codec, multi, exactAacSampleAndTrimValidation: exactAac });
        expect(exactAac.status, "Every track requires exact PCM/packet bytes, declared trim and1ms clocks").toBe("passed-small-AAC-LC-fixture");
      } catch (error) {
        rows.push({ codec, multi, audioOrdinal, aacValidationFailure: String(error).slice(0, 1024),
          aacFixtureEvidence: (error as { aacFixtureEvidence?: unknown }).aacFixtureEvidence ?? null });
        throw error;
      }
    }
    // Keep the original chapter guard. Audio checks precede it so a chapter
    // failure no longer hides whether both original AAC tracks are preserved.
    // Comparing intervals alone misses a constant shift of the entire video.
    for (let i = 0; i < (options ? 1 : frames); i++)
      expect(Math.abs(Number(timing.frames[i].best_effort_timestamp_time) - Number(sourceTiming.frames[i].best_effort_timestamp_time)),
        "Preserve source video timeline, not just regular output intervals").toBeLessThan(0.001);
    if (multi) for (const field of ["start_time", "end_time"] as const)
      expect(Math.abs(Number(converted.chapters[0][field]) - Number(original.chapters[0][field]))).toBeLessThan(0.002);
    rows.push({ codec, options: options ?? "automatic", independentValidation: { fullDecode: true, frames, fps, ssim, audioPacketsIdentical: true,
      sourceBytes: (await lstat(source)).size, outputBytes: (await lstat(output)).size, outputSha256: await hashFile(output) } });
    await captureAttribution("after-validation-" + conversionOrdinal);
  } finally { validationTarget = undefined; await target.close().catch(() => {}); await rm(output, { force: true }); }
}

for (const codec of ["vp8", "vp9"] as const) {
  test(`genuine CPU ${codec} decode to MPEG4 with default settings`, async () => validate(codec));
  test(`genuine CPU ${codec} decode preserves nondefault12-argument video controls`, async () => validate(codec, controls));
}
test("genuine decode retains both compatible audio tracks, their packet hashes/languages and chapter timing", async () => validate("vp8", undefined, true));
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
  if (diagnoseAllocations) {
    // The native baseline/peak are finalized before this perturbing light dump.
    // Every process still counts; allocator counters are never subtracted.
    await realmObserver?.stop(); report.periodicRealmObservations = realmObserver?.report();
    await monitor!.close(); monitor = undefined;
    annotateNativeProcessTypes(samples, attribution.references, browserRootPid);
    report.attribution = attribution;
    try {
      report.postMeasurementAllocators = await captureLiveMemoryInfra({ session: await context!.browser()!.newBrowserCDPSession(),
        phase: "after-conversion-observer-stopped", processes: (attribution.references.at(-1)?.tree as { processes?: unknown[] } | null)?.processes ?? null,
        archivePath: reportFile.replace(/\.json$/, "-post-measurement-memory.json.gz") });
    } catch (error) { report.postMeasurementAllocators = { status: "unavailable", error: String(error).slice(0, 1024), acceptanceMetric: false }; }
  }
  expect(incrementalPrivateMiB, "All Chromium descendants count; no heap substitution, GC or loaded baseline subtraction").toBeLessThanOrEqual(250);
});

test.afterEach(async ({}, testInfo) => {
  rows.push({ test: testInfo.title, status: testInfo.status, error: testInfo.error?.message?.slice(0, 2048) ?? null });
  if (!page || page.isClosed()) return;
  const names = await page.evaluate(async () => {
    const directory = await navigator.storage.getDirectory(), names: string[] = [];
    for await (const [name] of directory.entries()) names.push(name);
    const unexpected = names.filter(name => name !== "vpx-qualification-output.mp4");
    try { await directory.removeEntry("vpx-qualification-output.mp4"); } catch (error) { if (!(error instanceof DOMException && error.name === "NotFoundError")) throw error; }
    // Failed cleanup is an assertion, not swept away and called successful.
    return unexpected;
  });
  expect(names, "production terminal paths must remove their own stages").toEqual([]);
  expect(forbiddenRequests).toEqual([]);
});
test.afterAll(async () => {
  const cleanup: Array<() => Promise<unknown>> = [];
  cleanup.push(async () => {
    for (const [file, hash] of Object.entries(sourcePins)) expect(sha(await readFile(path.join(root, file))), "Executed source changed: " + file).toBe(hash);
    if (browserPin) assertInstalledChromePinsEqual(browserPin, await inspectInstalledChromePin());
    report.executedSourcesVerified = browserLaunched && Object.keys(sourcePins).length === 32;
    report.installedChromeBinaryPinsVerified = browserPin ? true : null;
    report.executedSourcesAndBrowserPinsVerified = browserLaunched && Object.keys(sourcePins).length === 32 && Boolean(browserPin);
  });
  if (assetIdentity) cleanup.push(async () => {
    const current = await lstat(assetDirectory); expect(current.dev).toBe(assetIdentity!.dev); expect(current.ino).toBe(assetIdentity!.ino);
    for (const [file, hash] of Object.entries(audit.deliveredArtifacts)) expect(sha(await readFile(path.join(assetDirectory, file)))).toBe(hash);
    await rm(assetDirectory, { recursive: true });
  });
  if (runtime) cleanup.push(() => runtime!.close());
  try {
    clearInterval(monitorTimer); await pendingSample;
    await realmObserver?.stop(); report.periodicRealmObservations = realmObserver?.report();
    realmSampler?.close();
    if (diagnoseAllocations && browserRootPid) {
      annotateNativeProcessTypes(samples, attribution.references, browserRootPid); report.attribution = attribution;
    }
    await finishOwnedCleanup([
      async () => { if (monitor) { try { await drainMemory(); } finally { await monitor.close(); monitor = undefined; } } },
      async () => { if (context) { await context.close(); context = undefined; } },
      async () => { if (server) { report.serverCleanup = await server.close(); server = undefined; } },
    ]);
    await finishOwnedCleanup(cleanup); report.disposableDataRemoved = true;
  }
  finally { report.logs = logs; report.forbiddenRequests = forbiddenRequests; report.workerEvents = workerEvents;
    report.validationTransport = validationTransport;
    report.staticCompilation = staticCompilation;
    report.memorySamples = samples; report.memoryPhases = phases;
    report.monitorFailure = monitorFailure ? String(monitorFailure).slice(0, 2048) : null;
    await mkdir(path.dirname(reportFile), { recursive: true }); await writeFile(reportFile, JSON.stringify(report, null, 2) + "\n"); }
});
