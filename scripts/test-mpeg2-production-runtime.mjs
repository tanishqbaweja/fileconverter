// One finite, real production-runtime integration smoke; NOT route promotion,
// full UI coverage, speed comparison or multi-gigabyte memory acceptance.
import "./lib/hidden-unit-subprocesses.mjs";
import assert from "node:assert/strict";
import { execFile, spawn } from "node:child_process";
import { createHash } from "node:crypto";
import { createReadStream } from "node:fs";
import { copyFile, lstat, mkdir, open, readFile, realpath, rm, statfs, writeFile } from "node:fs/promises";
import path from "node:path";
import { pathToFileURL } from "node:url";
import { promisify } from "node:util";
import { chromium } from "playwright";
import { createOwnedRuntimeScratch, finishOwnedCleanup } from "./lib/owned-runtime-scratch.mjs";
import { inspectStressHostMemory } from "./lib/host-memory-preflight.mjs";
import { inspectInstalledChromePin, assertInstalledChromePinsEqual } from "./lib/installed-chrome-pin.mjs";
import { queryProcessIdentity, observeOwnedProcessExit } from "./lib/owned-process-exit-observation.mjs";
import { startChromiumMemoryMonitor } from "./lib/persistent-chromium-memory.mjs";
import { stableWindow, sampleChromiumTree } from "./lib/chromium-private-memory.mjs";
import { annotateNativeProcessTypes, connectPlaywrightRealmSampler } from "./lib/chromium-attribution.mjs";
import { captureLiveMemoryInfra } from "./lib/live-memory-infra.mjs";
import { readWasmMemoryLimits } from "./lib/wasm-memory-limits.mjs";
import { verifyProductionCatalogue } from "./lib/production-catalogue-check.mjs";
import { conversionProfiles, formatById } from "../lib/capability-registry.ts";

const root = path.resolve(import.meta.dirname, ".."), exec = promisify(execFile);
const flags = new Set(process.argv.slice(2));
assert.ok(flags.size === process.argv.length - 2 && [...flags].every(flag => ["--diagnose-allocations", "--events-only-trace", "--post-measurement-allocators"].includes(flag)));
assert.ok(!flags.has("--events-only-trace") || flags.has("--diagnose-allocations"), "Observer control is diagnostic-only, never route promotion");
assert.ok(!flags.has("--post-measurement-allocators") || flags.has("--diagnose-allocations"));
const diagnose = flags.has("--diagnose-allocations"), eventsOnly = flags.has("--events-only-trace");
const pause = ms => new Promise(resolve => setTimeout(resolve, ms));
const sha = bytes => createHash("sha256").update(bytes).digest("hex");
const hashFile = async file => { const hash = createHash("sha256"); for await (const chunk of createReadStream(file)) hash.update(chunk); return hash.digest("hex"); };
const report = { scope: "production-MPEG2-dispatch-and-staged-lifecycle-small-fixture-not-public-acceptance", startedAt: new Date().toISOString(),
  publicAcceptance: false, uiPlannerCoverage: false, largeFileCoverage: false, speedComparison: false, standaloneWorker: false, failures: [] };
report.observer = { allocationDiagnostics: diagnose, screenshots: !eventsOnly, snapshots: !eventsOnly, sources: true,
  controlScope: eventsOnly ? "events-only observer comparison, not route promotion" : "existing full screenshot/snapshot trace" };
const runtime = await createOwnedRuntimeScratch("mpeg2-production-runtime-");
const env = { ...runtime.env, NODE_OPTIONS: [process.env.NODE_OPTIONS ?? "", "--import=" + pathToFileURL(path.join(root, "scripts/lib/hidden-unit-subprocesses.mjs")).href].filter(Boolean).join(" "),
  NEXT_TELEMETRY_DISABLED: "1", WRANGLER_SEND_METRICS: "false" };
const generated = [], processIdentities = [], samples = [], baselineWindows = [], blankObservations = [], forbiddenRequests = [];
let server, serverIdentity, browserServer, browser, context, monitor, monitorTimer, monitorPending = Promise.resolve(), monitorFailure, realmSampler, browserRootPid;
const phaseChanges = [{ phase: "blank", at: Date.parse(report.startedAt) }];
const changePhase = phase => { phaseChanges.push({ phase, at: Date.now() }); };
const attribution = { references: [], realms: [], scope: "bounded diagnostic observations, not exact realm-heap peaks or replacement private bytes" };
const captureAttribution = async label => {
  if (!diagnose) return;
  assert.ok(attribution.references.length < 8);
  const startedAt = new Date().toISOString();
  const [os, realms] = await Promise.allSettled([sampleChromiumTree(browserRootPid), realmSampler.sample()]);
  attribution.references.push({ label, startedAt, completedAt: new Date().toISOString(), tree: os.status === "fulfilled" ? os.value : null,
    error: os.status === "rejected" ? String(os.reason).slice(0, 512) : null });
  attribution.realms.push({ label, startedAt, completedAt: new Date().toISOString(), sample: realms.status === "fulfilled" ? realms.value : null,
    error: realms.status === "rejected" ? String(realms.reason).slice(0, 512) : null });
};
const browserLogs = [];
let serverLog = "", output, browserPin, originalHash, work, monitorBusy = false, tracing = false;
const snapshot = async () => {
  const batch = await monitor.drain();
  assert.ok(samples.length + batch.samples.length <= 3000, "Bounded short-test sample cap");
  for (const sample of batch.samples) samples.push({ ...sample,
    phase: phaseChanges.findLast(change => change.at <= Date.parse(sample.timestamp))?.phase ?? "unavailable",
    elapsedMs: Date.parse(sample.timestamp) - Date.parse(report.startedAt) });
};
try {
  const disk = await statfs(root); assert.ok(disk.bavail * disk.bsize >= 32 * 1024 ** 3);
  report.hostMemory = await inspectStressHostMemory(); assert.equal(report.hostMemory.safeToStart, true);
  browserPin = await inspectInstalledChromePin(); report.browser = browserPin;
  assert.equal((await lstat(path.join(root, "test.mkv"))).size, 2958573265);
  originalHash = await hashFile(path.join(root, "test.mkv"));
  assert.equal(originalHash, "31f36695b5b44c62125a9e4264e84dc085accd21c02cc3487aae597f54b9db34");
  work = runtime.directory;
  const native = (args, executable = "ffmpeg") => exec(executable, args, { cwd: root, env, windowsHide: true, timeout: 120000, maxBuffer: 4 * 1024 ** 2 });
  const fixture = path.join(work, "source.mkv"); output = path.join(work, "output.mp4");
  await native(["-v", "error", "-f", "lavfi", "-i", "testsrc2=size=320x240:rate=24:duration=4",
    "-f", "lavfi", "-i", "sine=frequency=997:sample_rate=48000:duration=4", "-map", "0:v", "-map", "1:a",
    "-c:v", "libx265", "-preset", "ultrafast", "-crf", "18", "-threads:v", "1", "-x265-params",
    "pools=none:frame-threads=1:wpp=0:bframes=2:keyint=48:scenecut=0:log-level=error", "-c:a", "aac", "-b:a", "128k",
    "-metadata", "title=MPEG-2 café 音楽", "-metadata:s:a:0", "language=eng", "-avoid_negative_ts", "make_zero", fixture]);
  report.fixture = { bytes: (await lstat(fixture)).size, sha256: await hashFile(fixture), video: "hevc", width: 320, height: 240, frames: 96 };
  await exec(process.execPath, ["node_modules/vinext/dist/cli.js", "build"], { cwd: root, env, windowsHide: true, timeout: 180000, maxBuffer: 4 * 1024 ** 2 });
  const assetsParent = path.join(root, "dist/client/engines");
  // Exact fixed directory URL is worker-owned, created exclusively; never replace
  // public assets or reuse a previous run's generated directory.
  const assetDirectory = path.join(assetsParent, "mpeg2"); await mkdir(assetDirectory);
  generated.push({ directory: assetDirectory, identity: await lstat(assetDirectory, { bigint: true }) });
  report.native = [];
  for (const [file, directory, source, expected, pages] of [
    ["decoder.mjs", "mpeg2-jspi-39072949964", "within-mpeg2-split.mjs", "d4ec481a93a1b087c96aa11948ab9a98ccf6d09237ed143c022bf76bf6c31506"],
    ["decoder.wasm", "mpeg2-jspi-39072949964", "within-mpeg2-split.wasm", "4f3954a3cbbd5012c811fa380402981d29ac298d46422d1bc0fa40a6b9368d57", 512],
    ["encoder.mjs", "mpeg2-encoder-planes-38044000567", "split-encoder.mjs", "00c0d1b4435e9294c6784e9ccaf196f171caa3c9cc3d4c7a4aab1a47c6d8bb5e"],
    ["encoder.wasm", "mpeg2-encoder-planes-38044000567", "split-encoder.wasm", "a4ba6225414ca7a658d349ae81926e5ed040fa73be4540fe8a7adf7656fe1cee", 256],
  ]) {
    const sourcePath = path.join(root, "work", directory, source), bytes = await readFile(sourcePath); assert.equal(sha(bytes), expected);
    if (pages) assert.deepEqual(readWasmMemoryLimits(bytes), [{ imported: true, initialPages: pages, maximumPages: pages, shared: true }]);
    await copyFile(sourcePath, path.join(assetDirectory, file)); report.native.push({ source: path.relative(root, sourcePath), sha256: expected, bytes: bytes.length });
  }
  report.sources = {};
  for (const file of ["workers/media-remux.ts", "workers/mpeg2-split-runtime.ts", "workers/random-access-destination.ts",
    "workers/conversion.worker.ts", "workers/mpeg2-core-loader.ts", "workers/staged-save.worker.ts", "workers/staged-save-runtime.ts",
    "lib/staged-worker-coordinator.ts", "lib/staged-copy-protocol.ts", "lib/mpeg2-stage-policy.ts", "lib/mpeg2-qualification-job.ts",
    "scripts/test-mpeg2-production-runtime.mjs", "scripts/lib/chromium-attribution.mjs", "scripts/lib/cdp-realm-memory.mjs",
    "scripts/lib/live-memory-infra.mjs", "scripts/lib/memory-infra-attribution.mjs",
    "scripts/lib/chromium-private-memory.mjs", "scripts/lib/persistent-chromium-memory.mjs",
    "scripts/lib/production-catalogue-check.mjs", "app/converter/ConverterApp.tsx", "app/converter/PublishedFormatsCatalogue.tsx",
    "app/globals.css", "lib/published-catalogue.ts", "lib/capability-registry.ts",
    ...["session", "frame-bridge", "frame-layout", "frame-properties", "packet-bridge"].map(suffix => "scripts/lib/mpeg2-split-" + suffix + ".mjs")]) {
    report.sources[file] = sha(await readFile(path.join(root, file)));
  }
  const port = 3217, base = `http://127.0.0.1:${port}`;
  // A busy port is an error, never a reason to attach to someone else's server.
  const { createServer } = await import("node:net"); const portProbe = createServer();
  await new Promise((resolve, reject) => { portProbe.once("error", reject); portProbe.listen(port, "127.0.0.1", resolve); });
  await new Promise(resolve => portProbe.close(resolve));
  server = spawn(process.execPath, ["node_modules/wrangler/bin/wrangler.js", "dev", "--config", "dist/server/wrangler.json", "--port", String(port), "--persist-to", path.join(work, "wrangler")],
    { cwd: root, env, windowsHide: true, stdio: ["pipe", "pipe", "pipe"] });
  serverIdentity = await queryProcessIdentity(server.pid); assert.ok(serverIdentity); processIdentities.push(serverIdentity);
  for (const pipe of [server.stdout, server.stderr]) pipe.on("data", bytes => { serverLog = (serverLog + bytes.toString()).slice(-16384); });
  let ready = false;
  for (let attempt = 0; attempt < 60; attempt++) {
    assert.equal(server.exitCode, null, serverLog);
    try { if ((await fetch(base)).ok) { ready = true; break; } } catch {}
    await pause(500);
  }
  assert.equal(ready, true, serverLog);
  browserServer = await chromium.launchServer({ executablePath: browserPin.launcher.path, headless: true, env });
  const browserIdentity = await queryProcessIdentity(browserServer.process().pid); assert.ok(browserIdentity); processIdentities.push(browserIdentity);
  browserRootPid = browserIdentity.pid;
  browser = await chromium.connect(browserServer.wsEndpoint());
  context = await browser.newContext({ serviceWorkers: "block" });
  const page = await context.newPage();
  report.workerEvents = [];
  page.on("worker", worker => {
    const record = type => { assert.ok(report.workerEvents.length < 32); report.workerEvents.push({ type, url: worker.url(), at: new Date().toISOString() }); };
    record("created"); worker.on("close", () => record("closed"));
  });
  page.on("console", message => { if (browserLogs.length === 32) browserLogs.shift(); browserLogs.push({ type: message.type(), text: message.text().slice(0, 512) }); });
  page.on("pageerror", error => { if (browserLogs.length === 32) browserLogs.shift(); browserLogs.push({ type: "pageerror", text: error.message.slice(0, 512) }); });
  monitor = await startChromiumMemoryMonitor(browserIdentity.pid, work, 100);
  const monitorIdentity = await queryProcessIdentity(monitor.pid); assert.ok(monitorIdentity); processIdentities.push(monitorIdentity);
  for (let attempt = 0; attempt < 20; attempt++) {
    await pause(2100); await snapshot(); blankObservations.push(samples.at(-1));
    const stable = stableWindow(blankObservations, 8000); if (stable) baselineWindows.push(stable);
    if (baselineWindows.length >= 2) break;
  }
  assert.ok(baselineWindows.length >= 2, "Stable same-instance blank baseline unavailable");
  report.blankBaseline = baselineWindows.reduce((lower, next) => next.privateBytes < lower.privateBytes ? next : lower);
  if (diagnose) { realmSampler = await connectPlaywrightRealmSampler(browser, base); await captureAttribution("stable-blank"); }
  await context.tracing.start({ screenshots: !eventsOnly, snapshots: !eventsOnly, sources: true }); tracing = true;
  changePhase("loaded");
  context.on("request", request => { if (!request.url().startsWith(base + "/") || request.method() !== "GET" || request.postData() !== null) {
    forbiddenRequests.push({ method: request.method(), url: request.url().slice(0, 256) }); } });
  const response = await page.goto(base + "/?test=1");
  assert.equal(response.status(), 200, "Production app route must load before file selection");
  const headers = response.headers(); assert.equal(headers["cross-origin-opener-policy"], "same-origin");
  assert.equal(headers["cross-origin-embedder-policy"], "require-corp"); assert.ok(headers["content-security-policy"]);
  await captureAttribution("loaded-before-catalogue");
  const screenshotDirectory = path.join(root, "output/playwright", report.startedAt.replaceAll(":", "-") + "-catalogue");
  await mkdir(screenshotDirectory);
  report.catalogueUi = await verifyProductionCatalogue(page, conversionProfiles.filter(profile => profile.public && profile.automatedTestStatus === "passed")
    .map(profile => ({ id: profile.id, route: profile.route, inputLabel: formatById(profile.input).label, outputLabel: formatById(profile.output).label })), screenshotDirectory);
  await page.locator('input[type="file"]').first().setInputFiles(fixture);
  await page.waitForFunction(() => document.querySelector('[data-testid="media-inspection-status"]')?.textContent.includes("These stream facts came from bounded local header reads"));
  await page.waitForFunction(() => window.__WITHIN_TEST__?.getState().workerStatus === "ready");
  // Observe the genuine loaded-site idle phase rather than starting conversion
  // during initial navigation/React rendering. Never subtract this baseline,
  // invoke GC, omit a process, or replace the lower blank baseline above.
  const loadedSamples = [], loadedObservations = [];
  for (let attempt = 0; attempt < 30; attempt++) {
    await pause(2100); await snapshot(); loadedObservations.push(samples.at(-1));
    loadedSamples.splice(0, loadedSamples.length, ...samples.filter(sample => sample.phase === "loaded"));
    const stable = stableWindow(loadedObservations, 8000);
    if (stable) { report.loadedIdle = stable; break; }
  }
  assert.ok(report.loadedIdle, "Stable loaded-site idle observation unavailable");
  report.loadedPeakIncrementalPrivateMiB = (Math.max(...loadedSamples.filter(sample => sample.privateBytes !== null).map(sample => sample.privateBytes)) - report.blankBaseline.privateBytes) / 1048576;
  await captureAttribution("loaded-after-catalogue");
  monitorTimer = setInterval(() => {
    if (monitorBusy) return;
    monitorBusy = true;
    monitorPending = snapshot().catch(error => { monitorFailure ??= error; }).finally(() => { monitorBusy = false; });
  }, 500);
  changePhase("conversion");
  [report.conversion] = await Promise.all([page.evaluate(async () => {
    const file = document.querySelector('input[type="file"]').files[0];
    const root = await navigator.storage.getDirectory(), handle = await root.getFileHandle("mpeg2-runtime-output.mp4", { create: true });
    const jobId = crypto.randomUUID(), cancellationBuffer = new SharedArrayBuffer(4);
    const job = { type: "start", jobId, profileId: "mkv-to-mp4-mpeg2", file,
      destination: { mode: "staged-handle", handle, stagingName: `within-stage-mkv-to-mp4-mpeg2-${jobId}` }, cancellationBuffer };
    let timeout;
    try {
      return await Promise.race([
        window.__WITHIN_TEST__.runQualificationJob(job),
        new Promise((_, reject) => { timeout = setTimeout(() => { Atomics.store(new Int32Array(cancellationBuffer), 0, 1);
          reject(new Error("Production job conversion timeout")); }, 60000); }),
      ]);
    } finally { clearTimeout(timeout); }
  }).then(result => { changePhase("recovery"); return result; }), captureAttribution("conversion")]);
  clearInterval(monitorTimer); await monitorPending; await snapshot();
  await captureAttribution("post-completion"); await snapshot();
  await monitor.close(); monitor = null; changePhase("validation");
  if (diagnose) {
    annotateNativeProcessTypes(samples, attribution.references, browserRootPid);
    report.attribution = attribution; report.diagnosticMemorySamples = samples;
  }
  assert.equal(report.conversion.type, "complete", JSON.stringify(report.conversion));
  assert.ok(report.conversion.phases.includes("Inspecting MPEG-2 source"));
  assert.ok(report.conversion.phases.includes("Encoding MPEG-2 MP4"));
  assert.ok(report.conversion.phases.includes("Copying staged MP4 to selected destination"));
  const nativeMetrics = report.conversion.nativeMetrics;
  assert.equal(nativeMetrics.wasmMemoryBytes, 50331648); assert.ok(nativeMetrics.maxReadChunkBytes <= 262144);
  assert.ok(nativeMetrics.maxWriteChunkBytes <= 262144); assert.ok(nativeMetrics.peakQueuedBytes <= 262144);
  assert.equal(nativeMetrics.peakPendingOperations, 1);
  const metrics = report.conversion.metrics;
  assert.equal(metrics.wasmMemoryBytes, 0); assert.equal(metrics.peakWasmMemoryBytes, 50331648); assert.equal(metrics.scratchBytes, 0);
  assert.ok(metrics.maxWriteChunkBytes <= 524288); assert.ok(metrics.peakQueuedBytes <= 524288);
  assert.equal(metrics.peakPendingOperations, 1); assert.equal(metrics.pendingOperations, 0);
  assert.ok(report.workerEvents.some(event => event.type === "closed" && event.url.includes("conversion.worker")));
  assert.ok(report.workerEvents.some(event => event.type === "created" && event.url.includes("staged-save.worker")));
  const file = await open(output, "wx");
  try {
    await page.exposeFunction("receiveRuntimeOutput", async chunk => { assert.ok(Array.isArray(chunk) && chunk.length <= 65536); await file.write(Buffer.from(chunk)); });
    await page.evaluate(async () => {
      const root = await navigator.storage.getDirectory(), handle = await root.getFileHandle("mpeg2-runtime-output.mp4"), file = await handle.getFile();
      const reader = file.stream().getReader({ mode: "byob" }); let buffer = new Uint8Array(65536);
      try { for (;;) { const { done, value } = await reader.read(buffer); if (done) break;
        await window.receiveRuntimeOutput(Array.from(value)); buffer = new Uint8Array(value.buffer); } }
      finally { await reader.cancel(); await root.removeEntry("mpeg2-runtime-output.mp4"); }
    });
  } finally { await file.close(); }
  const probe = async file => JSON.parse((await native(["-v", "error", "-count_frames", "-show_streams", "-show_format", "-of", "json", file], "ffprobe")).stdout);
  const source = await probe(fixture), converted = await probe(output);
  assert.equal(source.streams[0].codec_name, "hevc"); assert.equal(converted.streams[0].codec_name, "mpeg2video");
  assert.equal(Number(converted.streams[0].nb_read_frames), 96); assert.equal(converted.streams[0].width, 320); assert.equal(converted.streams[0].height, 240);
  assert.equal(converted.streams[1].codec_name, "aac"); assert.equal(converted.streams[1].tags.language, "eng");
  assert.equal(converted.format.tags.title, source.format.tags.title);
  const audioHash = async file => (await native(["-v", "error", "-i", file, "-map", "0:a", "-c", "copy", "-f", "streamhash", "-hash", "sha256", "pipe:1"])).stdout.trim();
  assert.equal(await audioHash(output), await audioHash(fixture));
  await native(["-v", "error", "-xerror", "-i", output, "-f", "null", "-"]);
  const comparison = await native(["-v", "info", "-i", fixture, "-i", output, "-filter_complex",
    "[0:v:0]settb=1/1,setpts=N[ref];[1:v:0]settb=1/1,setpts=N[out];[ref][out]ssim", "-an", "-f", "null", "-"]);
  const ssim = Number(/All:([0-9.]+)/.exec(comparison.stderr)?.[1]); assert.ok(ssim >= 0.98, `SSIM ${ssim}`);
  report.output = { bytes: (await lstat(output)).size, sha256: await hashFile(output), codec: "mpeg2video", frames: 96, ssim, fullNativeDecodePassed: true,
    copiedAudioPacketHash: await audioHash(output), titlePreserved: true, languagePreserved: true };
  assert.equal(forbiddenRequests.length, 0); report.forbiddenRequests = forbiddenRequests;
  const conversionSamples = samples.filter(sample => sample.phase === "conversion" && sample.privateBytes !== null);
  assert.ok(conversionSamples.length > 0);
  const peak = conversionSamples.reduce((peak, sample) => sample.privateBytes > peak.privateBytes ? sample : peak);
  report.memory = { scope: "small-runtime-integration-only-not-large-file-or-public-profile-acceptance", intervalMs: 100,
    validSamples: samples.filter(sample => sample.privateBytes !== null).length, unavailableSamples: samples.filter(sample => sample.privateBytes === null),
    conversionSamples: conversionSamples.length, peak, incrementalPrivateMiB: (peak.privateBytes - report.blankBaseline.privateBytes) / 1048576 };
  assertInstalledChromePinsEqual(browserPin, await inspectInstalledChromePin());
  for (const [file, hash] of Object.entries(report.sources)) assert.equal(sha(await readFile(path.join(root, file))), hash, "Executed source changed: " + file);
  report.executedSourcesAndBrowserPinsVerified = true;
  if (flags.has("--post-measurement-allocators")) {
    // The primary native observer is already stopped and its baseline/peak are
    // immutable. This bounded, perturbing dump is ONLY retained-allocation
    // diagnosis, never included in or substituted for acceptance measurements.
    try {
      const archivePath = path.join(root, "output/playwright", report.startedAt.replaceAll(":", "-") + "-post-measurement-memory.json.gz");
      report.postMeasurementAllocators = await captureLiveMemoryInfra({ session: await browser.newBrowserCDPSession(),
        phase: "after-conversion-observer-stopped", processes: attribution.references.at(-1)?.tree?.processes ?? null, archivePath });
    } catch (error) { report.postMeasurementAllocators = { status: "unavailable", error: String(error).slice(0, 1024), acceptanceMetric: false }; }
  }
  assert.ok(report.memory.incrementalPrivateMiB <= 250);
  report.status = diagnose ? "passed-small-allocation-diagnostic-not-route-promotion" : "passed-small-production-runtime-integration";
} catch (error) {
  report.status = "failed"; report.failures.push(String(error.stack ?? error)); report.serverLog = serverLog;
  report.failureMemorySamples = samples; process.exitCode = 1;
} finally {
  clearInterval(monitorTimer); await monitorPending;
  realmSampler?.close();
  if (diagnose) {
    annotateNativeProcessTypes(samples, attribution.references, browserRootPid);
    report.attribution = attribution; report.diagnosticMemorySamples = samples;
  }
  report.phaseChanges = phaseChanges;
  report.browserLogs = browserLogs;
  if (context && tracing) {
    try {
      if (report.status === "failed") {
        const trace = path.join(root, "output/playwright", report.startedAt.replaceAll(":", "-") + "-mpeg2-runtime-failure.zip");
        await mkdir(path.dirname(trace), { recursive: true });
        await context.tracing.stop({ path: trace }); report.failureTrace = path.relative(root, trace);
      } else await context.tracing.stop();
    } catch (error) { report.failures.push("Trace finalization: " + String(error)); report.status = "failed"; process.exitCode = 1; }
  }
  if (monitorFailure) { report.failures.push(String(monitorFailure)); report.status = "failed"; process.exitCode = 1; }
  const cleanup = [];
  await finishOwnedCleanup([
    async () => { if (monitor) await monitor.close(); },
    async () => { if (browser) await browser.close(); if (browserServer) await browserServer.close(); },
    async () => { if (server && server.exitCode === null) {
      const current = await queryProcessIdentity(server.pid); assert.deepEqual(current, serverIdentity, "Only the recorded owned server may be stopped");
      await exec("taskkill.exe", ["/PID", String(server.pid), "/T", "/F"], { cwd: root, env, windowsHide: true, timeout: 15000, maxBuffer: 16384 });
    } },
  ]).catch(error => { report.failures.push(String(error)); report.status = "failed"; process.exitCode = 1; });
  for (const identity of processIdentities) cleanup.push(await observeOwnedProcessExit(identity));
  try {
    if (originalHash) { assert.equal((await lstat(path.join(root, "test.mkv"))).size, 2958573265);
      assert.equal(await hashFile(path.join(root, "test.mkv")), originalHash); report.protectedOriginalUnchanged = true; }
    for (const { directory, identity } of generated.toReversed()) {
      const current = await lstat(directory, { bigint: true }); assert.equal(current.dev, identity.dev); assert.equal(current.ino, identity.ino);
      assert.ok((await realpath(directory)).startsWith(path.join(root, "dist/client") + path.sep));
      await rm(directory, { recursive: true });
    }
    await runtime.close();
    report.cleanup = { processObservations: cleanup, disposableOutputDeleted: true, generatedDirectoriesRemoved: generated.map(row => path.relative(root, row.directory)),
      scratchRemoved: path.relative(root, runtime.directory), allOwnedProcessesAbsent: cleanup.every(row => row.status === "owned-identity-absent") };
    assert.equal(report.cleanup.allOwnedProcessesAbsent, true);
  } catch (error) { report.failures.push(String(error.stack ?? error)); report.status = "failed"; process.exitCode = 1; }
  report.finishedAt = new Date().toISOString();
  const destination = path.join(root, "outputs/reports", report.startedAt.replaceAll(":", "-") + "-mpeg2-production-runtime.json");
  await mkdir(path.dirname(destination), { recursive: true });
  await writeFile(destination, JSON.stringify(report, null, 2) + "\n", { flag: "wx" });
  console.log(JSON.stringify({ report: destination, status: report.status, output: report.output, memory: report.memory?.incrementalPrivateMiB,
    failures: report.failures, cleanup: report.cleanup }));
}
