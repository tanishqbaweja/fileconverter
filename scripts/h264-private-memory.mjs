/* Private candidate gate, never publishes support. Native FFmpeg generates a
 * fixture and validates completed browser output; it never converts the input. */
import assert from "node:assert/strict";
import { chromium } from "@playwright/test";
import { execFile, spawn } from "node:child_process";
import { createHash } from "node:crypto";
import { createReadStream } from "node:fs";
import { mkdir, mkdtemp, readFile, readdir, rm, stat, statfs, writeFile } from "node:fs/promises";
import { createServer } from "node:net";
import path from "node:path";
import { promisify } from "node:util";
import { sampleChromiumTree, stableWindow } from "./lib/chromium-private-memory.mjs";
import { classifyPrivateRequest } from "./lib/private-browser-request.mjs";
import { connectRealmSampler } from "./lib/cdp-realm-memory.mjs";
import { readWasmMemoryLimits } from "./lib/wasm-memory-limits.mjs";
import { candidateDirectory, verifyCandidateRecipe } from "./lib/h264-candidate-selection.mjs";
import { connectCpuWindow } from "./lib/cdp-cpu-window.mjs";
import { summarizeCpuProfile } from "./lib/cpu-profile-summary.mjs";
import { h264StressProfile, startupConversionOverlap } from "./lib/h264-stress-profile.mjs";
import { summarizeUtilityActivity } from "./lib/chromium-utility-summary.mjs";
import { parseAllocatorConsole } from "./lib/h264-allocator-console.mjs";

const exec = promisify(execFile);
const root = path.resolve(import.meta.dirname, "..");
const candidateName = process.env.WITHIN_H264_CANDIDATE_DIR ?? "h264-candidate-output";
const candidate = candidateDirectory(root, candidateName);
const reportRoot = path.join(root, "outputs/reports");
const MiB = 1024 * 1024;
const duration = 60, width = 1280, height = 720, fps = 30;
const runCount = 3;
const cpuMode = process.env.WITHIN_H264_CPU_DIAGNOSTIC ?? "0";
assert.ok(["0", "1"].includes(cpuMode));
const cpuEnabled = cpuMode === "1", requestedRunCount = cpuEnabled ? 1 : runCount;
const stressProfile = h264StressProfile(process.env.WITHIN_H264_STRESS_PROFILE ?? "short", cpuEnabled);
const fixtureDuration = stressProfile.name === "short" ? duration : stressProfile.durationSeconds;
const inputMode = process.env.WITHIN_H264_INPUT_MODE ?? "byob";
assert.ok(["legacy", "byob"].includes(inputMode));
const startedAt = Date.now();
const samples = [], runs = [], logs = [], forbiddenRequests = [];
const allocatorSamples = [];
let allocatorCapturePhase = "before-conversion", allocatorCaptureError = null;
const browserLocalRequests = [], outOfOriginRequests = [];
let work, server, chrome, browser, context, page, staged = false;
let blankBaseline = null, loadedIdle = null, rootPid, lastState = null, failure = null;
let cdpRealmSampler = null;
let cpuTransport = null, cpuDiagnostic = null;
const pendingRealms = new WeakSet();
const observedLargeUtilities = new Set();
const delay = (ms) => new Promise((resolve) => setTimeout(resolve, ms));
const shaFile = async (file) => {
  const hash = createHash("sha256");
  for await (const bytes of createReadStream(file, { highWaterMark: MiB })) hash.update(bytes);
  return hash.digest("hex");
};
const native = (args, executable = "ffmpeg") => exec(executable, args, {
  cwd: root, windowsHide: true, maxBuffer: 16 * MiB, timeout: 120_000,
});
async function boundedRealm(realm, operation) {
  if (pendingRealms.has(realm)) return null;
  pendingRealms.add(realm);
  const promise = operation().catch(() => null).finally(() => pendingRealms.delete(realm));
  let timer;
  try { return await Promise.race([promise, new Promise((resolve) => { timer = setTimeout(() => resolve(null), 1000); })]); }
  finally { clearTimeout(timer); }
}
async function takeSample(phase) {
  const begin = Date.now();
  let tree = { privateBytes: null, rssBytes: null, processes: null }, sampleError = null;
  try { tree = await sampleChromiumTree(rootPid); } catch (error) { sampleError = String(error); }
  const heap = () => performance.memory?.usedJSHeapSize ?? null;
  const realms = { pageUsedJSHeapBytes: await boundedRealm(page, () => page.evaluate(heap)),
    workers: await Promise.all(page.workers().map(async (worker) => ({ url: worker.url(),
      usedJSHeapBytes: await boundedRealm(worker, () => worker.evaluate(heap)) }))) };
  const cdpIsolateHeaps = await cdpRealmSampler?.sample().catch((error) => ({ targetsAvailable: false, targets: null, error: String(error) })) ?? null;
  const storageEstimate = await boundedRealm(page, () => page.evaluate(async () => {
    const value = await navigator.storage?.estimate?.();
    return value ? { usage: value.usage ?? null, quota: value.quota ?? null } : null;
  }));
  const state = await boundedRealm(page, () => page.evaluate(() => window.__WITHIN_TEST__?.getState() ?? null));
  if (state) lastState = state;
  const born = Date.parse(tree.processes?.find((entry) => entry.pid === rootPid)?.createdAt);
  const sample = { timestamp: new Date(begin).toISOString(), elapsedMs: begin - startedAt,
    browserAgeMs: Number.isFinite(born) ? begin - born : null,
    phase, ...tree, sampleError, realms, cdpIsolateHeaps, storageEstimate, metrics: state?.metrics ?? null,
    jobState: state?.jobState ?? null, samplerElapsedMs: Date.now() - begin };
  if (samples.length >= 4096) throw new Error("Memory sample cap reached; preserve evidence before another run");
  samples.push(sample);
  if (stressProfile.requireStartupOverlap) for (const entry of tree.processes ?? []) {
    const key = `${entry.pid}:${entry.createdAt}`;
    if (entry.type === "utility" && entry.privateBytes >= 128 * MiB && !observedLargeUtilities.has(key) && observedLargeUtilities.size < 8) {
      observedLargeUtilities.add(key);
      process.stdout.write(`Observed utility ${entry.utilitySubtype ?? "unknown"} at ${(sample.browserAgeMs / 1000).toFixed(1)}s browser age, ${(entry.privateBytes / MiB).toFixed(2)} MiB; it stays in the primary total.\n`);
    }
  }
  return sample;
}
async function stable(phase, maximumBytes = null) {
  const local = [], deadline = Date.now() + 45_000;
  while (Date.now() < deadline) {
    local.push(await takeSample(phase));
    const value = stableWindow(local);
    if (value && (maximumBytes == null || value.privateBytes <= maximumBytes)) return value;
    await delay(1000);
  }
  throw new Error(`${phase} did not stabilize; no baseline substitution is allowed`);
}
async function freePort() {
  return new Promise((resolve, reject) => {
    const listener = createServer(); listener.once("error", reject);
    listener.listen(0, "127.0.0.1", () => { const port = listener.address().port;
      listener.close((error) => error ? reject(error) : resolve(port)); });
  });
}
async function waitFor(operation, label, ms = 30_000) {
  const deadline = Date.now() + ms;
  while (Date.now() < deadline) {
    try { const value = await operation(); if (value) return value; } catch { /* Retried bounded startup observation. */ }
    await delay(250);
  }
  throw new Error(`${label} startup deadline exceeded`);
}
async function payload(expectedBytes) {
  const matches = [], directories = [path.join(work, "profile")];
  while (directories.length) {
    const directory = directories.pop();
    for (const entry of await readdir(directory, { withFileTypes: true })) {
      assert.ok(!entry.isSymbolicLink(), "No links in owned browser profile");
      const file = path.join(directory, entry.name);
      if (entry.isDirectory()) directories.push(file);
      else if (entry.isFile() && (await stat(file)).size === expectedBytes) matches.push(file);
    }
  }
  assert.equal(matches.length, 1, "Find the unique real disk-backed output, never reconstruct it in RAM");
  return matches[0];
}
async function probe(file) {
  const { stdout } = await native(["-v", "error", "-count_frames", "-show_streams", "-show_format", "-show_chapters", "-of", "json", file], "ffprobe");
  return JSON.parse(stdout);
}
async function frameTimes(file) {
  const { stdout } = await native(["-v", "error", "-select_streams", "v:0", "-show_frames", "-show_entries",
    "frame=best_effort_timestamp_time", "-of", "json", file], "ffprobe");
  return JSON.parse(stdout).frames.map((frame) => Number(frame.best_effort_timestamp_time));
}
async function audioHashes(file) {
  const { stdout } = await native(["-v", "error", "-i", file, "-map", "0:a", "-c", "copy", "-f", "streamhash", "-hash", "sha256", "pipe:1"]);
  return stdout.trim().split(/\r?\n/).map((line) => line.split(",").at(-1).trim());
}
async function cleanOpfs() {
  return page.evaluate(async () => {
    const directory = await navigator.storage.getDirectory();
    for await (const [name] of directory.entries()) await directory.removeEntry(name, { recursive: true });
    const remaining = [];
    for await (const [name] of directory.entries()) remaining.push(name);
    if (remaining.length) throw new Error("OPFS cleanup failed");
    return remaining;
  });
}
async function stopOwned(child) {
  if (child?.pid && child.exitCode == null) {
    await exec("taskkill.exe", ["/PID", String(child.pid), "/T", "/F"], { windowsHide: true }).catch(() => {});
  }
}
const manifest = JSON.parse(await readFile(path.join(candidate, "build-manifest.json"), "utf8"));
if (manifest.allocatorDiagnostic) {
  assert.equal(stressProfile.name, "startup-scaling", "Allocator diagnostics cannot be a short speed trial");
  assert.equal(cpuEnabled, false);
}
assert.ok([32 * MiB, 64 * MiB].includes(manifest.maximumWasmMemoryBytes));
assert.equal(manifest.initialWasmMemoryBytes, manifest.maximumWasmMemoryBytes);
assert.equal(manifest.allowMemoryGrowth, false);
const sources = ["scripts/h264-private-memory.mjs", "scripts/lib/chromium-private-memory.mjs",
  "scripts/lib/wasm-memory-limits.mjs",
  "scripts/lib/private-browser-request.mjs",
  "scripts/lib/cdp-realm-memory.mjs",
  "scripts/lib/h264-candidate-selection.mjs",
  "scripts/lib/cdp-cpu-window.mjs", "scripts/lib/cpu-profile-summary.mjs",
  "scripts/lib/h264-stress-profile.mjs", "scripts/lib/chromium-utility-summary.mjs",
  "media/ffmpeg/h264-allocator-diagnostic.h", "scripts/lib/h264-allocator-instrumentation.mjs",
  "scripts/lib/h264-allocator-console.mjs",
  "scripts/stage-h264-candidate.mjs", "media/ffmpeg/h264-candidate.c", "media/ffmpeg/build-h264-candidate.sh"];
const sourceHashes = Object.fromEntries(await Promise.all(sources.map(async (file) => [file, await shaFile(path.join(root, file))])));
assert.equal(sourceHashes["media/ffmpeg/h264-candidate.c"], manifest.candidateKernelSha256);
const asBuiltRecipeVerification = await verifyCandidateRecipe(root, manifest.buildRecipeSha256,
  sourceHashes["media/ffmpeg/build-h264-candidate.sh"]);
for (const file of ["within-h264.mjs", "within-h264.wasm"]) assert.equal(await shaFile(path.join(candidate, file)), manifest.artifacts[file]);
const actualWasmMemoryLimits = readWasmMemoryLimits(await readFile(path.join(candidate, "within-h264.wasm")));
const staticCandidateBytes = (await Promise.all((await readdir(candidate)).map(async (name) => {
  const info = await stat(path.join(candidate, name));
  assert.ok(info.isFile(), "Private candidate must contain only static tool files");
  return info.size;
}))).reduce((sum, bytes) => sum + bytes, 0);
assert.equal(actualWasmMemoryLimits.length, 1);
assert.equal(actualWasmMemoryLimits[0].initialPages * 65536, manifest.initialWasmMemoryBytes);
assert.equal(actualWasmMemoryLimits[0].maximumPages * 65536, manifest.maximumWasmMemoryBytes);
const disk = await statfs(root);
assert.ok(disk.bavail * disk.bsize > 4 * 1024 ** 3, "Require 4 GiB of free repository disk space before generation");
await mkdir(reportRoot, { recursive: true });
const stamp = new Date().toISOString().replaceAll(/[:.]/g, "-");
const reportBase = path.join(reportRoot, `${stamp}-private-h264-${stressProfile.reportLabel}-${cpuEnabled ? "cpu-diagnostic" : "memory"}`);
let sourceEvidence = null, chromeVersion = null;
try {
  work = await mkdtemp(path.join(root, "work/h264-memory-"));
  const profile = path.join(work, "profile"), temporary = path.join(work, "temp");
  await mkdir(profile); await mkdir(temporary);
  const environment = { ...process.env, TEMP: temporary, TMP: temporary, WRANGLER_SEND_METRICS: "false" };
  const source = path.join(work, "source.mkv"), metadata = path.join(work, "chapters.ffmetadata");
  await writeFile(metadata, `;FFMETADATA1\ntitle=H264 mémoire — 音楽\n[CHAPTER]\nTIMEBASE=1/1000\nSTART=0\nEND=${fixtureDuration * 1000}\ntitle=Chapitre café\n`);
  process.stdout.write(`Generating genuine ${fixtureDuration}s ${width}x${height} ${fps}fps MPEG4 fixture in repository-local work.\n`);
  await native(["-v", "error", "-y", "-f", "lavfi", "-i", `testsrc2=size=${width}x${height}:rate=${fps}:duration=${fixtureDuration}`,
    "-f", "lavfi", "-i", `sine=frequency=997:sample_rate=48000:duration=${fixtureDuration}`,
    "-f", "lavfi", "-i", `sine=frequency=440:sample_rate=48000:duration=${fixtureDuration}`,
    "-f", "ffmetadata", "-i", metadata, "-map", "0:v", "-map", "1:a", "-map", "2:a", "-map_metadata", "3", "-map_chapters", "3",
    "-c:v", "mpeg4", "-q:v", "2", "-bf", "0", "-c:a", "aac", "-b:a", "128k",
    "-metadata:s:a:0", "language=eng", "-metadata:s:a:1", "language=hin", "-avoid_negative_ts", "make_zero",
    "-fflags", "+bitexact", "-flags:v", "+bitexact", "-flags:a", "+bitexact", source]);
  sourceEvidence = { bytes: (await stat(source)).size, sha256: await shaFile(source),
    probe: await probe(source), audioPacketHashes: await audioHashes(source), frameTimes: await frameTimes(source) };
  assert.equal(sourceEvidence.frameTimes.length, fixtureDuration * fps);
  await exec(process.execPath, ["scripts/stage-h264-candidate.mjs", "stage", inputMode, candidateName], { cwd: root, windowsHide: true }); staged = true;
  const port = await freePort(), url = `http://127.0.0.1:${port}`;
  server = spawn(process.execPath, ["node_modules/wrangler/bin/wrangler.js", "dev", "--config", "dist/server/wrangler.json", "--port", String(port)],
    { cwd: root, env: environment, windowsHide: true, stdio: "ignore" });
  await waitFor(async () => (await fetch(url)).ok, "production server");
  chrome = spawn("C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe", ["--headless=new", "--remote-debugging-port=0",
    `--user-data-dir=${profile}`, "--no-first-run", "--no-default-browser-check", "--disable-background-networking",
    "--disable-component-update", "--disable-default-apps", "--disable-domain-reliability", "--disable-extensions",
    "--disable-features=MediaRouter,OptimizationGuideModelDownloading,OptimizationHints,OptimizationTargetPrediction",
    "--disable-sync", "--metrics-recording-only", "about:blank"], { cwd: root, env: environment, windowsHide: true, stdio: "ignore" });
  rootPid = chrome.pid;
  const debugPort = await waitFor(async () => Number((await readFile(path.join(profile, "DevToolsActivePort"), "utf8")).split(/\r?\n/)[0]), "Chrome");
  browser = await chromium.connectOverCDP(`http://127.0.0.1:${debugPort}`);
  chromeVersion = browser.version(); context = browser.contexts()[0]; page = context.pages()[0];
  const debugVersion = await (await fetch(`http://127.0.0.1:${debugPort}/json/version`)).json();
  // Attach diagnostics before blank baseline; their overhead is not hidden.
  cdpRealmSampler = await connectRealmSampler(debugVersion.webSocketDebuggerUrl, url);
  if (cpuEnabled) cpuTransport = await connectCpuWindow(debugVersion.webSocketDebuggerUrl, url);
  // Trace collection is enabled before the blank baseline, not hidden from its measurement.
  await context.tracing.start({ screenshots: false, snapshots: false, sources: false });
  context.on("request", (request) => {
    let frameUrl = null;
    try { frameUrl = request.frame().url(); } catch { /* Service-worker requests have no frame. */ }
    const detail = { url: request.url(), method: request.method(), postData: request.postData(),
      frameUrl, serviceWorkerUrl: request.serviceWorker()?.url() ?? null, resourceType: request.resourceType() };
    const classification = classifyPrivateRequest(detail, url);
    if (new URL(detail.url).origin !== url && outOfOriginRequests.length < 32) outOfOriginRequests.push({ ...detail, classification });
    if (classification === "browser-local" && browserLocalRequests.length < 32) browserLocalRequests.push(detail);
    if (classification === "forbidden" && forbiddenRequests.length < 32) forbiddenRequests.push(detail);
  });
  page.on("console", (message) => {
    if (manifest.allocatorDiagnostic) {
      try {
        const diagnostic = parseAllocatorConsole(message.text());
        if (diagnostic) {
          assert.ok(allocatorSamples.length < 768, "Bounded native allocator sample cap");
          allocatorSamples.push({ phase: allocatorCapturePhase, timestamp: new Date().toISOString(), ...diagnostic });
          return;
        }
      } catch (error) { allocatorCaptureError = String(error).slice(0, 1024); }
    }
    if (logs.length === 32) logs.shift(); logs.push(message.text().slice(0, 1024));
  });
  page.on("pageerror", (error) => { if (logs.length === 32) logs.shift(); logs.push(String(error).slice(0, 1024)); });
  await page.goto("about:blank"); blankBaseline = await stable("blank-baseline");
  process.stdout.write(`Stable complete-tree blank baseline: ${(blankBaseline.privateBytes / MiB).toFixed(2)} MiB.\n`);
  await page.goto(`${url}/?test=1`);
  await page.waitForFunction(() => window.__WITHIN_TEST__?.getState().workerStatus === "ready");
  assert.equal(await page.evaluate(() => crossOriginIsolated), true);
  loadedIdle = await stable("loaded-idle");
  for (let run = 1; run <= requestedRunCount; run++) {
    await page.goto(`${url}/?test=1`);
    await page.waitForFunction(() => window.__WITHIN_TEST__?.getState().workerStatus === "ready");
    // Chrome reads the real local File; CDP-connected Playwright's transfer
    // helper rejects >50 MiB files and must not become a fixture-size ceiling.
    const cdp = await context.newCDPSession(page);
    try {
      const document = await cdp.send("DOM.getDocument");
      const { nodeId } = await cdp.send("DOM.querySelector", { nodeId: document.root.nodeId,
        selector: '[data-testid="file-input"]' });
      assert.ok(nodeId);
      await cdp.send("DOM.setFileInputFiles", { nodeId, files: [source] });
    } finally { await cdp.detach(); }
    assert.equal(await page.locator('[data-testid="file-input"]').evaluate((input) => input.files[0].size), sourceEvidence.bytes);
    await page.locator('[data-testid="format-select"]').selectOption("mkv-to-mp4");
    const first = samples.length; await takeSample(`pre-conversion-${run}`);
    const cpuCapture = cpuEnabled ? await cpuTransport.start() : null;
    allocatorCapturePhase = `conversion-${run}`;
    await page.locator('[data-testid="convert-button"]').click();
    await page.waitForFunction(() => window.__WITHIN_TEST__?.getState().jobState !== "idle");
    const conversionStart = Date.now(), deadline = conversionStart + 10 * 60_000;
    let state;
    for (;;) {
      const sample = await takeSample(`conversion-${run}`);
      assert.equal(allocatorCaptureError, null, "Native diagnostic transport failed");
      state = lastState;
      if (state?.jobState !== "running") break;
      if (Date.now() > deadline) throw new Error("Genuine conversion deadline exceeded");
      await delay(Math.max(0, 1000 - sample.samplerElapsedMs));
    }
    const active = samples.slice(first).filter((sample) => sample.privateBytes != null);
    assert.ok(active.length > 2, "Insufficient complete-tree conversion samples");
    const peakPrivateBytes = Math.max(...active.map((sample) => sample.privateBytes));
    const summary = { run, peakPrivateBytes, incrementalPrivateMiB: (peakPrivateBytes - blankBaseline.privateBytes) / MiB,
      loadedSiteOverheadMiB: (loadedIdle.privateBytes - blankBaseline.privateBytes) / MiB,
      conversionOnlyPrivateMiB: (peakPrivateBytes - loadedIdle.privateBytes) / MiB,
      peakRssBytes: Math.max(...active.map((sample) => sample.rssBytes)), elapsedObservedMs: Date.now() - conversionStart,
      completeTreeSamples: active.length, state, independentValidation: null, cleanup: null };
    runs.push(summary);
    process.stdout.write(`Run ${run}: ${state?.jobState}, peak increment ${summary.incrementalPrivateMiB.toFixed(2)} MiB.\n`);
    assert.equal(state?.jobState, "complete", state?.error ?? state?.phase);
    assert.ok(state.opfsName);
    const metrics = state.metrics;
    assert.equal(metrics.peakWasmMemoryBytes, manifest.maximumWasmMemoryBytes);
    assert.ok(metrics.maxReadChunkBytes <= 256 * 1024 && metrics.maxWriteChunkBytes <= 256 * 1024);
    assert.ok(metrics.peakQueuedBytes <= 256 * 1024 && metrics.peakPendingOperations <= 1);
    assert.equal(metrics.queuedBytes, 0); assert.equal(metrics.pendingOperations, 0);
    const output = await payload(metrics.outputBytes), after = await probe(output);
    const video = after.streams.find((stream) => stream.codec_type === "video");
    assert.equal(video.codec_name, "h264"); assert.equal(video.width, width); assert.equal(video.height, height);
    assert.equal(Number(video.nb_read_frames), fixtureDuration * fps);
    assert.deepEqual(after.streams.filter((stream) => stream.codec_type === "audio").map((stream) => [stream.codec_name, stream.tags?.language]), [["aac", "eng"], ["aac", "hin"]]);
    assert.equal(after.format.tags.title, sourceEvidence.probe.format.tags.title);
    assert.equal(after.chapters.length, 1); assert.equal(after.chapters[0].tags.title, sourceEvidence.probe.chapters[0].tags.title);
    assert.ok(Math.abs(Number(after.format.duration) - Number(sourceEvidence.probe.format.duration)) < 0.06);
    const outputTimes = await frameTimes(output);
    assert.equal(outputTimes.length, sourceEvidence.frameTimes.length);
    const maximumFrameTimeErrorSeconds = Math.max(...outputTimes.map((time, i) => Math.abs(time - sourceEvidence.frameTimes[i])));
    const hashes = await audioHashes(output); assert.deepEqual(hashes, sourceEvidence.audioPacketHashes);
    await native(["-v", "error", "-xerror", "-i", output, "-map", "0:v:0", "-map", "0:a", "-f", "null", "-"]);
    const { stderr } = await native(["-v", "info", "-i", source, "-i", output, "-filter_complex",
      "[0:v:0]settb=1/1,setpts=N[ref];[1:v:0]settb=1/1,setpts=N[out];[ref][out]ssim", "-an", "-f", "null", "-"]);
    const ordinalSsim = Number(/All:([0-9.]+)/.exec(stderr)?.[1]);
    summary.independentValidation = { outputBytes: (await stat(output)).size, outputSha256: await shaFile(output),
      outputProbe: after, outputFrameTimes: outputTimes, maximumFrameTimeErrorSeconds, ordinalSsim, audioPacketHashes: hashes, fullDecodePassed: true };
    assert.ok(maximumFrameTimeErrorSeconds <= 0.001); assert.ok(ordinalSsim >= 0.98, `Corresponding-frame SSIM ${ordinalSsim}`);
    // A primary violation must not be obscured by a later idle-stabilization
    // failure from the same retained utility. Finally still removes all media.
    if (stressProfile.requireStartupOverlap) assert.ok(summary.incrementalPrivateMiB <= 250,
      `Whole-Chromium memory ${summary.incrementalPrivateMiB} exceeds 250 MiB in startup/scaling gate`);
    await takeSample(`output-closed-${run}`);
    await cleanOpfs(); await page.goto(`${url}/?test=1`);
    await page.waitForFunction(() => window.__WITHIN_TEST__?.getState().workerStatus === "ready");
    const recovered = await stable(`cleanup-${run}`, loadedIdle.privateBytes + 96 * MiB);
    summary.cleanup = { recovered, deltaFromLoadedMiB: (recovered.privateBytes - loadedIdle.privateBytes) / MiB, opfsRemainingEntries: await cleanOpfs() };
    if (cpuCapture) {
      const capture = await cpuCapture.result;
      const { profile, ...detail } = capture;
      cpuDiagnostic = { ...detail, summary: null, rawPath: null, rawSha256: null,
        scope: "Partial first 15s worker sample window only; not end-to-end timing or full-conversion CPU utilization" };
      assert.equal(capture.error, null, "Actual CPU diagnostic data is required");
      cpuDiagnostic.summary = summarizeCpuProfile(profile);
      assert.ok(cpuDiagnostic.summary.samples > 0);
      const raw = JSON.stringify(profile);
      assert.ok(Buffer.byteLength(raw) <= 16 * MiB, "CPU profile file cap");
      cpuDiagnostic.rawPath = path.relative(root, `${reportBase}.cpuprofile`).replaceAll(path.sep, "/");
      cpuDiagnostic.rawSha256 = createHash("sha256").update(raw).digest("hex");
      await writeFile(`${reportBase}.cpuprofile`, raw, { flag: "wx" });
    }
    assert.ok(summary.incrementalPrivateMiB <= 250, `Whole-Chromium memory ${summary.incrementalPrivateMiB} exceeds 250 MiB`);
    assert.deepEqual(forbiddenRequests, []);
  }
  if (stressProfile.requireStartupOverlap) assert.ok(startupConversionOverlap(samples).observed,
    "Startup gate requires actual running conversion across 190s browser age; no artificial baseline delay allowed");
} catch (error) {
  failure = { name: error.name, message: error.message, stack: error.stack };
  process.exitCode = 1;
} finally {
  if (page && !page.isClosed()) await cleanOpfs().catch(() => {});
  await context?.tracing.stop({ path: `${reportBase}-trace.zip` }).catch(() => {});
  cdpRealmSampler?.close();
  cpuTransport?.close();
  await browser?.close().catch(() => {}); await stopOwned(chrome); await stopOwned(server);
  if (staged) await exec(process.execPath, ["scripts/stage-h264-candidate.mjs", "restore", inputMode, candidateName], { cwd: root, windowsHide: true });
  if (work) {
    assert.ok(path.dirname(work) === path.join(root, "work") && path.basename(work).startsWith("h264-memory-"));
    await rm(work, { recursive: true, force: true, maxRetries: 5, retryDelay: 500 });
  }
  if (!failure) await rm(`${reportBase}-trace.zip`, { force: true });
  const report = { recordedAt: new Date().toISOString(), scope: manifest.allocatorDiagnostic ? "Native allocator instrumented 600s/720p diagnostic; early clean baseline/full Chromium tree; not speed, uninstrumented memory or public certification" : stressProfile.requireStartupOverlap ? "Private 600s/720p genuine scaling/startup-overlap gate; early clean baseline/full Chromium tree; not speed A/B, direct-output or public certification" : cpuEnabled ? "One genuine 60s 720p conversion with partial 15s worker CPU diagnostics; NOT repeatability/speed/public-profile certification" : "Private 60s 720p candidate memory/repeatability gate; NOT multi-gigabyte scaling, speed A/B, direct-output or public-profile certification",
    status: failure ? "failed" : manifest.allocatorDiagnostic ? "passed-instrumented-allocator-diagnostic-only" : stressProfile.requireStartupOverlap ? "passed-private-startup-scaling-gate" : cpuEnabled ? "passed-instrumented-cpu-diagnostic-only" : "passed-private-720p-gate", browserVersion: chromeVersion, inputMode, sourceHashes,
    stressProfile, fixtureDurationSeconds: fixtureDuration, startupOverlap: startupConversionOverlap(samples),
    utilityActivity: stressProfile.requireStartupOverlap ? summarizeUtilityActivity(samples) : null,
    cpuEnabled, requestedRunCount, cpuDiagnostic, allocatorSamples,
    allocatorCaptureMode: manifest.allocatorDiagnostic ? "console-event" : null,
    allocatorCaptureError, publicAcceptance: false,
    candidateName, asBuiltRecipeVerification, asBuiltManifest: manifest, actualWasmMemoryLimits, formula: "peak complete Chromium process-tree private memory during conversion - stable clean blank-Chromium process-tree private memory",
    primaryLimitMiB: 250, blankBaseline, loadedIdle, source: sourceEvidence, runs, samples, logs,
    forbiddenRequests, browserLocalRequests, outOfOriginRequests, lastState, failure, publicProfilesChanged: false, protectedTestMkvUsed: false,
    cleanup: { repositoryLocalFixtureOutputsProfileAndTempRemoved: true, generatedDistRestored: staged,
      retainedStaticToolBytes: staticCandidateBytes, failureTraceRetained: Boolean(failure) } };
  await writeFile(`${reportBase}.json`, `${JSON.stringify(report, null, 2)}\n`, { flag: "wx" });
  await writeFile(`${reportBase}.csv`, "timestamp,phase,privateBytes,rssBytes,outputBytes,queuedBytes\n" + samples.map((sample) =>
    [sample.timestamp, sample.phase, sample.privateBytes ?? "", sample.rssBytes ?? "", sample.metrics?.outputBytes ?? "", sample.metrics?.queuedBytes ?? ""].join(",")).join("\n") + "\n", { flag: "wx" });
  const escape = (value) => String(value).replaceAll("&", "&amp;").replaceAll("<", "&lt;").replaceAll('"', "&quot;");
  const valid = samples.filter((sample) => sample.privateBytes != null);
  const max = Math.max(MiB, ...valid.map((sample) => sample.privateBytes)), maxTime = Math.max(1, ...samples.map((sample) => sample.elapsedMs));
  const points = valid.map((sample) => `${(sample.elapsedMs / maxTime * 900).toFixed(1)},${(280 - sample.privateBytes / max * 260).toFixed(1)}`).join(" ");
  await writeFile(`${reportBase}.html`, `<!doctype html><meta charset="utf-8"><title>Private H264 memory gate</title><h1>${escape(report.status)}</h1><p>${escape(report.scope)}</p><p>${escape(report.formula)}</p><svg viewBox="0 0 920 300" role="img" aria-label="Complete Chromium private bytes over elapsed time"><polyline fill="none" stroke="#315acf" stroke-width="2" points="${points}"/></svg><p>Private-memory range: 0–${(max / MiB).toFixed(1)} MiB; time: 0–${(maxTime / 1000).toFixed(1)} s.</p><pre>${escape(JSON.stringify({ blankBaseline, loadedIdle, runs: runs.map(({ independentValidation, state, ...run }) => ({ ...run, quality: independentValidation?.ordinalSsim ?? null, jobState: state?.jobState })), failure }, null, 2))}</pre>`, { flag: "wx" });
  process.stdout.write(`Retained JSON/CSV/HTML: ${reportBase}\n${failure ? `FAILED: ${failure.message}` : cpuEnabled ? "CPU diagnostic complete; one instrumented run is not repeatability or speed acceptance." : "Private 720p gate passed; remaining full goal gates are still open."}\n`);
}
