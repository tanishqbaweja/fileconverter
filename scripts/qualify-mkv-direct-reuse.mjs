// Private normal-service browser A/B; this small control is not a speed benchmark.
import "./lib/hidden-unit-subprocesses.mjs";
import assert from "node:assert/strict";
import { execFile, spawn } from "node:child_process";
import { createHash } from "node:crypto";
import { createReadStream } from "node:fs";
import { readFile, readdir, stat, statfs, writeFile } from "node:fs/promises";
import { createServer } from "node:net";
import path from "node:path";
import { setTimeout as pause } from "node:timers/promises";
import { promisify } from "node:util";
import { gzipSync } from "node:zlib";
import { chromium } from "playwright";
import { createOwnedRuntimeScratch, finishOwnedCleanup } from "./lib/owned-runtime-scratch.mjs";
import { startOwnedProductionTestServer } from "./lib/owned-production-test-server.mjs";
import { startClassifiedChromiumMemoryMonitor } from "./lib/birth-type-capture.mjs";
import { stableWindow } from "./lib/chromium-private-memory.mjs";
import { inspectInstalledChromePin, assertInstalledChromePinsEqual } from "./lib/installed-chrome-pin.mjs";
import { inspectStressHostMemory } from "./lib/host-memory-preflight.mjs";
import { cleanupOwnedChromium, queryObservedPidCensus } from "./lib/owned-chromium-cleanup.mjs";
import { reconcileChromiumBirths } from "./lib/reconcile-chromium-births.mjs";
import { queryReliableProcessIdentity } from "./lib/reliable-owned-identity.mjs";
import { buildMkvDirectReuseOverlay } from "./lib/mkv-direct-reuse-overlay.mjs";
import { isCompatibilityStaticPath } from "./lib/installed-compatibility-plan.mjs";
import { classifyPrivateRequest } from "./lib/private-browser-request.mjs";
import { selectOwnedLocalBrowserFile } from "./lib/select-owned-local-browser-file.mjs";
import { encodeBoundedValidationChunk } from "./lib/bounded-validation-chunk.mjs";
import { bindOpfsOutputValidationBacking, assertOpfsOutputValidationBackingUnchanged } from "./lib/opfs-output-validation-backing.mjs";
import { cancelBrowserConversionBeforeCleanup } from "./lib/cancel-browser-conversion-before-cleanup.mjs";
import { compareSmallMkvPacketClocks } from "./lib/mkv-direct-packet-clocks.mjs";
import { readMkvMp4TimelineBoxes } from "./lib/mkv-mp4-timeline-boxes.mjs";

assert.equal(process.platform, "win32");
const stagedDiagnostic = process.argv[2] === "--staged-clock-diagnostic";
assert.equal(process.argv.length, stagedDiagnostic ? 3 : 2);
const root = path.resolve(import.meta.dirname, ".."), execute = promisify(execFile), profileId = "mkv-to-mp4";
const syntheticName = "within-test-synthetic-hevc-aac";
const sha = bytes => createHash("sha256").update(bytes).digest("hex"), stamp = new Date().toISOString().replaceAll(/[:.]/g, "-");
const report = { schemaVersion: 1, status: "running", scope: "Small real MKV-to-MP4 packet copy. Two private async direct arms; not the public staged route, original-file, speed, or promotion.",
  headed: false, browserServicesDisabled: false, peakLimitMiB: 250, cleanupLimitMiB: 96, nativeConversionUsed: false,
  originalMediaSelected: false, productionFilesReplaced: false, speedGainProven: false, publicAcceptance: false, arms: [], failures: [] };
if (stagedDiagnostic) report.scope = "One unchanged public staged-handle MKV-to-MP4 small-fixture diagnostic against retained private output hashes; not a rerun of the direct A/B or acceptance of shifted clocks.";
const hashFile = async file => {
  const hash = createHash("sha256");
  for await (const bytes of createReadStream(file, { highWaterMark: 262144 })) hash.update(bytes);
  return hash.digest("hex");
};
const prefix = `evidence/${stamp}-mkv-${stagedDiagnostic ? "staged-clock" : "direct-reuse"}`;
const ffmpeg = "C:/ffmpeg/bin/ffmpeg.exe", ffprobe = "C:/ffmpeg/bin/ffprobe.exe";
const runNative = (file, args, env) => execute(file, args, { cwd: root, env, windowsHide: true, timeout: 90000, maxBuffer: 2097152 });
const probe = async (file, env) => JSON.parse((await runNative(ffprobe, ["-v", "error", "-count_packets", "-show_streams", "-show_format", "-of", "json", file], env)).stdout);
const packetClocks = async (file, env) => JSON.parse((await runNative(ffprobe,
  ["-v", "error", "-show_packets", "-show_entries", "packet=stream_index,pts_time,dts_time", "-of", "json", file], env)).stdout).packets;
const packets = async (file, env) => (await runNative(ffmpeg,
  ["-v", "error", "-i", file, "-map", "0:v:0", "-map", "0:a:0", "-c", "copy", "-f", "streamhash", "-hash", "sha256", "-"], env)).stdout.trim();
const disk = await statfs(root); assert.ok(disk.bavail * disk.bsize >= 512 * 1024 ** 2, "Repository scratch needs at least 512 MiB");
const protectedPath = path.join(root, "test.mkv");
const original = async () => ({ bytes: (await stat(protectedPath)).size, sha256: await hashFile(protectedPath) });
const assets = new Set();
for (const dir of ["assets", "engines"]) for (const name of await readdir(path.join(root, "dist/client", dir), { recursive: true }))
  if (!name.includes("..")) assets.add(`/${dir}/${name.replaceAll("\\", "/")}`);
for (const name of await readdir(path.join(root, "dist/client"))) assets.add("/" + name);
const stable = async (get, rows) => {
  const selected = [], deadline = Date.now() + 30000;
  while (Date.now() < deadline) {
    await get(); const last = rows.at(-1);
    if (last && last.sequence !== selected.at(-1)?.sequence) selected.push({ ...last, elapsedMs: Date.parse(last.timestamp) });
    const value = stableWindow(selected); if (value) return value;
    await pause(750);
  }
  throw new Error("Normal-service blank/idle/cleanup stable memory is unavailable");
};
const port = async () => {
  const socket = createServer();
  return new Promise((resolve, reject) => {
    socket.once("error", reject); socket.listen(0, "127.0.0.1", () => { const selected = socket.address().port;
      socket.close(error => error ? reject(error) : resolve(selected)); });
  });
};

async function arm(mode, fixture, fixtureRuntime, baseline) {
  const result = { mode, status: "running", requests: 0, workerResponses: 0, directEngineRequests: { module: 0, wasm: 0 }, forbiddenRequests: [], cases: [], failures: [] };
  report.arms.push(result);
  const runtime = await createOwnedRuntimeScratch("mkv-direct-reuse-");
  const env = { ...runtime.env, WRANGLER_SEND_METRICS: "false", NEXT_TELEMETRY_DISABLED: "1" };
  const samples = []; let server, chrome, identity, monitor, browser, page, timer, pending, activeAt, until, rejectStop, errorSeen;
  const stop = new Promise((_, reject) => { rejectStop = reject; }); void stop.catch(() => {});
  const fail = error => { errorSeen ??= error; rejectStop(error); };
  const guard = work => Promise.race([stop, work]);
  const drain = () => pending ??= (async () => {
    if (!monitor) return;
    const batch = await monitor.drain(); assert.equal(batch.overflow, false);
    assert.ok(samples.length + batch.samples.length <= 3000, "Finite native journal"); samples.push(...batch.samples);
    if (activeAt !== undefined) for (const row of batch.samples) {
      if (Date.parse(row.timestamp) >= activeAt && (until === undefined || Date.parse(row.timestamp) <= until) && row.privateBytes !== null &&
          (row.privateBytes - result.blank.privateBytes) / 1048576 > report.peakLimitMiB) fail(new Error("Unchanged 250 MiB whole-Chromium gate exceeded"));
    }
  })().finally(() => { pending = null; });
  try {
    result.host = await inspectStressHostMemory(); assert.equal(result.host.safeToStart, true);
    const overlay = mode === "staged" ? null : await buildMkvDirectReuseOverlay({ root, directory: runtime.directory, mode });
    if (overlay) result.overlay = overlay.proof;
    else {
      const names = [...assets].filter(name => /^\/assets\/conversion\.worker-[\w-]+\.js$/.test(name)); assert.equal(names.length, 1);
      const workerSha256 = await hashFile(path.join(root, "dist/client", names[0].slice(1)));
      assert.equal(workerSha256, baseline.retained.arms[0].overlay.releaseWorkerSha256);
      result.releaseWorker = { asset: names[0], sha256: workerSha256, overrides: false, requests: 0 };
    }
    result.browser = await inspectInstalledChromePin(); assertInstalledChromePinsEqual(result.browser, baseline.browser);
    server = await startOwnedProductionTestServer({ root, directory: runtime.directory, env, port: await port() });
    const profile = path.join(runtime.directory, "profile");
    result.launch = ["--headless=new", "--remote-debugging-port=0", `--user-data-dir=${profile}`, "--no-first-run", "--no-default-browser-check", "about:blank"];
    chrome = spawn(result.browser.launcher.path, result.launch, { cwd: root, env, windowsHide: true, stdio: "ignore" });
    chrome.on("error", fail);
    identity = await queryReliableProcessIdentity(chrome.pid); assert.ok(identity); result.identity = identity;
    monitor = await startClassifiedChromiumMemoryMonitor(chrome.pid, runtime.directory, 100);
    let debugPort;
    for (let attempt = 0; attempt < 45 && !debugPort; attempt++) {
      try { debugPort = /^(\d+)\r?\n/.exec(await readFile(path.join(profile, "DevToolsActivePort"), "utf8"))?.[1]; }
      catch (error) { if (error.code !== "ENOENT") throw error; }
      if (!debugPort) await pause(250);
    }
    assert.ok(debugPort); browser = await chromium.connectOverCDP(`http://127.0.0.1:${debugPort}`);
    const context = browser.contexts()[0]; page = context.pages()[0]; await page.goto("about:blank");
    result.blank = await stable(drain, samples);
    await context.addInitScript(`window.__WITHIN_AUDIO_VALIDATION_CHUNK__=(${encodeBoundedValidationChunk.toString()});`);
    await context.route("**/*", async route => {
      const request = route.request(), method = request.method(), url = request.url();
      let frameUrl = null; try { frameUrl = request.frame()?.url() ?? null; } catch { /* worker-owned */ }
      const kind = classifyPrivateRequest({ method, url, frameUrl, serviceWorkerUrl: request.serviceWorker?.()?.url() ?? null,
        postData: ["GET", "HEAD"].includes(method) ? request.postData() : "blocked-non-read" }, server.baseURL);
      const faultUrl = server.baseURL + "/?test=1&directory=1&fault=write";
      if (++result.requests > 256 || !(kind === "browser-local" || kind === "app-static" &&
          (url === faultUrl || isCompatibilityStaticPath(url, server.baseURL, assets)))) {
        if (result.forbiddenRequests.length < 16) result.forbiddenRequests.push({ method, kind, urlSha256: sha(url) });
        fail(new Error("Request outside exact built-asset/privacy policy")); await route.abort();
      } else if (overlay && url === server.baseURL + overlay.requestedAsset) {
        try {
          assert.equal(method, "GET"); assert.ok(result.workerResponses < 16);
          const response = await route.fetch({ maxRedirects: 0 });
          try {
            assert.equal(response.status(), 200); const headers = response.headers();
            assert.equal(headers["cross-origin-embedder-policy"], "require-corp");
            assert.equal(headers["cross-origin-resource-policy"], "same-origin");
            assert.equal(headers["cross-origin-opener-policy"], "same-origin");
            assert.match(headers["content-security-policy"], /wasm-unsafe-eval/);
            delete headers["content-encoding"]; delete headers["content-length"]; delete headers.etag;
            headers["cache-control"] = "no-store";
            await route.fulfill({ response, headers, path: overlay.file, contentType: "text/javascript" }); result.workerResponses++;
          } finally { await response.dispose(); }
        } catch (error) { fail(error); await route.abort().catch(() => {}); }
      } else {
        if (result.releaseWorker && url === server.baseURL + result.releaseWorker.asset) result.releaseWorker.requests++;
        if (url === server.baseURL + "/engines/remux/within-direct.mjs") result.directEngineRequests.module++;
        if (url === server.baseURL + "/engines/remux/within-direct.wasm") result.directEngineRequests.wasm++;
        await route.continue();
      }
    });
    const open = async (fault = false) => {
      await guard(page.goto(server.baseURL + "/?test=1&directory=1" + (fault ? "&fault=write" : "")));
      await guard(page.waitForFunction(() => window.__WITHIN_TEST__?.getState().workerStatus === "ready", undefined, { timeout: 20000 }));
      assert.ok(await page.evaluate(() => crossOriginIsolated));
    };
    const entries = () => page.evaluate(async () => {
      const directory = await navigator.storage.getDirectory(), found = [];
      for await (const [name, handle] of directory.entries()) {
        if (name.startsWith("within-")) { if (found.length >= 16 || handle.kind !== "file") throw new Error("Unexpected OPFS entries");
          found.push({ name, bytes: (await handle.getFile()).size }); }
      }
      return found;
    });
    const remove = name => page.evaluate(async name => (await navigator.storage.getDirectory()).removeEntry(name), name);
    await open(); result.loaded = await stable(drain, samples); activeAt = Date.now();
    timer = setInterval(() => void drain().catch(fail), 500);
    async function job(fault = false) {
      const row = { fault, selection: await guard(selectOwnedLocalBrowserFile(page, fixture, fixtureRuntime.directory)) };
      result.cases.push(row);
      await guard(page.locator('[data-testid="format-select"]').selectOption(profileId));
      await guard(page.locator('[data-testid="convert-button"]').click());
      await guard(page.waitForFunction(() => ["complete", "error", "cancelled"].includes(window.__WITHIN_TEST__?.getState().jobState), undefined, { timeout: 45000 }));
      const state = await page.evaluate(() => window.__WITHIN_TEST__.getState()); row.state = state.jobState; row.metrics = state.metrics;
      const leftovers = await entries(); assert.ok(leftovers.every(item => !item.name.startsWith("within-stage-")));
      if (fault) {
        assert.equal(row.state, "error"); assert.match(state.error, /destination rejected a bounded write/);
        assert.ok(leftovers.every(item => item.name.startsWith("within-test-") && item.bytes === 0));
        row.onlyEmptyPlaceholders = true;
        for (const item of leftovers) await remove(item.name);
      } else {
        assert.equal(row.state, "complete"); assert.equal(state.opfsName, null);
        assert.deepEqual(state.batchOutputNames, [`${syntheticName}.mp4`]); const name = state.batchOutputNames[0];
        assert.ok(row.metrics.outputBytes > 2 * 1048576 && row.metrics.outputBytes <= 8 * 1048576);
        const binding = await bindOpfsOutputValidationBacking(page, profile, name, row.metrics.outputBytes); row.binding = binding.proof;
        const output = await probe(binding.file, env), inStreams = baseline.probe.streams, outStreams = output.streams;
        row.validation = { outputSha256: await hashFile(binding.file), packetHashes: await packets(binding.file, env),
          clocks: compareSmallMkvPacketClocks(baseline.clocks, await packetClocks(binding.file, env)),
          streams: outStreams.map(s => ({ codec: s.codec_name, packetCount: Number(s.nb_read_packets), nominalFrameRate: s.r_frame_rate, averageFrameRate: s.avg_frame_rate })),
          sourceVideoAverageRate: inStreams[0].avg_frame_rate, durationDeltaSeconds: Math.abs(Number(output.format.duration) - Number(baseline.probe.format.duration)),
          sourceHeader: { startSeconds: Number(baseline.probe.format.start_time), durationSeconds: Number(baseline.probe.format.duration) },
          outputHeader: { startSeconds: Number(output.format.start_time), durationSeconds: Number(output.format.duration) } };
        if (mode === "staged") row.validation.serializedTimeline = await readMkvMp4TimelineBoxes(binding.file);
        await runNative(ffmpeg, ["-v", "error", "-xerror", "-threads", "1", "-i", binding.file,
          "-map", "0:v:0", "-map", "0:a:0", "-f", "null", "-"], env);
        row.validation.fullDecode = true;
        await assertOpfsOutputValidationBackingUnchanged(binding); await remove(name);
        assert.deepEqual(outStreams.map(s => s.codec_name), ["hevc", "aac"]);
        for (const [index, fields] of [[0, ["width", "height", "r_frame_rate", "pix_fmt"]], [1, ["sample_rate", "channels"]]]) {
          for (const field of fields) assert.equal(outStreams[index][field], inStreams[index][field]);
          assert.equal(outStreams[index].nb_read_packets, inStreams[index].nb_read_packets);
        }
        assert.equal(outStreams[0].r_frame_rate, "24/1");
        assert.match(output.format.format_name, /mp4/);
        assert.equal(row.validation.packetHashes, baseline.packetHashes);
        const durationPassed = row.validation.durationDeltaSeconds < 0.05;
        const packetClocksPassed = row.validation.clocks.every(track => track.maximumPtsErrorUs <= 1000 && track.outputDtsMonotonic);
        row.validation.timingGate = { durationPassed, packetClocksPassed, passed: durationPassed && packetClocksPassed,
          maxDurationDeltaSecondsExclusive: 0.05, maxPacketPtsDeltaUs: 1000 };
        if (mode !== "staged") {
          assert.ok(durationPassed, "Container duration differs by at least 50 ms");
          assert.ok(packetClocksPassed, "Packet clock exceeds one source tick or output DTS is not monotonic");
        } else {
          row.validation.byteIdenticalToRetainedDirect = baseline.retained.arms.every(a => a.cases[0].validation.outputSha256 === row.validation.outputSha256);
          assert.equal(row.metrics.peakScratchBytes, row.metrics.outputBytes, "The unchanged staged path must actually stage the full small output");
        }
        assert.equal(row.metrics.activeWorkerCount, 1);
        // The native bridge counts both its shared Wasm backing and the 4-byte
        // cancellation flag. Neither the direct writer nor the reuse buffer adds SAB.
        assert.ok(row.metrics.peakWasmMemoryBytes >= 24 * 1048576 && row.metrics.peakWasmMemoryBytes <= 64 * 1048576);
        assert.equal(row.metrics.sharedArrayBufferBytes, row.metrics.peakWasmMemoryBytes + 4);
        assert.equal(row.metrics.scratchBytes ?? 0, 0); assert.ok(row.metrics.maxReadChunkBytes <= 262144);
        assert.ok(row.metrics.maxWriteChunkBytes <= 1048576 && row.metrics.peakQueuedBytes <= 1048576);
        assert.equal(row.metrics.peakPendingOperations, 1); assert.equal(row.metrics.pendingOperations, 0);
      }
      assert.deepEqual(await entries(), []); row.outputRemoved = true;
    }
    await job();
    if (mode === "reuse") { await open(true); await job(true); await open(); await job(); }
    result.cleanupStable = await guard(stable(drain, samples)); until = Date.now(); await drain();
    assert.equal(errorSeen, undefined); assert.deepEqual(result.forbiddenRequests, []);
    if (mode === "staged") { assert.equal(result.workerResponses, 0); assert.ok(result.releaseWorker.requests > 0); }
    else assert.ok(result.workerResponses > 0);
    assert.ok(result.directEngineRequests.module > 0 && result.directEngineRequests.wasm > 0);
    result.status = mode === "staged" ? "completed-staged-timeline-diagnostic-not-acceptance" : "passed-private-small-direct-control";
  } catch (error) { result.status = "failed-not-acceptance"; result.failures.push(String(error.stack ?? error).slice(0, 2048)); }
  finally {
    until ??= Date.now(); clearInterval(timer); await pending?.catch(fail);
    if (monitor) { await drain().catch(fail); await monitor.close().catch(fail); result.observer = monitor.ownershipSummary(); }
    if (page && !page.isClosed()) {
      try { result.jobCleanup = await cancelBrowserConversionBeforeCleanup(page); }
      catch (error) { fail(error); }
    }
    try {
      await finishOwnedCleanup([async () => {
        if (!identity) { assert.ok(!chrome || chrome.exitCode !== null, "Browser birth identity was unavailable"); return; }
        result.browserCleanup = await cleanupOwnedChromium({ identity, observedPids: [...new Set(samples.flatMap(s => (s.processes ?? []).map(p => p.pid)))],
          disconnect: async () => { await browser?.close(); } });
        if (result.browserCleanup.status !== "owned-observed-pids-absent") {
          const observedPids = result.browserCleanup.observedPids;
          result.birthCleanup = reconcileChromiumBirths({ identity, observedPids, samples, current: await queryObservedPidCensus(observedPids) });
          assert.equal(result.birthCleanup.allObservedBirthsAbsent, true);
        }
      }, async () => { if (server) result.serverCleanup = await server.close(); }]);
      await runtime.close(); result.ownedRuntimeRemoved = true;
    } catch (error) { fail(error); }
    if (activeAt !== undefined) {
      const active = samples.filter(s => Date.parse(s.timestamp) >= activeAt && Date.parse(s.timestamp) <= until);
      const valid = active.filter(s => s.privateBytes !== null && Array.isArray(s.processes));
      if (valid.length) {
        for (const s of valid) assert.equal(s.processes.reduce((sum, p) => sum + p.privateBytes, 0), s.privateBytes);
        const peak = valid.reduce((a, b) => a.privateBytes >= b.privateBytes ? a : b);
        result.memory = { peak, incrementalPrivateMiB: (peak.privateBytes - result.blank.privateBytes) / 1048576,
          validSamples: valid.length, unavailableSamples: active.length - valid.length, start: activeAt, end: until,
          cleanupAboveIdleMiB: result.cleanupStable ? (result.cleanupStable.privateBytes - result.loaded.privateBytes) / 1048576 : null };
      }
    }
    if (result.status !== "failed-not-acceptance" && (!result.memory || result.memory.incrementalPrivateMiB > 250 ||
        result.memory.cleanupAboveIdleMiB === null || result.memory.cleanupAboveIdleMiB > 96)) fail(new Error("Unchanged native peak/cleanup gate failed"));
    if (errorSeen) { result.status = "failed-not-acceptance"; result.failures.push(String(errorSeen).slice(0, 2048)); }
    const raw = Buffer.from(JSON.stringify(samples)), packed = gzipSync(raw), file = `${prefix}-${mode}-native.json.gz`;
    await writeFile(path.join(root, file), packed, { flag: "wx" }); result.archive = { file, bytes: packed.length, sha256: sha(packed), decodedSha256: sha(raw) };
  }
}

let fixtureRuntime;
try {
  report.originalBefore = await original(); assert.deepEqual(report.originalBefore, { bytes: 2958573265, sha256: "31f36695b5b44c62125a9e4264e84dc085accd21c02cc3487aae597f54b9db34" });
  const sourceFiles = ["scripts/qualify-mkv-direct-reuse.mjs", "scripts/lib/mkv-direct-reuse-overlay.mjs", "scripts/lib/private-mkv-write-reuse.ts", "scripts/lib/mkv-direct-packet-clocks.mjs", "scripts/lib/mkv-mp4-timeline-boxes.mjs",
    "workers/media-remux.ts", "workers/conversion.worker.ts", "workers/random-access-destination.ts", "public/engines/remux/within-direct.mjs", "public/engines/remux/within-direct.wasm"];
  report.sourcePins = Object.fromEntries(await Promise.all(sourceFiles.map(async file => [file, await hashFile(path.join(root, file))])));
  report.executedHead = (await execute(process.env.WITHIN_GIT_EXECUTABLE ?? "git", ["rev-parse", "HEAD"], { cwd: root, windowsHide: true })).stdout.trim();
  fixtureRuntime = await createOwnedRuntimeScratch("mkv-direct-reuse-fixture-");
  const fixture = path.join(fixtureRuntime.directory, `${syntheticName}.mkv`);
  await runNative(ffmpeg, ["-v", "error", "-n", "-f", "lavfi", "-i", "testsrc2=size=1280x720:rate=24",
    "-f", "lavfi", "-i", "sine=frequency=553:sample_rate=48000", "-t", "12", "-c:v", "libx265", "-preset", "ultrafast",
    "-x265-params", "pools=1:frame-threads=1:log-level=error:keyint=48", "-b:v", "3600k", "-pix_fmt", "yuv420p", "-c:a", "aac", "-b:a", "128k", fixture], fixtureRuntime.env);
  const bytes = (await stat(fixture)).size; assert.ok(bytes > 2 * 1048576 && bytes < 8 * 1048576);
  const inputProbe = await probe(fixture, fixtureRuntime.env), packetHashes = await packets(fixture, fixtureRuntime.env);
  assert.deepEqual(inputProbe.streams.map(s => s.codec_name), ["hevc", "aac"]);
  assert.match(packetHashes, /^0,v,SHA256=[a-f0-9]{64}\r?\n1,a,SHA256=[a-f0-9]{64}$/i);
  report.fixture = { bytes, sha256: await hashFile(fixture), packetHashes };
  const baseline = { browser: await inspectInstalledChromePin(), probe: inputProbe, packetHashes, clocks: await packetClocks(fixture, fixtureRuntime.env) };
  if (stagedDiagnostic) {
    const file = "evidence/2026-11-08T00-23-59-928Z-mkv-direct-reuse.json", retained = await readFile(path.join(root, file));
    const digest = sha(retained); assert.equal(digest, "1106498457688f125da4e7bce849af797293c63820a87bdc18025da0449553ac");
    baseline.retained = JSON.parse(retained); report.retainedDirectControl = { file, sha256: digest };
    assert.equal(packetHashes, baseline.retained.fixture.packetHashes); assert.equal(bytes, baseline.retained.fixture.bytes);
    for (const file of ["public/engines/remux/within-direct.mjs", "public/engines/remux/within-direct.wasm"])
      assert.equal(report.sourcePins[file], baseline.retained.sourcePins[file]);
    await arm("staged", fixture, fixtureRuntime, baseline);
  } else for (const mode of ["fresh", "reuse"]) await arm(mode, fixture, fixtureRuntime, baseline);
  assert.equal(await hashFile(fixture), report.fixture.sha256);
  assertInstalledChromePinsEqual(await inspectInstalledChromePin(), baseline.browser);
  if (stagedDiagnostic) {
    assert.equal(report.arms[0].status, "completed-staged-timeline-diagnostic-not-acceptance");
    report.status = "completed-public-staged-clock-diagnostic-not-acceptance";
  } else {
    assert.ok(report.arms.every(a => a.status === "passed-private-small-direct-control"));
    const [fresh, reuse] = report.arms;
    for (const key of ["commonPrivateWorkerSha256", "commonPrivateWriterSha256", "releaseWorkerSha256"]) assert.equal(fresh.overlay[key], reuse.overlay[key]);
    assert.equal(new Set(report.arms.flatMap(a => a.cases.flatMap(c => c.validation?.outputSha256 ?? []))).size, 1);
    report.status = "passed-small-real-direct-buffer-ab-not-speed-or-public-acceptance";
  }
} catch (error) { report.status = "failed-not-acceptance"; report.failures.push(String(error.stack ?? error).slice(0, 2048)); }
finally {
  await finishOwnedCleanup([
    async () => { if (fixtureRuntime) {
      assert.ok(report.arms.every(arm => arm.ownedRuntimeRemoved), "Never remove a fixture while browser ownership is unresolved");
      await fixtureRuntime.close(); report.fixtureRuntimeRemoved = true;
    } },
    async () => { report.originalAfter = await original(); assert.deepEqual(report.originalAfter, report.originalBefore); },
    async () => { for (const [file, pin] of Object.entries(report.sourcePins ?? {})) assert.equal(await hashFile(path.join(root, file)), pin); },
  ]).catch(error => { report.status = "failed-not-acceptance"; report.failures.push(...error.errors.map(item => String(item).slice(0, 1024))); });
  const file = `${prefix}.json`; await writeFile(path.join(root, file), JSON.stringify(report, null, 2) + "\n", { flag: "wx" });
  console.log(JSON.stringify({ file, status: report.status, arms: report.arms.map(a => ({ mode: a.mode, status: a.status, failures: a.failures })), failures: report.failures }));
  if (report.status.startsWith("failed")) process.exitCode = 1;
}
