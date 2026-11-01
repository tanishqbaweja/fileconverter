// One real small browser conversion: integration diagnosis, never full stress or speed acceptance.
import "./lib/hidden-unit-subprocesses.mjs";
import assert from "node:assert/strict";
import { spawn, execFile } from "node:child_process";
import { createReadStream } from "node:fs";
import { access, copyFile, lstat, mkdir, open, readFile, realpath, rm, stat, statfs, writeFile } from "node:fs/promises";
import path from "node:path";
import { createServer } from "node:net";
import { promisify } from "node:util";
import { createHash } from "node:crypto";
import { build } from "esbuild";
import { chromium } from "playwright";
import { createOwnedRuntimeScratch } from "./lib/owned-runtime-scratch.mjs";
import { inspectStressHostMemory } from "./lib/host-memory-preflight.mjs";
import { inspectInstalledChromePin, assertInstalledChromePinsEqual } from "./lib/installed-chrome-pin.mjs";
import { queryReliableProcessIdentity } from "./lib/reliable-owned-identity.mjs";
import { observeOwnedProcessExit } from "./lib/owned-process-exit-observation.mjs";
import { startParallelMemoryObserver } from "./lib/parallel-memory-observer.mjs";
import { startChromiumMemoryMonitor } from "./lib/birth-aware-chromium-memory.mjs";
import { sampleChromiumTree, stableWindow } from "./lib/chromium-private-memory.mjs";

assert.equal(process.argv.length, 2); assert.equal(process.platform, "win32");
const root = path.resolve(import.meta.dirname, ".."), execute = promisify(execFile), pause = ms => new Promise(resolve => setTimeout(resolve, ms));
const output = path.join(root, "evidence/2026-11-01-webcodecs-vp9-first-smoke.json");
await assert.rejects(access(output), { code: "ENOENT" });
const sha = value => createHash("sha256").update(value).digest("hex");
const hashFile = async file => { const hash = createHash("sha256"); for await (const bytes of createReadStream(file, { highWaterMark: 262144 })) hash.update(bytes); return hash.digest("hex"); };
const original = async () => ({ bytes: (await stat(path.join(root, "test.mkv"))).size, sha256: await hashFile(path.join(root, "test.mkv")) });
const expectedOriginal = { bytes: 2958573265, sha256: "31f36695b5b44c62125a9e4264e84dc085accd21c02cc3487aae597f54b9db34" };
const report = { startedAt: new Date().toISOString(), status: "intent-recorded-before-browser-launch", failures: [], sourcePins: {}, blankSamples: [],
  scope: "One genuine private VP9 small-worker OPFS conversion with native validation; NOT full production UI, direct picker, A/B speed or original/near10GB qualification",
  fullStressAcceptance: false, speedGainProven: false, publicAcceptance: false, headed: false, browserServicesDisabled: false,
  formula: "(peak complete Chromium tree private bytes during conversion - earliest stable clean blank tree private bytes) / 1048576" };
await writeFile(output, JSON.stringify(report, null, 2) + "\n", { flag: "wx" });
let runtime, server, chrome, browser, observer, nativeMonitor, serverBirth, chromeBirth, observerBirth, stageIdentity, outputFile;
let serverLog = "", tracing = false;
const stage = path.join(root, "dist/client/engines/webcodecs-vp9");
const stopKnown = async (child, birth) => {
  if (!child || child.exitCode !== null || child.signalCode !== null) return;
  assert.ok(birth); assert.deepEqual(await queryReliableProcessIdentity(child.pid), birth);
  await execute("taskkill.exe", ["/PID", String(child.pid), "/T", "/F"], { windowsHide: true, timeout: 15000, maxBuffer: 16384 });
};
try {
  report.executedHead = (await execute(process.env.WITHIN_GIT_EXECUTABLE ?? "git", ["rev-parse", "HEAD"],
    { cwd: root, windowsHide: true, timeout: 10000, maxBuffer: 16384 })).stdout.trim();
  assert.match(report.executedHead, /^[0-9a-f]{40}$/);
  report.hostMemory = await inspectStressHostMemory(); assert.equal(report.hostMemory.safeToStart, true);
  const disk = await statfs(root); assert.ok(disk.bavail * disk.bsize >= 1024 ** 3);
  report.originalBefore = await original(); assert.deepEqual(report.originalBefore, expectedOriginal);
  report.browserPin = await inspectInstalledChromePin();
  for (const file of ["scripts/test-webcodecs-vp9-smoke.mjs", "workers/webcodecs-vp9-qualification.worker.ts", "workers/media-remux.ts",
    "workers/webcodecs-vp9-core.ts", "workers/webcodecs-vp9-bridge.mjs", "workers/random-access-destination.ts", "lib/capability-registry.ts"])
    report.sourcePins[file] = sha(await readFile(path.join(root, file)));
  const native = JSON.parse(await readFile(path.join(root, "evidence/2026-11-01-webcodecs-vp9-native-41305653513.json")));
  assert.equal(native.publicAcceptance, false); const input = path.resolve(root, native.retainedDirectory);
  assert.equal(input, path.join(root, "work/webcodecs-vp9-input-41305653513")); assert.equal(await realpath(input), input);
  runtime = await createOwnedRuntimeScratch("webcodecs-vp9-smoke-");
  const fixture = path.join(runtime.directory, "explicit-bt709.mkv"), converted = path.join(runtime.directory, "browser-output.webm");
  const ffmpeg = "C:/ffmpeg/bin/ffmpeg.exe", ffprobe = "C:/ffmpeg/bin/ffprobe.exe";
  const fixtureArgs = ["-hide_banner", "-loglevel", "error", "-nostdin", "-f", "lavfi", "-i", "testsrc2=size=320x180:rate=24", "-t", "2",
    "-an", "-c:v", "libx264", "-threads", "1", "-pix_fmt", "yuv420p", "-color_primaries", "bt709", "-color_trc", "bt709", "-colorspace", "bt709", "-color_range", "tv", fixture];
  await execute(ffmpeg, fixtureArgs, { cwd: root, env: runtime.env, windowsHide: true, timeout: 30000, maxBuffer: 65536 });
  report.fixture = { generatedBeforeBrowser: true, args: fixtureArgs.slice(0, -1), bytes: (await stat(fixture)).size, sha256: await hashFile(fixture),
    notTheProtectedOriginal: true, originalStressSubstituted: false };
  await assert.rejects(access(stage), { code: "ENOENT" });
  assert.equal(await realpath(path.dirname(stage)), path.dirname(stage));
  await mkdir(stage); stageIdentity = await lstat(stage, { bigint: true });
  for (const file of ["within-webcodecs-vp9.mjs", "within-webcodecs-vp9.wasm"]) {
    assert.equal(sha(await readFile(path.join(input, file))), native.nativeContract.artifacts[file].sha256);
    await copyFile(path.join(input, file), path.join(stage, file));
  }
  const compiled = await build({ entryPoints: ["workers/webcodecs-vp9-qualification.worker.ts"], bundle: true, format: "esm", platform: "browser", write: false });
  assert.equal(compiled.outputFiles.length, 1); report.qualificationWorkerSha256 = sha(compiled.outputFiles[0].contents);
  await writeFile(path.join(stage, "qualification.mjs"), compiled.outputFiles[0].contents, { flag: "wx" });
  const lease = createServer(); await new Promise(resolve => lease.listen(0, "127.0.0.1", resolve));
  const port = lease.address().port; await new Promise(resolve => lease.close(resolve)); const origin = `http://127.0.0.1:${port}`;
  server = spawn(process.execPath, ["node_modules/wrangler/bin/wrangler.js", "dev", "--config", "dist/server/wrangler.json", "--port", String(port),
    "--persist-to", path.join(runtime.directory, "wrangler")], { cwd: root, env: { ...runtime.env, WRANGLER_SEND_METRICS: "false" }, windowsHide: true, stdio: ["ignore", "pipe", "pipe"] });
  serverBirth = await queryReliableProcessIdentity(server.pid); assert.ok(serverBirth);
  for (const pipe of [server.stdout, server.stderr]) pipe.on("data", bytes => { serverLog = (serverLog + bytes).slice(-16384); });
  let ready = false; const deadline = Date.now() + 30000;
  while (!ready && Date.now() < deadline) {
    assert.equal(server.exitCode, null, serverLog);
    try { const response = await fetch(origin, { method: "HEAD", signal: AbortSignal.timeout(2000) }); ready = response.ok; } catch { /* Startup only. */ }
    if (!ready) await pause(500);
  }
  assert.ok(ready, serverLog);
  const profile = path.join(runtime.directory, "profile"); await mkdir(profile);
  report.chromeArguments = ["--headless=new", "--remote-debugging-port=0", `--user-data-dir=${profile}`, "--no-first-run", "--no-default-browser-check", "about:blank"];
  chrome = spawn(report.browserPin.launcher.path, report.chromeArguments, { cwd: root, env: runtime.env, windowsHide: true, stdio: "ignore" });
  chromeBirth = await queryReliableProcessIdentity(chrome.pid); assert.ok(chromeBirth);
  observer = await startParallelMemoryObserver(chrome.pid, runtime.directory, { startMonitor: async (...args) => {
    nativeMonitor = await startChromiumMemoryMonitor(...args); return nativeMonitor;
  } }); observerBirth = await queryReliableProcessIdentity(observer.pid); assert.ok(observerBirth);
  let debug; const debugDeadline = Date.now() + 30000;
  while (!debug && Date.now() < debugDeadline) {
    assert.equal(chrome.exitCode, null);
    try { debug = (await readFile(path.join(profile, "DevToolsActivePort"), "utf8")).trim().split(/\r?\n/); } catch { await pause(250); }
  }
  assert.ok(debug && Number(debug[0]) > 0); browser = await chromium.connectOverCDP(`http://127.0.0.1:${Number(debug[0])}`);
  const context = browser.contexts()[0], page = context.pages()[0]; assert.equal(page.url(), "about:blank");
  const baselineStarted = Date.now();
  while (!report.blankBaseline && Date.now() - baselineStarted < 30000) {
    observer.healthy(); assert.equal(page.url(), "about:blank");
    let sample = { privateBytes: null, rssBytes: null, processes: null, sampleError: null };
    try { sample = { ...sample, ...await sampleChromiumTree(chrome.pid) }; } catch (error) { sample.sampleError = String(error); }
    report.blankSamples.push({ timestamp: new Date().toISOString(), elapsedMs: Date.now() - baselineStarted, ...sample });
    report.blankBaseline = stableWindow(report.blankSamples); if (!report.blankBaseline) await pause(1000);
  }
  assert.equal(report.blankBaseline?.stable, true); report.baselineAdjusted = false;
  observer.setPhase("loaded-idle"); await context.tracing.start({ screenshots: true, snapshots: true }); tracing = true;
  report.forbiddenRequests = [];
  await context.route("**/*", async route => {
    const request = route.request(), url = new URL(request.url());
    if (url.origin !== origin || !["GET", "HEAD"].includes(request.method())) {
      if (report.forbiddenRequests.length < 32) report.forbiddenRequests.push({ method: request.method(), origin: url.origin, path: url.pathname });
      await route.abort();
    } else await route.continue();
  });
  await page.goto(origin + "/?test=1"); await page.locator('input[type="file"]').first().setInputFiles(fixture);
  report.loadedIdle = await sampleChromiumTree(chrome.pid);
  outputFile = await open(converted, "wx"); let exported = 0;
  await page.exposeBinding("__appendPrivateVp9Output", async ({ frame }, bytes) => {
    assert.equal(frame, page.mainFrame()); assert.ok(Array.isArray(bytes) && bytes.length > 0 && bytes.length <= 65536 && bytes.every(x => Number.isInteger(x) && x >= 0 && x <= 255));
    const data = Buffer.from(bytes); await outputFile.write(data, 0, data.length, exported); exported += data.length;
  });
  observer.setPhase("conversion"); report.conversionStartedAt = new Date().toISOString();
  report.browserResult = await page.evaluate(async () => {
    const root = await navigator.storage.getDirectory(), name = "within-private-vp9-first-smoke.webm";
    const handle = await root.getFileHandle(name, { create: true }), file = document.querySelector('input[type="file"]').files[0];
    const worker = new Worker("/engines/webcodecs-vp9/qualification.mjs", { type: "module" }), phases = [];
    try {
      return await new Promise((resolve, reject) => {
        const timer = setTimeout(() => reject(new Error("Private conversion exceeded sixty-second smoke deadline")), 60000);
        worker.onerror = event => { clearTimeout(timer); reject(new Error(event.message)); };
        worker.onmessage = ({ data }) => {
          if (data.type === "progress") { if (phases.length === 32) phases.shift(); phases.push(data.phase); return; }
          clearTimeout(timer); resolve({ ...data, phases });
        };
        worker.postMessage({ file, output: handle, cancellation: new SharedArrayBuffer(4), nativeProfile: 10, implementation: "candidate",
          video: { codec: "vp9", quality: "automatic", maxWidth: 320, bitRateBps: 600000, frameRateFps: 24 } });
      });
    } finally { worker.terminate(); }
  });
  report.conversionEndedAt = new Date().toISOString(); await observer.through(Date.now()); observer.setPhase("validation-export");
  const peaks = observer.peaks(["conversion"]); report.memory = { ...peaks,
    incrementalPrivateMiB: peaks.peak ? (peaks.peak.privateBytes - report.blankBaseline.privateBytes) / 1048576 : null };
  assert.equal(report.browserResult.type, "complete", report.browserResult.message);
  await page.evaluate(async () => {
    const root = await navigator.storage.getDirectory(), handle = await root.getFileHandle("within-private-vp9-first-smoke.webm");
    const file = await handle.getFile();
    for (let offset = 0; offset < file.size; offset += 65536)
      await window.__appendPrivateVp9Output(Array.from(new Uint8Array(await file.slice(offset, offset + 65536).arrayBuffer())));
    await root.removeEntry("within-private-vp9-first-smoke.webm");
  });
  await outputFile.close(); outputFile = undefined; assert.ok(exported > 0); report.exportedBytes = exported;
  const probe = await execute(ffprobe, ["-v", "error", "-count_frames", "-show_streams", "-show_format", "-of", "json", converted],
    { cwd: root, env: runtime.env, windowsHide: true, timeout: 30000, maxBuffer: 1048576 });
  report.outputProbe = JSON.parse(probe.stdout); assert.equal(report.outputProbe.streams.length, 1);
  const stream = report.outputProbe.streams[0]; assert.equal(stream.codec_name, "vp9"); assert.equal(stream.width, 320); assert.equal(stream.height, 180);
  assert.equal(Number(stream.nb_read_frames), 48); assert.ok(Math.abs(Number(report.outputProbe.format.duration) - 2) <= 0.05);
  await execute(ffmpeg, ["-hide_banner", "-loglevel", "error", "-nostdin", "-i", converted, "-map", "0:v:0", "-f", "null", "-"],
    { cwd: root, env: runtime.env, windowsHide: true, timeout: 30000, maxBuffer: 65536 }); report.independentFullDecodePassed = true;
  assert.equal(report.browserResult.encoder.frames, 48); assert.equal(report.browserResult.encoder.packets, 48);
  assert.equal(report.browserResult.encoder.currentPackedBytes, 0); assert.equal(report.browserResult.encoder.pendingPacketBytes, 0);
  assert.equal(report.browserResult.metrics.peakPendingOperations, 1); assert.deepEqual(report.forbiddenRequests, []);
  assert.ok(peaks.validSamples > 0 && peaks.unavailableSamples === 0 && report.memory.incrementalPrivateMiB <= 250);
  report.status = "passed-one-small-private-browser-conversion-not-public-or-stress-acceptance";
} catch (error) { report.status = "failed-private-vp9-browser-smoke"; report.failures.push(String(error.stack ?? error)); process.exitCode = 1; }
finally {
  try {
    if (tracing) {
      const context = browser.contexts()[0];
      if (report.failures.length) {
        const trace = path.join(root, "output/playwright/2026-11-01-webcodecs-vp9-first-smoke-failure.zip");
        await mkdir(path.dirname(trace), { recursive: true }); await context.tracing.stop({ path: trace }); report.failureTrace = { path: path.relative(root, trace), bytes: (await stat(trace)).size, sha256: await hashFile(trace) };
      } else await context.tracing.stop();
    }
  } catch (error) { report.failures.push("Trace: " + error); }
  try { await observer?.stop(); report.nativeMemory = observer?.report() ?? null; report.nativeOwnership = nativeMonitor?.ownershipSummary() ?? null; }
  catch (error) { report.failures.push("Memory observer: " + error); }
  await outputFile?.close(); await browser?.close().catch(() => {});
  for (const [child, birth] of [[chrome, chromeBirth], [server, serverBirth]]) {
    try { await stopKnown(child, birth); } catch (error) { report.failures.push("Owned process cleanup: " + error); }
  }
  report.processCleanup = [];
  for (const birth of [chromeBirth, serverBirth, observerBirth].filter(Boolean)) report.processCleanup.push(await observeOwnedProcessExit(birth));
  try {
    assert.ok(report.processCleanup.every(x => x.status === "owned-identity-absent"));
    if (stageIdentity) {
      const now = await lstat(stage, { bigint: true }); assert.equal(now.dev, stageIdentity.dev); assert.equal(now.ino, stageIdentity.ino);
      assert.ok(!now.isSymbolicLink()); assert.equal(await realpath(stage), stage); await rm(stage, { recursive: true, force: true }); report.ownedStaticStageRemoved = true;
    }
    await runtime?.close(); report.ownedRuntimeRemoved = Boolean(runtime);
    report.originalAfter = await original(); assert.deepEqual(report.originalAfter, expectedOriginal);
    assertInstalledChromePinsEqual(report.browserPin, await inspectInstalledChromePin());
    for (const [file, digest] of Object.entries(report.sourcePins)) assert.equal(sha(await readFile(path.join(root, file))), digest);
  } catch (error) { report.failures.push("Final cleanup/integrity: " + error); }
  if (report.failures.length) { report.status = "failed-private-vp9-browser-smoke"; process.exitCode = 1; }
  report.finishedAt = new Date().toISOString(); report.serverLogTail = serverLog.slice(-4096);
  await writeFile(output, JSON.stringify(report, null, 2) + "\n");
  console.log(JSON.stringify({ output, status: report.status, browserResult: report.browserResult, memory: report.memory ? {
    incrementalPrivateMiB: report.memory.incrementalPrivateMiB, validSamples: report.memory.validSamples, unavailableSamples: report.memory.unavailableSamples } : null,
    ownedRuntimeRemoved: report.ownedRuntimeRemoved, failures: report.failures }));
}
