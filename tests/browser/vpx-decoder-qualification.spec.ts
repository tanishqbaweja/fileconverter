// Private backend qualification, not public selector or large-file/stress acceptance.
import { chromium, expect, test, type BrowserContext, type Page } from "@playwright/test";
import { execFile } from "node:child_process";
import { createHash } from "node:crypto";
import { createReadStream, existsSync, type BigIntStats } from "node:fs";
import { copyFile, lstat, mkdir, open, readFile, readdir, realpath, rm, statfs, writeFile } from "node:fs/promises";
import path from "node:path";
import { pathToFileURL } from "node:url";
import { promisify } from "node:util";
import { auditVpxDecoderArtifact } from "../../scripts/lib/vpx-decoder-artifact.mjs";
import { startOwnedProductionTestServer } from "../../scripts/lib/owned-production-test-server.mjs";
import { createOwnedRuntimeScratch } from "../../scripts/lib/owned-runtime-scratch.mjs";
import { finishOwnedCleanupPhases } from "../../scripts/lib/phased-owned-cleanup.mjs";
import { describeOwnedCleanupError } from "../../scripts/lib/bounded-cleanup-error.mjs";
import { performance } from "node:perf_hooks";
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
import { makeVpxRepeatPlan } from "../../scripts/lib/vpx-repeat-plan.mjs";
import { vpxScalePlan, assertVpxMemoryGateCoverage } from "../../scripts/lib/vpx-scale-plan.mjs";
import { validateLargeCopiedAac } from "../../scripts/lib/large-aac-copy-fidelity.mjs";
import { boundedNativeLines } from "../../scripts/lib/bounded-native-lines.mjs";
import { compareStreamingVideoClocks } from "../../scripts/lib/streaming-video-clock-fidelity.mjs";
import { createLosslessNativeMemoryJournal, compactLosslessNativeMemoryJournal } from "../../scripts/lib/lossless-native-memory-journal.mjs";

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
const staticCodeRequests = { manifests: 0, wasm: 0 };
let env: NodeJS.ProcessEnv, assetIdentity: BigIntStats | undefined;
let audit: Awaited<ReturnType<typeof auditVpxDecoderArtifact>>;
let browserPin: Awaited<ReturnType<typeof inspectInstalledChromePin>> | undefined;
const sourcePins: Record<string, string> = {};
let validationTarget: Awaited<ReturnType<typeof open>> | undefined;
let monitor: Awaited<ReturnType<typeof startChromiumMemoryMonitor>> | undefined;
type NativeJournal = Awaited<ReturnType<typeof createLosslessNativeMemoryJournal>>;
let nativeJournal: NativeJournal | undefined;
let nativeJournalReceipt: Awaited<ReturnType<NativeJournal["close"]>> | undefined;
let totalNativeSamples = 0;
let monitorTimer: ReturnType<typeof setInterval> | undefined, monitorBusy = false;
let pendingSample = Promise.resolve(), monitorFailure: unknown, blankBaseline: { privateBytes: number } | undefined;
const diagnoseAllocations = process.env.WITHIN_VPX_ALLOCATION_DIAGNOSTIC === "1";
const duringAllocatorTrace = process.env.WITHIN_VPX_DURING_ALLOCATOR_TRACE === "1";
const traceWasmCompilation = process.env.WITHIN_VPX_WASM_COMPILATION_TRACE === "1";
const repeatPlan = makeVpxRepeatPlan(process.env.WITHIN_VPX_REPEAT_QUALIFICATION);
const scalePlan = vpxScalePlan(process.env.WITHIN_VPX_SCALE_QUALIFICATION);
const crossCheckLargeValidator = process.env.WITHIN_VPX_LARGE_VALIDATOR_CROSS_CHECK === "1";
if (scalePlan && (repeatPlan.length || crossCheckLargeValidator)) throw new Error("Small repeat/cross-check and large scale gates must not be mixed");
report.scaleQualification = scalePlan;
report.largeValidatorCrossCheck = crossCheckLargeValidator;
if (scalePlan) report.scope = "private-first1080p128MiB-production-browser-stage-not-complete10GiB-scaling";
report.repeatability = { enabled: repeatPlan.length > 0, cases: repeatPlan,
  cleanupAllowanceFromLoadedMiB: 96, largeFileStressAcceptance: false };
const repeatCleanup: Array<Record<string, unknown>> = [];
let repeatLoadedPrivateBytes: number | undefined;
report.inConversionDiagnosticOnly = duringAllocatorTrace;
report.wasmCompilationDiagnosticOnly = duringAllocatorTrace && traceWasmCompilation;
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
const observerTransport = { requests: 0, failures: 0, maximumRequestMs: 0, maximumBatchSamples: 0,
  lastObserverCpuMs: null as number | null, lastReceivedSequence: null as number | null,
  lastSampleAt: null as string | null, firstFailure: null as Record<string, unknown> | null,
  lastFailure: null as Record<string, unknown> | null, longestRequest: null as Record<string, unknown> | null };
const samples: Array<{ privateBytes: number | null; rssBytes: number | null; phase: string; timestamp: string; elapsedMs: number }> = [];
const pause = (ms: number) => new Promise(resolve => setTimeout(resolve, ms));
const phase = (value: string) => phases.push({ phase: value, at: Date.now() });
async function drainMemory() {
  if (!monitor) return;
  const started = performance.now(), utilization = performance.eventLoopUtilization(); observerTransport.requests++;
  let batch: Awaited<ReturnType<typeof monitor.drain>>;
  try { batch = await monitor.drain(); }
  catch (error) {
    const elapsedMs = performance.now() - started, loop = performance.eventLoopUtilization(utilization);
    observerTransport.failures++;
    observerTransport.lastFailure = { at: new Date().toISOString(), phase: phases.at(-1)?.phase, elapsedMs,
      eventLoopActiveMs: loop.active, eventLoopIdleMs: loop.idle, error: describeOwnedCleanupError(error) };
    observerTransport.firstFailure ??= observerTransport.lastFailure;
    throw error;
  } finally {
    const elapsedMs = performance.now() - started;
    if (elapsedMs > observerTransport.maximumRequestMs) {
      const loop = performance.eventLoopUtilization(utilization);
      observerTransport.longestRequest = { elapsedMs, eventLoopActiveMs: loop.active, eventLoopIdleMs: loop.idle, at: new Date().toISOString() };
      observerTransport.maximumRequestMs = elapsedMs;
    }
  }
  observerTransport.maximumBatchSamples = Math.max(observerTransport.maximumBatchSamples, batch.samples.length);
  observerTransport.lastObserverCpuMs = batch.observerCpuMs;
  observerTransport.lastReceivedSequence = batch.samples.at(-1)?.sequence ?? observerTransport.lastReceivedSequence;
  observerTransport.lastSampleAt = batch.samples.at(-1)?.timestamp ?? observerTransport.lastSampleAt;
  const labelled: typeof samples = [];
  for (const sample of batch.samples) labelled.push({ ...sample,
    phase: phases.findLast(value => value.at <= Date.parse(sample.timestamp))?.phase ?? "unavailable",
    elapsedMs: Date.parse(sample.timestamp) - phases[0].at });
  if (nativeJournal) await nativeJournal.appendBatch({ ...batch, samples: labelled });
  else expect(samples.length + labelled.length).toBeLessThanOrEqual(6000);
  totalNativeSamples += labelled.length; samples.push(...labelled);
  if (nativeJournal && samples.length > 3000) samples.splice(0, samples.length - 3000); // Complete immutable rows remain in the journal.
}
async function settleRepeatPrivate(label: string) {
  phase(label);
  // Reuse the existing native sampler; never introduce concurrent OS queries,
  // force collection, or substitute this diagnostic baseline for clean blank.
  for (let attempt = 0; attempt < 12; attempt++) {
    await pause(500); await pendingSample;
    const window = stableWindow(samples.filter(sample => sample.phase === label), 2000);
    if (window) return window;
  }
  throw new Error("Repeat cleanup private-memory window did not stabilize within6s");
}
const assetDirectory = path.join(root, "dist/client/engines/vpx");
const controls: VideoConversionOptions = { codec: "mpeg4", maxWidth: 320, bitRateBps: 4_000_000, frameRateFps: 15, quality: "balanced" };
const native = (args: string[], executable = "ffmpeg") => exec(executable, args,
  { cwd: root, env, windowsHide: true, timeout: scalePlan?.nativeDeadlineMs ?? 120_000, maxBuffer: 4 * 1024 ** 2 });
const probe = async (file: string) => JSON.parse((await native(["-v", "error", "-count_frames", "-show_streams", "-show_format", "-show_chapters", "-of", "json", file], "ffprobe")).stdout) as {
  streams: Array<{ codec_type: string; codec_name: string; width?: number; height?: number; nb_read_frames?: string; tags?: Record<string, string> }>;
  format: { duration: string; tags: Record<string, string> };
  chapters: Array<{ start_time: string; end_time: string; tags: Record<string, string> }>;
};
test.skip(process.env.WITHIN_PRIVATE_VPX_QUALIFICATION !== "1",
  "Private native candidate requires explicit playwright.vpx.config.ts; not a public support gate");

test.beforeAll(async () => {
  test.setTimeout(scalePlan ? 600000 : 240_000);
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
    "lib/vpx-compiled-core.ts", "lib/conversion-protocol.ts", "scripts/lib/vpx-repeat-plan.mjs", "scripts/lib/vpx-scale-plan.mjs",
    "scripts/lib/large-aac-copy-fidelity.mjs", "scripts/lib/large-mp4-first-sample-duration.mjs",
    "scripts/lib/streaming-pcm-trim-digest.mjs", "scripts/lib/bounded-native-lines.mjs",
    "scripts/lib/phased-owned-cleanup.mjs", "scripts/lib/bounded-cleanup-error.mjs", "scripts/lib/windows-tree-monitor.cs",
    "scripts/lib/streaming-video-clock-fidelity.mjs", "scripts/lib/lossless-native-memory-journal.mjs", "scripts/lib/native-memory-peaks.mjs"])
    sourcePins[file] = sha(await readFile(path.join(root, file)));
  report.executedSourcePins = sourcePins;
  if (process.platform === "win32") { browserPin = await inspectInstalledChromePin(); report.browserPin = browserPin; }
  runtime = await createOwnedRuntimeScratch("vd-");
  env = { ...runtime.env, WRANGLER_SEND_METRICS: "false", NEXT_TELEMETRY_DISABLED: "1",
    NODE_OPTIONS: [process.env.NODE_OPTIONS ?? "", "--import=" + pathToFileURL(path.join(root, "scripts/lib/hidden-unit-subprocesses.mjs")).href].filter(Boolean).join(" ") };
  if (process.platform === "linux") expect(Buffer.byteLength(path.join(runtime.directory, "org.chromium.Chromium.XXXXXX", "SingletonSocket"))).toBeLessThan(108);
  await exec(process.execPath, ["node_modules/vinext/dist/cli.js", "build"],
    { cwd: root, env, windowsHide: true, timeout: 180_000, maxBuffer: 4 * 1024 ** 2 });
  await mkdir(assetDirectory); assetIdentity = await lstat(assetDirectory, { bigint: true });
  expect(assetIdentity.isDirectory() && !assetIdentity.isSymbolicLink()).toBe(true);
  expect(await realpath(assetDirectory)).toBe(assetDirectory);
  for (const [file, hash] of Object.entries({ ...audit.deliveredArtifacts, "build-manifest.json": audit.manifestSha256 })) {
    await copyFile(path.join(audit.directory, file), path.join(assetDirectory, file));
    expect(sha(await readFile(path.join(assetDirectory, file)))).toBe(hash);
  }
  for (const codec of ["vp8", "vp9"]) {
    const seconds = scalePlan?.seedDurationSeconds ?? 2, width = scalePlan?.width ?? 480, height = scalePlan?.height ?? 270;
    const fixture = path.join(runtime.directory, codec + ".mkv"), seed = scalePlan ? path.join(runtime.directory, codec + "-seed.mkv") : fixture;
    await native(["-v", "error", "-nostdin", "-f", "lavfi", "-i", `testsrc2=size=${width}x${height}:rate=24:duration=${seconds}`,
      "-f", "lavfi", "-i", `sine=frequency=997:sample_rate=48000:duration=${seconds}`, "-map", "0:v", "-map", "1:a",
      "-c:v", codec === "vp8" ? "libvpx" : "libvpx-vp9", "-deadline", "good", "-cpu-used", "4", "-threads:v", "1",
      ...(scalePlan ? ["-deadline", "realtime", "-cpu-used", "8", "-threads:v", "2", "-b:v", scalePlan.fixtureBitRate,
        "-minrate", scalePlan.fixtureBitRate, "-maxrate", scalePlan.fixtureBitRate, "-bufsize", "20M", "-undershoot-pct", "0", "-overshoot-pct", "0",
        ...(codec === "vp9" ? ["-row-mt", "1", "-tile-columns", "2"] : [])] : ["-b:v", "0", "-crf", "4"]),
      "-c:a", "aac", "-b:a", "128k", "-metadata", "title=VPX café 音楽",
      "-metadata:s:a:0", "language=eng", "-fflags", "+bitexact", "-flags:v", "+bitexact", "-flags:a", "+bitexact",
      ...(scalePlan ? ["-an"] : []), seed]);
    if (scalePlan) {
      // Real packet-copy fixture construction only. Generate continuous AAC
      // rather than repeating encoder priming/trim metadata at loop boundaries.
      // -fs finalizes complete muxed packets; never truncate/pad/sparsify a file.
      try {
        await native(["-v", "error", "-nostdin", "-stream_loop", "-1", "-i", seed,
          "-f", "lavfi", "-i", "sine=frequency=997:sample_rate=48000", "-map", "0:v:0", "-map", "1:a:0",
          "-c:v", "copy", "-c:a", "aac", "-b:a", "128k", "-metadata", "title=VPX café 音楽", "-metadata:s:a:0", "language=eng",
          "-fflags", "+bitexact", "-flags:a", "+bitexact", "-fs", String(scalePlan.targetSourceBytes), "-f", "matroska", fixture]);
      } finally { await rm(seed, { force: true }); }
      const bytes = (await lstat(fixture)).size;
      expect(bytes).toBeGreaterThanOrEqual(scalePlan.minimumSourceBytes); expect(bytes).toBeLessThanOrEqual(scalePlan.maximumSourceBytes);
    }
  }
  if (process.platform === "win32" && !scalePlan) expect(await hashFile(path.join(runtime.directory, "vp8.mkv")),
    "Keep the actual AAC-loss reproduction input identical for the changed-core comparison").toBe("6e2baa02fe7d9469a2bd84dc516caa995a697eead2ad9f23eb3de2ecd2c74ab9");
  if (!scalePlan) {
  const chapterMetadata = path.join(runtime.directory, "chapters.ffmetadata");
  await writeFile(chapterMetadata, ";FFMETADATA1\n[CHAPTER]\nTIMEBASE=1/1000\nSTART=500\nEND=1500\ntitle=VPX chapitre café\n");
  await native(["-v", "error", "-i", path.join(runtime.directory, "vp8.mkv"), "-f", "lavfi", "-i", "sine=frequency=440:sample_rate=48000:duration=2",
    "-f", "ffmetadata", "-i", chapterMetadata, "-map", "0:v", "-map", "0:a", "-map", "1:a", "-map_metadata", "0", "-map_chapters", "2",
    "-c", "copy", "-c:a:1", "aac", "-b:a:1", "128k", "-metadata:s:a:0", "language=eng", "-metadata:s:a:1", "language=hin",
    "-fflags", "+bitexact", "-flags:a", "+bitexact", path.join(runtime.directory, "vp8-multi.mkv")]);
  }
  server = await startOwnedProductionTestServer({ root, directory: runtime.directory, env, port: 3231 });
  for (const [file, hash] of Object.entries({ ...audit.deliveredArtifacts, "build-manifest.json": audit.manifestSha256 })) {
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
    if (scalePlan) {
      await mkdir(path.dirname(reportFile), { recursive: true });
      nativeJournal = await createLosslessNativeMemoryJournal(browserRootPid!, reportFile.replace(/\.json$/, "-native-memory.ndjson"));
    }
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
      pendingSample = drainMemory().catch(error => { monitorFailure ??= error; clearInterval(monitorTimer); }).finally(() => { monitorBusy = false; }); }, 500);
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
    else {
      if (url.pathname === "/engines/vpx/build-manifest.json") staticCodeRequests.manifests++;
      if (url.pathname === "/engines/vpx/within-remux.wasm") staticCodeRequests.wasm++;
      await route.continue();
    }
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
  if (repeatPlan.length && monitor) {
    const loaded = await settleRepeatPrivate("repeat-loaded-idle");
    repeatLoadedPrivateBytes = loaded.privateBytes; report.repeatLoadedIdle = loaded;
  }
});

async function run(codec: "vp8" | "vp9", options?: VideoConversionOptions, fault?: "write", preCancelled = false, wrongProfile = false, multi = false) {
  if (monitorFailure) throw monitorFailure; // Do not start another expensive conversion with known missing memory coverage.
  const source = path.join(runtime!.directory, codec + (multi ? "-multi" : "") + ".mkv");
  await page.locator('input[type="file"]').first().setInputFiles(source);
  await page.waitForFunction(() => window.__WITHIN_TEST__?.getState().workerStatus === "ready" && window.__WITHIN_TEST__?.getState().jobState !== "running");
  await captureAttribution("before-conversion-" + (conversionOrdinal + 1));
  const eventStart = workerEvents.length;
  const ordinal = ++conversionOrdinal, startedAt = Date.now(), conversionPhase = "conversion-" + codec + "-" + ordinal;
  let actualStartedAt = startedAt, actualEndedAt: number | undefined;
  phase(conversionPhase);
  const execute = async () => await page.evaluate(async ({ codec, options, fault, preCancelled, wrongProfile, deadline }) => {
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
      new Promise<never>((_, reject) => { timer = setTimeout(() => { Atomics.store(new Int32Array(cancellationBuffer), 0, 1); reject(new Error("Private VPX job exceeded explicit deadline")); }, deadline); })]);
    } finally { clearTimeout(timer); }
  }, { codec, options, fault, preCancelled, wrongProfile, deadline: scalePlan?.browserDeadlineMs ?? 60000 }) as VpxQualificationResult;
  let result: VpxQualificationResult | undefined;
  if (duringAllocatorTrace && ordinal === 3 && codec === "vp9") {
    phase("preparing-vp9-allocator-trace");
    let reference: { processes: unknown[] };
    if (process.platform === "win32") reference = await sampleChromiumTree(browserRootPid!);
    else {
      const identitySession = await context!.browser()!.newBrowserCDPSession();
      try {
        const info = await identitySession.send("SystemInfo.getProcessInfo");
        reference = { processes: info.processInfo.map(entry => ({ pid: entry.id, type: entry.type,
          privateBytes: null, rssBytes: null, createdAt: null, parentPid: null })) };
        report.inConversionProcessReference = "CDP identities only, not complete OS-tree/private/RSS/birth evidence; unavailable stays null";
      } finally { await identitySession.detach(); }
    }
    try {
      report.inConversionAllocationTrace = await captureLiveMemoryInfra({ session: await context!.browser()!.newBrowserCDPSession(),
        phase: "first-vp9-native-work", processes: reference.processes, wasmCompilation: traceWasmCompilation,
        archivePath: reportFile.replace(/\.json$/, "-during-vp9-memory.json.gz"), during: async () => {
          actualStartedAt = Date.now(); phase(conversionPhase);
          result = await execute(); actualEndedAt = Date.now(); phase("post-vp9-allocator-trace-export");
        } });
    } catch (error) {
      report.inConversionAllocationTrace = { status: "unavailable", error: String(error).slice(0, 2048), acceptanceMetric: false };
      if (!result) throw error;
    }
  } else result = await execute();
  if (!result) throw new Error("The actual production conversion did not return a result");
  const endedAt = actualEndedAt ?? Date.now(); phase("recovery");
  rows.push({ codec, multi, options: options ?? "automatic", fault: fault ?? null, preCancelled, wrongProfile, sourceBytes: (await lstat(source)).size,
    sourceSha256: await hashFile(source), conversionWindow: { ordinal, startedAt: actualStartedAt, endedAt, phase: conversionPhase }, result, workerEvents: workerEvents.slice(eventStart) });
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
    if (scalePlan) { await validateScaleOutput(codec, source, output, original, converted); return; }
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
        if (crossCheckLargeValidator && audioOrdinal === 0) {
          const crossCheck = await validateLargeCopiedAac(source, output, { env });
          rows.push({ codec, largeValidatorSmallCrossCheck: crossCheck });
          expect(crossCheck.status).toBe("passed-bounded-stream-AAC-LC");
        }
      } catch (error) {
        rows.push({ codec, multi, audioOrdinal, aacValidationFailure: String(error).slice(0, 1024),
          aacFixtureEvidence: (error as { aacFixtureEvidence?: unknown }).aacFixtureEvidence ?? null,
          packetEdges: (error as { aacPacketEdges?: unknown }).aacPacketEdges ?? null });
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
    if (duringAllocatorTrace && conversionOrdinal === 3 && codec === "vp9") {
      const trace = report.inConversionAllocationTrace as { status: string; rows?: Array<{ workRunningAtRequest?: boolean }> };
      expect(trace.status, "Allocator evidence cannot be silently treated as available").toBe("captured-live-light-memory-diagnostic");
      expect(trace.rows?.some(row => row.workRunningAtRequest), "At least one dump request must actually overlap conversion").toBe(true);
    }
    await captureAttribution("after-validation-" + conversionOrdinal);
  } finally { validationTarget = undefined; await target.close().catch(() => {}); await rm(output, { force: true }); }
}

async function validateScaleOutput(codec: "vp8" | "vp9", source: string, output: string,
  original: Awaited<ReturnType<typeof probe>>, converted: Awaited<ReturnType<typeof probe>>) {
  const plan = scalePlan!;
  const evidence: Record<string, unknown> = { codec, scope: "first1080p128MiB-stage-not10GiB-or-public-acceptance", stage: "structure" };
  rows.push({ scaleValidation: evidence });
  expect(original.streams.map(stream => stream.codec_name)).toEqual([codec, "aac"]);
  expect(converted.streams.map(stream => stream.codec_name)).toEqual(["mpeg4", "aac"]);
  expect(converted.streams[0].width).toBe(plan.width); expect(converted.streams[0].height).toBe(plan.height);
  const frames = Number(original.streams[0].nb_read_frames), duration = Number(original.format.duration);
  // The byte-targeted final mux may end part-way through a seed cycle. Check
  // its independently decoded count, not the seed's unrelated fixed length.
  expect(Number.isSafeInteger(frames) && frames >= plan.frameRate).toBe(true);
  expect(Number.isFinite(duration) && duration > 0 && duration <= plan.maximumDurationSeconds).toBe(true);
  expect(Number(converted.streams[0].nb_read_frames)).toBe(frames);
  expect(converted.streams[1].tags?.language).toBe("eng"); expect(converted.format.tags.title).toBe(original.format.tags.title);
  expect(Math.abs(Number(converted.format.duration) - Number(original.format.duration))).toBeLessThan(0.08);
  evidence.stage = "full-independent-decode";
  await native(["-v", "error", "-xerror", "-i", output, "-map", "0:v", "-map", "0:a", "-f", "null", "-"]); evidence.fullDecode = true;
  evidence.stage = "all-frame-quality";
  const comparison = await native(["-v", "info", "-i", source, "-i", output, "-filter_complex",
    "[0:v:0]settb=1/1,setpts=N[ref];[1:v:0]settb=1/1,setpts=N[out];[ref][out]ssim", "-an", "-f", "null", "-"]);
  const ssim = Number(/All:([0-9.]+)/.exec(comparison.stderr)?.[1]); evidence.ssim = ssim; expect(ssim).toBeGreaterThanOrEqual(0.98);
  evidence.stage = "all-frame-timestamps";
  const times = (file: string) => boundedNativeLines("ffprobe", ["-v", "error", "-select_streams", "v:0", "-show_frames",
    "-show_entries", "frame=best_effort_timestamp_time", "-of", "compact", file], { cwd: root, env, timeoutMs: plan.nativeDeadlineMs });
  const clocks = await compareStreamingVideoClocks(times(source), times(output), frames);
  evidence.frames = clocks.frames; evidence.maximumVideoPtsErrorSeconds = clocks.maximumVideoPtsErrorSeconds;
  evidence.stage = "exact-all-packet-PCM-trim-and-audio-clocks";
  try { evidence.audio = await validateLargeCopiedAac(source, output, { env }); }
  catch (error) { evidence.audioFailure = String(error).slice(0, 2048);
    evidence.packetEdges = (error as { aacPacketEdges?: unknown }).aacPacketEdges ?? null; throw error; }
  evidence.stage = "passed";
  rows.push({ codec, options: "automatic", independentValidation: { fullDecode: true, frames, fps: plan.frameRate, width: plan.width, height: plan.height,
    ssim, audioPacketsIdentical: true, sourceBytes: (await lstat(source)).size, outputBytes: (await lstat(output)).size,
    outputSha256: await hashFile(output), maximumVideoPtsErrorSeconds: clocks.maximumVideoPtsErrorSeconds, largeFileStage: plan.name, near10GiBAcceptance: false } });
}

for (const codec of ["vp8", "vp9"] as const) {
  test(`genuine CPU ${codec} decode to MPEG4 with default settings`, async () => validate(codec));
  test(`genuine CPU ${codec} decode preserves nondefault12-argument video controls`, async () => validate(codec, controls));
}
for (const item of repeatPlan) {
  test(`same-session repeatability ${item.codec} ${item.settings} run${item.repetition}of3`, async () =>
    validate(item.codec as "vp8" | "vp9", item.settings === "controls" ? controls : undefined));
}
if (scalePlan) for (const codec of ["vp8", "vp9"] as const) {
  test(`genuine1080p128m ${codec} default scaling stage`, async () => {
    test.setTimeout(scalePlan.browserDeadlineMs); await validate(codec);
  });
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
  assertVpxMemoryGateCoverage({ conversionCount: conversionOrdinal,
    independentOutputCount: rows.filter(row => row.independentValidation).length,
    crossCheckCount: rows.filter(row => (row.largeValidatorSmallCrossCheck as { status?: string } | undefined)?.status === "passed-bounded-stream-AAC-LC").length,
    crossCheck: crossCheckLargeValidator, repeat: repeatPlan.length > 0, scale: Boolean(scalePlan) });
  clearInterval(monitorTimer); await pendingSample; await drainMemory();
  expect(staticCodeRequests.wasm).toBe(staticCompilation.coldCompiles);
  expect(staticCodeRequests.manifests).toBe(staticCompilation.coldCompiles + staticCompilation.reuses);
  expect(monitorFailure).toBeUndefined(); expect(blankBaseline).toBeTruthy();
  if (repeatPlan.length) {
    expect(conversionOrdinal, "Repeat gate must select only the12repeat cases and memory test").toBe(12);
    expect(repeatCleanup).toHaveLength(12);
    expect(staticCompilation).toEqual({ coldCompiles: 1, reuses: 11 });
  }
  const active = samples.filter(sample => sample.phase !== "blank" && sample.privateBytes !== null);
  expect(active.length).toBeGreaterThan(0);
  const journalPeaks = nativeJournal?.peaksExcept(["blank"]);
  const peak = journalPeaks ? journalPeaks.peak!.privateBytes : Math.max(...active.map(sample => sample.privateBytes!));
  if (nativeJournal) {
    expect(journalPeaks!.peak, "Full lossless journal, not bounded tail, must supply the actual simultaneous peak").toBeTruthy();
    await monitor!.close(); monitor = undefined;
    nativeJournalReceipt = await nativeJournal.close();
    const lastConversionEnd = Math.max(...rows.map(row => (row.conversionWindow as { endedAt?: number } | undefined)?.endedAt ?? -Infinity));
    expect(nativeJournalReceipt.summary.native.lastAcquiredAt, "Journal must cover through the actual final conversion, not only a prefix").toBeGreaterThanOrEqual(lastConversionEnd);
  }
  const incrementalPrivateMiB = (peak - blankBaseline!.privateBytes) / 1048576;
  report.primaryIncrementalPrivateMiB = incrementalPrivateMiB; report.memoryAcceptance = incrementalPrivateMiB <= 250 && !duringAllocatorTrace;
  report.memoryLimitation = scalePlan
    ? "First1080p128MiB stage only, not repeated stress/near10GiB/final UI/planner/public acceptance."
    : "Small private backend qualification only; not large-file, final planner/UI or public profile acceptance.";
  if (diagnoseAllocations) {
    // The native baseline/peak are finalized before this perturbing light dump.
    // Every process still counts; allocator counters are never subtracted.
    await realmObserver?.stop(); report.periodicRealmObservations = realmObserver?.report();
    if (monitor) { await monitor.close(); monitor = undefined; }
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
  if (repeatPlan.length && testInfo.title.startsWith("same-session repeatability") && monitor) {
    const settled = await settleRepeatPrivate("repeat-cleanup-" + conversionOrdinal);
    expect(repeatLoadedPrivateBytes).toBeDefined();
    const deltaFromLoadedMiB = (settled.privateBytes - repeatLoadedPrivateBytes!) / 1048576;
    repeatCleanup.push({ ordinal: conversionOrdinal, test: testInfo.title, ...settled, deltaFromLoadedMiB });
    report.repeatCleanup = repeatCleanup;
    expect(deltaFromLoadedMiB, "Existing96MiB cleanup allowance, never the primary250MiB baseline").toBeLessThanOrEqual(96);
  }
});
test.afterAll(async () => {
  const cleanupPhases: Array<{ name: string; status: string; error?: unknown }> = [];
  const verifyExecutedSources = async () => {
    if (browserLaunched) {
      expect(staticCodeRequests.wasm).toBe(staticCompilation.coldCompiles);
      expect(staticCodeRequests.manifests).toBe(staticCompilation.coldCompiles + staticCompilation.reuses);
    }
    for (const [file, hash] of Object.entries(sourcePins)) expect(sha(await readFile(path.join(root, file))), "Executed source changed: " + file).toBe(hash);
    if (browserPin) assertInstalledChromePinsEqual(browserPin, await inspectInstalledChromePin());
    report.executedSourcesVerified = browserLaunched && Object.keys(sourcePins).length === 44;
    report.installedChromeBinaryPinsVerified = browserPin ? true : null;
    report.executedSourcesAndBrowserPinsVerified = browserLaunched && Object.keys(sourcePins).length === 44 && Boolean(browserPin);
  };
  const cleanup: Array<() => Promise<unknown>> = [];
  if (assetIdentity) cleanup.push(async () => {
    const current = await lstat(assetDirectory, { bigint: true });
    expect(current.isDirectory() && !current.isSymbolicLink()).toBe(true);
    expect(await realpath(assetDirectory)).toBe(assetDirectory);
    expect(current.dev).toBe(assetIdentity!.dev); expect(current.ino).toBe(assetIdentity!.ino); expect(current.birthtimeNs).toBe(assetIdentity!.birthtimeNs);
    const expected = { ...audit.deliveredArtifacts, "build-manifest.json": audit.manifestSha256 };
    expect((await readdir(assetDirectory)).sort(), "Never delete an unexpected user entry").toEqual(Object.keys(expected).sort());
    for (const [file, hash] of Object.entries(expected))
      expect(sha(await readFile(path.join(assetDirectory, file)))).toBe(hash);
    await rm(assetDirectory, { recursive: true });
  });
  if (runtime) cleanup.push(async () => {
    expect(context, "Do not delete a profile whose browser closure is unverified").toBeUndefined();
    expect(server, "Do not delete runtime while owned server closure is unverified").toBeUndefined();
    await runtime!.close();
  });
  try {
    await finishOwnedCleanupPhases([
      { name: "observation-finalization", actions: [async () => {
        clearInterval(monitorTimer); await pendingSample;
        try { await realmObserver?.stop(); report.periodicRealmObservations = realmObserver?.report(); }
        finally { realmSampler?.close(); }
        if (diagnoseAllocations && browserRootPid) {
          annotateNativeProcessTypes(samples, attribution.references, browserRootPid); report.attribution = attribution;
        }
      }] },
      { name: "process-closure", actions: [
      async () => { if (monitor) { try { await drainMemory(); } catch (error) { monitorFailure ??= error; throw error; }
        finally { await monitor.close(); monitor = undefined; } } },
      async () => { if (context) { await context.close(); context = undefined; } },
      async () => { if (server) { report.serverCleanup = await server.close(); server = undefined; } },
      ] },
      { name: "native-journal-retention", actions: [async () => {
        if (!nativeJournal) return;
        try { nativeJournalReceipt ??= await nativeJournal.close(); }
        catch (error) {
          report.nativeMemoryJournal = await compactLosslessNativeMemoryJournal(await nativeJournal.failedReceipt());
          throw error;
        }
        report.nativeMemoryJournal = await compactLosslessNativeMemoryJournal(nativeJournalReceipt);
      }] },
      { name: "executed-source-verification", actions: [verifyExecutedSources] },
      { name: "disposable-files", actions: cleanup },
    ], cleanupPhases);
  }
  finally { report.logs = logs; report.forbiddenRequests = forbiddenRequests; report.workerEvents = workerEvents;
    report.cleanupPhases = cleanupPhases;
    report.disposableDataRemoved = cleanupPhases.some(phase => phase.name === "disposable-files" && phase.status === "passed");
    report.observerTransport = observerTransport;
    report.nativeSampleRetention = { totalObserved: totalNativeSamples, retainedTailSamples: samples.length,
      tailOnly: totalNativeSamples > samples.length, losslessJournalEnabled: Boolean(nativeJournal), tailLimit: nativeJournal ? 3000 : 6000,
      tailIsNeverTheLongRunPeakSource: Boolean(nativeJournal) };
    report.validationTransport = validationTransport;
    report.staticCompilation = staticCompilation;
    report.staticCodeRequests = staticCodeRequests;
    report.memorySamples = samples; report.memoryPhases = phases;
    report.monitorFailure = monitorFailure ? String(monitorFailure).slice(0, 2048) : null;
    await mkdir(path.dirname(reportFile), { recursive: true }); await writeFile(reportFile, JSON.stringify(report, null, 2) + "\n"); }
});
