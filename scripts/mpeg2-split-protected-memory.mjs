// Full protected source, production browser I/O; native tools inspect/validate only.
import assert from "node:assert/strict";
import { chromium } from "@playwright/test";
import { execFile, spawn } from "node:child_process";
import { createHash } from "node:crypto";
import { createReadStream } from "node:fs";
import { access, mkdir, readFile, readdir, stat, statfs, writeFile } from "node:fs/promises";
import { createServer } from "node:net";
import path from "node:path";
import { promisify } from "node:util";
import { sampleChromiumTree, stableWindow } from "./lib/chromium-private-memory.mjs";
import { startParallelMemoryObserver } from "./lib/parallel-memory-observer.mjs";
import { connectRealmSampler } from "./lib/cdp-realm-memory.mjs";
import { classifyPrivateRequest } from "./lib/private-browser-request.mjs";
import { readWasmMemoryLimits } from "./lib/wasm-memory-limits.mjs";
import { createOwnedRuntimeScratch, finishOwnedCleanup } from "./lib/owned-runtime-scratch.mjs";

const root = path.resolve(import.meta.dirname, ".."), MiB = 1024 ** 2;
const candidateName = process.env.WITHIN_MPEG2_SPLIT_CANDIDATE_DIR ?? "mpeg2-split-pipeline-output";
const diagnosticOnly = false; // Uninstrumented real split conversion, all three stress runs required.
if (!/^(mpeg2-split-pipeline-output|mpeg2-split-pipeline-[0-9]{8,})$/.test(candidateName))
  throw new Error("Private candidate must remain in its named repository-local tool slot");
const source = path.join(root, "test.mkv"), candidate = path.join(root, "work", candidateName);
const expectedSourceBytes = 2958573265;
const expectedSourceHash = "31f36695b5b44c62125a9e4264e84dc085accd21c02cc3487aae597f54b9db34";
const baseExec = promisify(execFile), startedAt = Date.now();
let runtime, chrome, server, browser, context, page, observer, realms, staged = false;
let blankBaseline = null, loadedIdle = null, sourceProbe = null, browserVersion = null;
let lastState = null, failure = null, nativeMemory = null;
const samples = [], runs = [], logs = [], forbiddenRequests = [], browserLocalRequests = [];
let samplesEvicted = 0;
const cleanup = { mediaProfileRuntimeRemoved: false, generatedDistRestored: false,
  protectedFixtureUnchanged: false, observerStopped: false, sampledChromeRootStopped: false };
const delay = (ms) => new Promise((resolve) => setTimeout(resolve, ms));
const exec = (file, args, options = {}) => baseExec(file, args,
  { cwd: root, windowsHide: true, env: runtime?.env ?? process.env, ...options });
const shaFile = async (file) => {
  const hash = createHash("sha256");
  for await (const chunk of createReadStream(file, { highWaterMark: MiB })) hash.update(chunk);
  return hash.digest("hex");
};
const native = (args, executable = "ffmpeg") => exec(executable, args,
  { timeout: 30 * 60_000, maxBuffer: 32 * MiB });
async function probe(file, count = false) {
  const { stdout } = await native(["-v", "error", ...(count ? ["-count_frames"] : []),
    "-show_streams", "-show_format", "-show_chapters", "-of", "json", file], "ffprobe");
  return JSON.parse(stdout);
}
async function frameTimes(file) {
  // Independent validator outside Chromium, with a fixed 32MiB stdout cap.
  const { stdout } = await native(["-v", "error", "-select_streams", "v:0", "-show_frames",
    "-show_entries", "frame=best_effort_timestamp_time", "-of", "csv=p=0", file], "ffprobe");
  return stdout.split(/\r?\n/).filter((line) => /^-?\d+(?:\.\d+)?(?:,|$)/.test(line))
    .map((line) => Number(line.split(",")[0]));
}
async function audioHashes(file) {
  const { stdout } = await native(["-v", "error", "-i", file, "-map", "0:a", "-c", "copy",
    "-f", "streamhash", "-hash", "sha256", "pipe:1"]);
  return stdout.trim().split(/\r?\n/).map((line) => line.split(",").at(-1).trim());
}
async function verifySource() {
  assert.equal((await stat(source)).size, expectedSourceBytes);
  assert.equal(await shaFile(source), expectedSourceHash);
}
async function takeSample(phase) {
  observer.healthy(); observer.setPhase(phase);
  const begin = Date.now();
  let tree = { privateBytes: null, rssBytes: null, processes: null }, sampleError = null;
  try { tree = await sampleChromiumTree(chrome.pid); } catch (error) { sampleError = String(error); }
  const state = await page.evaluate(() => window.__WITHIN_TEST__?.getState() ?? null).catch(() => null);
  if (state) lastState = state;
  const storageEstimate = await page.evaluate(async () => {
    const value = await navigator.storage.estimate(); return { usage: value.usage ?? null, quota: value.quota ?? null };
  }).catch(() => null);
  const sample = { timestamp: new Date(begin).toISOString(), elapsedMs: begin - startedAt,
    phase, ...tree, sampleError, metrics: state?.metrics ?? null, jobState: state?.jobState ?? null,
    storageEstimate, cdpIsolateHeaps: await realms.sample(), samplerElapsedMs: Date.now() - begin };
  if (samples.length === 1024) { samples.shift(); samplesEvicted++; }
  samples.push(sample); return sample;
}
async function stable(phase, maximumBytes = Infinity) {
  const local = [], deadline = Date.now() + 45_000;
  while (Date.now() < deadline) {
    local.push(await takeSample(phase));
    const result = stableWindow(local);
    if (result && result.privateBytes <= maximumBytes) return result;
    await delay(1000);
  }
  throw new Error(`${phase} did not stabilize; no baseline substitution`);
}
async function waitFor(operation, label) {
  const deadline = Date.now() + 30_000;
  while (Date.now() < deadline) {
    try { const value = await operation(); if (value) return value; } catch { /* startup retry only */ }
    await delay(250);
  }
  throw new Error(`${label} startup deadline exceeded`);
}
async function outputPayload(bytes) {
  const directories = [path.join(runtime.directory, "profile")], matches = [];
  let inspected = 0;
  while (directories.length) {
    for (const entry of await readdir(directories.pop(), { withFileTypes: true })) {
      assert.ok(++inspected <= 20000, "Profile inventory cap");
      assert.ok(!entry.isSymbolicLink(), "Profile must not escape owned scratch");
      // Dirent.parentPath is the actual directory enumerated, not a guessed root.
      const file = path.join(entry.parentPath, entry.name);
      if (entry.isDirectory()) directories.push(file);
      else if (entry.isFile() && (await stat(file)).size === bytes) matches.push(file);
    }
  }
  assert.equal(matches.length, 1, "Unique real disk-backed output required"); return matches[0];
}
async function emptyOpfs() {
  return page.evaluate(async () => {
    const directory = await navigator.storage.getDirectory();
    for await (const [name] of directory.entries()) await directory.removeEntry(name, { recursive: true });
    const names = []; for await (const [name] of directory.entries()) names.push(name);
    if (names.length) throw new Error("OPFS cleanup failed"); return names;
  });
}
async function stopOwned(child) {
  if (child?.pid && child.exitCode == null && child.signalCode == null) {
    await exec("taskkill.exe", ["/PID", String(child.pid), "/T", "/F"], { timeout: 15000 });
  }
}
const manifest = JSON.parse(await readFile(path.join(candidate, "build-manifest.json"), "utf8"));
const splitFinalSamples = [];
const nativeStackSamples = [];
const allocatorSamples = [];
let allocatorSamplesEvicted = 0;
assert.equal(manifest.decoderMemoryBytes, 32 * MiB);
assert.equal(manifest.encoderMemoryBytes, 16 * MiB);
assert.equal(manifest.aggregateWasmMemoryBytes, 48 * MiB); assert.equal(manifest.allowMemoryGrowth, false);
for (const [file, hash] of Object.entries(manifest.artifacts)) assert.equal(await shaFile(path.join(candidate, file)), hash);
for (const [file, hash] of Object.entries(manifest.sources)) assert.equal(await shaFile(path.join(root, file)), hash);
if (manifest.allocatorInstrumentationSha256)
  assert.equal(await shaFile(path.join(root, "scripts/lib/mpeg2-allocator-instrumentation.mjs")), manifest.allocatorInstrumentationSha256);
if (manifest.stackReserveAdapterSha256)
  assert.equal(await shaFile(path.join(root, "scripts/lib/mpeg2-stack-reserve-adapter.mjs")), manifest.stackReserveAdapterSha256);
const actualWasmMemoryLimits = {
  decoderMux: readWasmMemoryLimits(await readFile(path.join(candidate, "within-mpeg2-split.wasm"))),
  encoder: readWasmMemoryLimits(await readFile(path.join(candidate, "split-encoder.wasm"))),
};
assert.deepEqual(actualWasmMemoryLimits.decoderMux, [{ imported: true, initialPages: 512, maximumPages: 512, shared: true }]);
assert.deepEqual(actualWasmMemoryLimits.encoder, [{ imported: true, initialPages: 256, maximumPages: 256, shared: true }]);
const sourceFiles = ["scripts/mpeg2-split-protected-memory.mjs", "scripts/stage-mpeg2-split-pipeline.mjs",
  "scripts/lib/parallel-memory-observer.mjs", "scripts/lib/native-memory-peaks.mjs",
  "scripts/lib/chromium-private-memory.mjs", "scripts/lib/cdp-realm-memory.mjs",
  "scripts/lib/persistent-chromium-memory.mjs", "scripts/lib/windows-tree-monitor.cs",
  "scripts/lib/windows-tree-monitor.ps1", "scripts/lib/owned-runtime-scratch.mjs",
  "scripts/lib/mpeg2-stack-reserve-adapter.mjs", "scripts/lib/mpeg2-split-session.mjs"];
const sourceHashes = Object.fromEntries(await Promise.all(sourceFiles.map(async (file) => [file, await shaFile(path.join(root, file))])));
const reports = path.join(root, "outputs/reports"); await mkdir(reports, { recursive: true });
const reportBase = path.join(reports, `${new Date().toISOString().replaceAll(/[:.]/g, "-")}-private-mpeg2-split-protected-direct-native-100ms`);
try {
  await verifySource();
  const disk = await statfs(root);
  assert.ok(disk.bavail * disk.bsize >= 32 * 1024 ** 3, "32GiB repository-local disk preflight required");
  runtime = await createOwnedRuntimeScratch("mpeg2-split-large-runtime-");
  const profile = path.join(runtime.directory, "profile"); await mkdir(profile);
  sourceProbe = await probe(source);
  assert.equal(sourceProbe.streams[0].width, 1920); assert.equal(sourceProbe.streams[0].height, 804);
  await exec(process.execPath, ["scripts/stage-mpeg2-split-pipeline.mjs", "stage"]); staged = true;
  const port = await new Promise((resolve, reject) => {
    const listener = createServer(); listener.once("error", reject);
    listener.listen(0, "127.0.0.1", () => { const port = listener.address().port;
      listener.close((error) => error ? reject(error) : resolve(port)); });
  });
  const origin = `http://127.0.0.1:${port}`, query = `${origin}/?test=1&directory=1`;
  server = spawn(process.execPath, ["node_modules/wrangler/bin/wrangler.js", "dev", "--config",
    "dist/server/wrangler.json", "--port", String(port)], { cwd: root, env: runtime.env, windowsHide: true, stdio: "ignore" });
  await waitFor(async () => (await fetch(origin)).ok, "production server");
  chrome = spawn("C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe", ["--headless=new", "--remote-debugging-port=0",
    `--user-data-dir=${profile}`, "--no-first-run", "--no-default-browser-check", "--disable-background-networking",
    "--disable-component-update", "--disable-default-apps", "--disable-domain-reliability", "--disable-extensions",
    "--disable-features=MediaRouter,OptimizationGuideModelDownloading,OptimizationHints,OptimizationTargetPrediction",
    "--disable-sync", "--metrics-recording-only", "about:blank"], { cwd: root, env: runtime.env, windowsHide: true, stdio: "ignore" });
  observer = await startParallelMemoryObserver(chrome.pid, runtime.directory);
  const debugPort = await waitFor(async () => Number((await readFile(path.join(profile, "DevToolsActivePort"), "utf8")).split(/\r?\n/)[0]), "Chrome");
  browser = await chromium.connectOverCDP(`http://127.0.0.1:${debugPort}`);
  browserVersion = browser.version(); context = browser.contexts()[0]; page = context.pages()[0];
  const version = await (await fetch(`http://127.0.0.1:${debugPort}/json/version`)).json();
  realms = await connectRealmSampler(version.webSocketDebuggerUrl, origin);
  await context.tracing.start({ screenshots: false, snapshots: false, sources: false });
  context.on("request", (request) => {
    let frameUrl = null; try { frameUrl = request.frame().url(); } catch { /* worker request */ }
    const detail = { url: request.url(), method: request.method(), postData: request.postData(), frameUrl,
      serviceWorkerUrl: request.serviceWorker()?.url() ?? null };
    const kind = classifyPrivateRequest(detail, origin);
    if (kind === "forbidden" && forbiddenRequests.length < 32) forbiddenRequests.push(detail);
    if (kind === "browser-local" && browserLocalRequests.length < 32) browserLocalRequests.push(detail);
  });
  page.on("console", (message) => {
    const text = message.text().slice(0, 2048);
    for (const [prefix, records] of [["WITHIN_MPEG2_SPLIT_FINAL ", splitFinalSamples], ["WITHIN_MPEG2_STACK_RESERVE ", nativeStackSamples]]) {
      if (text.startsWith(prefix) && records.length < 16) {
        try { records.push(JSON.parse(text.slice(prefix.length))); } catch { /* missing telemetry never means zero */ }
      }
    }
    if (diagnosticOnly && text.startsWith("WITHIN_MPEG2_ALLOCATOR ")) {
      try {
        const sample = JSON.parse(text.slice("WITHIN_MPEG2_ALLOCATOR ".length));
        // Independent budgets:96 heap +128 pool +16 five-pool release events.
        if (allocatorSamples.length === 240) { allocatorSamples.shift(); allocatorSamplesEvicted++; }
        allocatorSamples.push(sample);
      } catch { /* retain the bounded malformed line in logs, never fabricate telemetry */ }
    }
    if (logs.length === 32) logs.shift(); logs.push(text);
  });
  await page.goto("about:blank"); blankBaseline = await stable("blank-baseline");
  process.stdout.write(`EARLY stable blank: ${(blankBaseline.privateBytes / MiB).toFixed(3)}MiB. Full original source, no resizing.\n`);
  observer.setPhase("loaded-navigation"); await page.goto(query);
  await page.waitForFunction(() => window.__WITHIN_TEST__?.getState().workerStatus === "ready");
  assert.equal(await page.evaluate(() => crossOriginIsolated), true);
  loadedIdle = await stable("loaded-idle");
  for (let number = 1; number <= 3; number++) {
    // One changed-instrumentation diagnostic attempt only, no repeated known
    // failure and no certification from instrumented timing/memory.
    if (diagnosticOnly && number > 1) break;
    observer.setPhase(`pre-conversion-${number}`);
    await page.goto(query); await page.waitForFunction(() => window.__WITHIN_TEST__?.getState().workerStatus === "ready");
    const cdp = await context.newCDPSession(page);
    try {
      const doc = await cdp.send("DOM.getDocument");
      const { nodeId } = await cdp.send("DOM.querySelector", { nodeId: doc.root.nodeId, selector: '[data-testid="file-input"]' });
      assert.ok(nodeId); await cdp.send("DOM.setFileInputFiles", { nodeId, files: [source] });
    } finally { await cdp.detach(); }
    await page.locator('[data-testid="format-select"]').selectOption("mkv-to-mp4");
    assert.equal(await page.locator('[data-testid="file-input"]').evaluate((input) => input.files[0].size), expectedSourceBytes);
    const run = { number, cimPeakPrivateBytes: null, cimPeakRssBytes: null, nativePeaks: null,
      incrementalPrivateMiB: null, state: null, independentValidation: null, recovery: null };
    runs.push(run);
    const first = await takeSample(`pre-conversion-${number}`);
    run.cimPeakPrivateBytes = first.privateBytes; run.cimPeakRssBytes = first.rssBytes;
    observer.setPhase(`conversion-${number}`);
    await page.locator('[data-testid="convert-button"]').click();
    const deadline = Date.now() + 6 * 60 * 60_000; let nextLog = Date.now();
    for (;;) {
      const sample = await takeSample(`conversion-${number}`);
      if (sample.privateBytes != null) run.cimPeakPrivateBytes = Math.max(run.cimPeakPrivateBytes ?? 0, sample.privateBytes);
      if (sample.rssBytes != null) run.cimPeakRssBytes = Math.max(run.cimPeakRssBytes ?? 0, sample.rssBytes);
      await observer.through(Date.now()); run.nativePeaks = observer.peaks([`pre-conversion-${number}`, `conversion-${number}`]);
      assert.ok(run.nativePeaks.peak, "Actual native conversion peak required");
      run.peakPrivateBytes = Math.max(run.cimPeakPrivateBytes ?? -Infinity, run.nativePeaks.peak.privateBytes);
      run.incrementalPrivateMiB = (run.peakPrivateBytes - blankBaseline.privateBytes) / MiB;
      run.state = lastState;
      // Stop a proven failed profile promptly; never run hours past the same
      // memory failure or change the baseline/quality to conceal it.
      assert.ok(run.incrementalPrivateMiB <= 250, `Complete Chromium increase ${run.incrementalPrivateMiB}MiB exceeds 250MiB`);
      if (Date.now() >= nextLog) {
        process.stdout.write(`Run${number} ${lastState?.jobState}: input=${lastState?.metrics?.inputBytes ?? "unavailable"}, output=${lastState?.metrics?.outputBytes ?? "unavailable"}, peak=${run.incrementalPrivateMiB.toFixed(3)}MiB.\n`);
        nextLog = Date.now() + 30_000;
      }
      if (lastState?.jobState === "error" || lastState?.jobState === "complete" || lastState?.jobState === "cancelled") break;
      assert.ok(Date.now() < deadline, "Conversion deadline reached; no automatic restart"); await delay(1000);
    }
    observer.setPhase(`validation-${number}`);
    assert.equal(run.state.jobState, "complete", run.state.error ?? run.state.phase);
    assert.equal(run.state.opfsName, null, "Selected handle must not use conversion staging");
    const metrics = run.state.metrics;
    assert.equal(metrics.wasmMemoryBytes, 48 * MiB);
    assert.equal(metrics.peakWasmMemoryBytes, 48 * MiB);
    assert.equal(splitFinalSamples.length, number);
    const ownership = splitFinalSamples[number - 1];
    assert.equal(ownership.closed, true); assert.equal(ownership.activePackets, 0);
    assert.equal(ownership.aggregateWasmMemoryBytes, 48 * MiB);
    assert.equal(ownership.queuedFrames, 0); assert.equal(ownership.queuedPackets, 0);
    assert.equal(ownership.additionalPixelBufferBytes, 0); assert.equal(ownership.additionalJsPacketBufferBytes, 0);
    assert.equal(nativeStackSamples.length, number);
    assert.equal(nativeStackSamples[number - 1].decoderMemoryBytes, 32 * MiB);
    assert.equal(nativeStackSamples[number - 1].encoderMemoryBytes, 16 * MiB);
    assert.equal(nativeStackSamples[number - 1].nativeStackBytes, 262144);
    assert.equal(nativeStackSamples[number - 1].encoderNativeStackBytes, 262144);
    assert.ok(metrics.maxReadChunkBytes <= 262144 && metrics.maxWriteChunkBytes <= 262144);
    assert.ok(metrics.peakQueuedBytes <= 1048576 && metrics.peakPendingOperations <= 1);
    assert.equal(metrics.pendingOperations, 0); assert.equal(metrics.queuedBytes, 0);
    const output = await outputPayload(metrics.outputBytes), after = await probe(output, true);
    const video = after.streams.find((s) => s.codec_type === "video");
    assert.ok(after.streams.every((s) => Boolean(s.codec_name)), "No unknown/empty output tracks");
    assert.equal(after.streams.filter((s) => s.codec_type === "video" && !s.disposition?.attached_pic).length,
      sourceProbe.streams.filter((s) => s.codec_type === "video" && !s.disposition?.attached_pic).length);
    assert.equal(video.codec_name, "mpeg2video"); assert.equal(video.width, 1920); assert.equal(video.height, 804);
    const originalVideo = sourceProbe.streams.find((s) => s.codec_type === "video" && !s.disposition?.attached_pic);
    for (const field of ["sample_aspect_ratio", "display_aspect_ratio", "color_range",
      "color_space", "color_transfer", "color_primaries", "chroma_location", "r_frame_rate"])
      assert.equal(video[field], originalVideo[field], `Preserve video ${field}`);
    assert.equal(video.tags?.encoder, "Within FFmpeg MPEG-2", "Fresh video encoder provenance");
    const normalizedTags = (tags) => Object.fromEntries(Object.entries(tags ?? {}).map(([key, value]) => [key.toLowerCase(), value]));
    const inputTags = normalizedTags(sourceProbe.format.tags), outputTags = normalizedTags(after.format.tags);
    for (const [key, value] of Object.entries(inputTags))
      assert.equal(outputTags[key], value, `Preserve container metadata ${key}`);
    assert.equal(video.tags?.title, originalVideo.tags?.title, "Preserve primary video title");
    for (const [flag, enabled] of Object.entries(originalVideo.disposition ?? {}))
      if (enabled) assert.equal(video.disposition?.[flag], enabled, `Preserve primary video disposition ${flag}`);
    const inputAudio = sourceProbe.streams.filter((s) => s.codec_type === "audio");
    const outputAudio = after.streams.filter((s) => s.codec_type === "audio");
    assert.equal(outputAudio.length, inputAudio.length);
    for (let i = 0; i < inputAudio.length; i++)
      for (const field of ["codec_name", "sample_rate", "channels", "channel_layout"])
        assert.equal(outputAudio[i][field], inputAudio[i][field], `Preserve audio ${i} ${field}`);
    for (let i = 0; i < inputAudio.length; i++)
      for (const field of ["language", "title"])
        assert.equal(outputAudio[i].tags?.[field], inputAudio[i].tags?.[field], `Preserve audio ${i} ${field}`);
    assert.deepEqual(after.chapters, sourceProbe.chapters);
    const inputArt = sourceProbe.streams.filter((s) => s.disposition?.attached_pic);
    const outputArt = after.streams.filter((s) => s.disposition?.attached_pic);
    assert.equal(outputArt.length, inputArt.length, "Preserve compatible attached pictures");
    const artworkPacketHashes = [];
    for (let i = 0; i < inputArt.length; i++) {
      for (const field of ["codec_name", "width", "height"])
        assert.equal(outputArt[i][field], inputArt[i][field], `Preserve artwork ${i} ${field}`);
      const compressedHash = async (file, index) => (await native(["-v", "error", "-i", file,
        "-map", `0:${index}`, "-c", "copy", "-f", "hash", "-hash", "sha256", "pipe:1"])).stdout.trim();
      const originalHash = await compressedHash(source, inputArt[i].index);
      assert.equal(await compressedHash(output, outputArt[i].index), originalHash);
      artworkPacketHashes.push(originalHash);
    }
    assert.ok(run.state.warnings.some((warning) => /subrip.*explicitly excluded/i.test(warning)),
      "Incompatible subtitle exclusion must be disclosed");
    const inputTimes = await frameTimes(source), outputTimes = await frameTimes(output);
    assert.equal(inputTimes.length, outputTimes.length);
    assert.equal(ownership.frames, outputTimes.length); assert.equal(ownership.packets, outputTimes.length);
    assert.equal(ownership.completedPackets, outputTimes.length);
    let maximumTimestampErrorSeconds = 0;
    for (let i = 0; i < inputTimes.length; i++) maximumTimestampErrorSeconds = Math.max(maximumTimestampErrorSeconds, Math.abs(inputTimes[i] - outputTimes[i]));
    assert.ok(maximumTimestampErrorSeconds <= 0.001);
    assert.deepEqual(await audioHashes(output), await audioHashes(source));
    await native(["-v", "error", "-xerror", "-i", output, "-map", "0:v", "-map", "0:a", "-f", "null", "-"]);
    const { stderr } = await native(["-v", "info", "-i", source, "-i", output, "-filter_complex",
      "[0:v:0]settb=1/1,setpts=N[ref];[1:v:0]settb=1/1,setpts=N[out];[ref][out]ssim", "-an", "-f", "null", "-"]);
    const ssim = Number(/All:([0-9.]+)/.exec(stderr)?.[1]); assert.ok(ssim >= 0.98);
    run.independentValidation = { outputBytes: (await stat(output)).size, sha256: await shaFile(output),
      probe: after, artworkPacketHashes, frameCount: outputTimes.length, maximumTimestampErrorSeconds, ssim, fullDecode: true };
    await emptyOpfs(); await page.goto(query); await page.waitForFunction(() => window.__WITHIN_TEST__?.getState().workerStatus === "ready");
    run.recovery = await stable(`cleanup-${number}`, loadedIdle.privateBytes + 96 * MiB);
  }
  assert.deepEqual(forbiddenRequests, []);
  assert.equal(diagnosticOnly, false, "Private allocation/stack diagnostic cannot certify protected acceptance");
} catch (error) {
  failure = { name: error.name, message: error.message, stack: error.stack }; process.exitCode = 1;
} finally {
  const cleanupErrors = [];
  const attempt = async (action) => { try { await action(); } catch (error) { cleanupErrors.push(String(error)); } };
  await attempt(async () => {
    if (observer) {
      try { observer.setPhase("finally-cleanup"); await observer.stop(); cleanup.observerStopped = true; }
      finally { nativeMemory = observer.report(); }
    }
  });
  await attempt(async () => { if (page && !page.isClosed()) await emptyOpfs(); });
  await attempt(async () => { if (context) await context.tracing.stop({ path: `${reportBase}-trace.zip` }); });
  await attempt(() => realms?.close());
  await attempt(() => browser?.close());
  await attempt(() => finishOwnedCleanup([() => stopOwned(chrome), () => stopOwned(server)]));
  await attempt(async () => {
    if (chrome) {
      const { stdout } = await exec("powershell.exe", ["-NoProfile", "-NonInteractive", "-Command",
        `@(Get-CimInstance Win32_Process -Filter 'ProcessId = ${chrome.pid}').Count`]);
      assert.equal(Number(stdout.trim()), 0, "Owned Chrome root must actually be absent");
      cleanup.sampledChromeRootStopped = true;
    }
  });
  await attempt(async () => {
    // Restoration child uses this scratch, so it must finish before close.
    if (staged) { await exec(process.execPath, ["scripts/stage-mpeg2-split-pipeline.mjs", "restore"]); cleanup.generatedDistRestored = true; }
  });
  await attempt(async () => {
    if (runtime) { await runtime.close(); await assert.rejects(access(runtime.directory), { code: "ENOENT" }); cleanup.mediaProfileRuntimeRemoved = true; }
  });
  await attempt(async () => { await verifySource(); cleanup.protectedFixtureUnchanged = true; });
  if (cleanupErrors.length) {
    failure ??= { name: "CleanupFailure", message: cleanupErrors.join(" | ") };
    cleanup.errors = cleanupErrors; process.exitCode = 1;
  }
  const report = { recordedAt: new Date().toISOString(), status: failure ? "failed" : "passed-private-protected-session",
    publicAcceptance: false, diagnosticOnly,
    scope: "Full protected source HEVC to separate MPEG2 encoder via production selected OPFS handle; no native OS-picker or speed-A/B certification",
    source: { path: "test.mkv", bytes: expectedSourceBytes, sha256: expectedSourceHash, probe: sourceProbe },
    browserVersion, manifest, actualWasmMemoryLimits, sourceHashes,
    formula: "peak complete Chromium process-tree private memory during conversion - stable clean blank-Chromium process-tree private memory",
    limitMiB: 250, requestedRuns: diagnosticOnly ? 1 : 3, blankBaseline, loadedIdle, runs, samples, samplesEvicted,
    allocatorSamples, allocatorSamplesEvicted, splitFinalSamples, nativeStackSamples,
    nativeMemory, failure, logs, forbiddenRequests, browserLocalRequests, cleanup,
    ownedPids: { chrome: chrome?.pid ?? null, server: server?.pid ?? null, observer: observer?.pid ?? null }, runtimeDirectory: runtime?.directory ?? null };
  const json = JSON.stringify(report, null, 2); assert.ok(Buffer.byteLength(json) <= 32 * MiB, "Report cap; never unlimited histories");
  await writeFile(`${reportBase}.json`, `${json}\n`, { flag: "wx" });
  await writeFile(`${reportBase}.csv`, "timestamp,phase,privateBytes,rssBytes,outputBytes\n" + samples.map((s) =>
    [s.timestamp, s.phase, s.privateBytes ?? "", s.rssBytes ?? "", s.metrics?.outputBytes ?? ""].join(",")).join("\n"), { flag: "wx" });
  const points = (nativeMemory?.graphBuckets ?? []).filter((b) => b.peak).map((b) => [Date.parse(b.peak[1]), b.peak[3]]);
  const max = points.reduce((m, p) => Math.max(m, p[1]), MiB), first = points[0]?.[0] ?? 0, span = Math.max(1, (points.at(-1)?.[0] ?? first) - first);
  const graph = points.map(([t, value]) => `${((t - first) / span * 900).toFixed(1)},${(280 - value / max * 260).toFixed(1)}`).join(" ");
  const escape = (s) => String(s).replaceAll("&", "&amp;").replaceAll("<", "&lt;");
  await writeFile(`${reportBase}.html`, `<!doctype html><meta charset="utf-8"><title>Protected MPEG2 private gate</title><h1>${escape(report.status)}</h1><p>${escape(report.formula)}</p><svg viewBox="0 0 920 300"><polyline fill="none" stroke="red" points="${graph}"/></svg><pre>${escape(JSON.stringify({ blankBaseline, loadedIdle, failure, cleanup }, null, 2))}</pre>`, { flag: "wx" });
  process.stdout.write(`${report.status}: ${reportBase}.json\n`);
}
