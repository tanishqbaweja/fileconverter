// Finite private candidate qualification in ONE real production page/worker/I/O
// lifecycle. New PCM/duplicate serialization evidence, not native conversion,
// public promotion, artwork, repeat stress, or the full original project.
import "./lib/hidden-unit-subprocesses.mjs";
import assert from "node:assert/strict";
import { execFile, spawn } from "node:child_process";
import { createHash } from "node:crypto";
import { createReadStream } from "node:fs";
import { copyFile, lstat, mkdir, open, readFile, statfs, unlink, writeFile } from "node:fs/promises";
import path from "node:path";
import { createRequire } from "node:module";
import { promisify } from "node:util";
import { gzipSync, gunzipSync } from "node:zlib";
import { chromium } from "playwright";
import { auditAudioMetadataArtifact } from "./lib/audio-metadata-artifact.mjs";
import { AUDIO_METADATA_TAGS, AUDIO_METADATA_FIDELITY_CASES, AUDIO_REPEATED_COMMENTS, audioMetadataFixtureArguments } from "./lib/audio-metadata-fidelity-fixture.mjs";
import { appendFlacFixtureComments, readAudioCommentEntries } from "./lib/audio-comment-validation.mjs";
import { appendOggFixtureComments } from "./lib/audio-repeated-comment-fixture.mjs";
import { compareNativeAudioPcm } from "./lib/streaming-audio-fidelity.mjs";
import { validateScopedAudioTags } from "./lib/scoped-audio-tag-validation.mjs";
import { createOwnedRuntimeScratch, finishOwnedCleanup } from "./lib/owned-runtime-scratch.mjs";
import { inspectStressHostMemory } from "./lib/host-memory-preflight.mjs";
import { inspectInstalledChromePin, assertInstalledChromePinsEqual } from "./lib/installed-chrome-pin.mjs";
import { queryProcessIdentity, observeOwnedProcessExit } from "./lib/owned-process-exit-observation.mjs";
import { startChromiumMemoryMonitor } from "./lib/persistent-chromium-memory.mjs";
import { stableWindow } from "./lib/chromium-private-memory.mjs";
import { createLosslessNativeMemoryJournal, compactLosslessNativeMemoryJournal } from "./lib/lossless-native-memory-journal.mjs";
import { installBoundedNetworkObserver } from "./lib/bounded-network-observer.mjs";
import { verifyOpfsDiskBacking } from "./lib/opfs-disk-backing-proof.mjs";
import { encodeBoundedValidationChunk, decodeBoundedValidationChunk } from "./lib/bounded-validation-chunk.mjs";

assert.ok(process.argv.length === 3 || (process.argv.length === 4 && ["--compare-vorbis-quality", "--remaining-repeated-audio"].includes(process.argv[3])), "Pass the audited candidate and one optional explicit qualification scope");
const qualityComparison = process.argv[3] === "--compare-vorbis-quality";
const remainingRepeated = process.argv[3] === "--remaining-repeated-audio";
const selectedCases = remainingRepeated ? AUDIO_METADATA_FIDELITY_CASES.slice(1, 6).map(c => ({ ...c, repeated: true }))
  : qualityComparison ? [...AUDIO_METADATA_FIDELITY_CASES, { source: "opus", destination: "ogg", quality: "higher" }] : AUDIO_METADATA_FIDELITY_CASES;
const root = path.resolve(import.meta.dirname, ".."), execute = promisify(execFile), pause = ms => new Promise(r => setTimeout(r, ms));
const runtime = await createOwnedRuntimeScratch("audio-metadata-production-"), env = { ...runtime.env, WRANGLER_SEND_METRICS: "false", NEXT_TELEMETRY_DISABLED: "1" };
const report = { schemaVersion: 1, startedAt: new Date().toISOString(), status: "failed-or-incomplete", scope: "seven small private production-UI audio fidelity/tag/duplicate cases in one normal page",
  publicAcceptance: false, fullMetadataAcceptance: false, artworkAcceptance: false, scalingAcceptance: false, headedCoverage: false,
  cases: [], failures: [], network: { observedRequests: 0, forbidden: [], nativeGlueRequests: 0, nativeWasmRequests: 0 }, nativeConversionUsed: false };
if (qualityComparison) report.scope += "; plus explicit same-fixture higher-quality Vorbis control (not a default change or speed proof)";
if (remainingRepeated) report.scope = "five NEW repeated-comment route cases, excluding the already-passed FLAC-to-Ogg duplicate gate; not stress or promotion";
const stamp = report.startedAt.replaceAll(":", "-"), sha = b => createHash("sha256").update(b).digest("hex");
const hashFile = async file => { const hash = createHash("sha256"); for await (const b of createReadStream(file, { highWaterMark: 1048576 })) hash.update(b); return hash.digest("hex"); };
const native = (args, executable = "ffmpeg") => execute(executable, args, { cwd: root, env, windowsHide: true, timeout: 30000, maxBuffer: 131072 });
const probeAudio = async file => JSON.parse((await native(["-v", "error", "-show_entries", "stream=index,codec_type,codec_name,sample_rate,channels:stream_tags:format=duration:format_tags", "-of", "json", file], "ffprobe")).stdout);
const sourceFiles = ["scripts/test-audio-metadata-production-runtime.mjs", "scripts/lib/audio-metadata-artifact.mjs", "scripts/lib/audio-metadata-fidelity-fixture.mjs",
  "scripts/lib/audio-comment-validation.mjs", "scripts/lib/streaming-audio-fidelity.mjs", "scripts/lib/scoped-audio-tag-validation.mjs",
  "scripts/lib/audio-repeated-comment-fixture.mjs",
  "scripts/lib/bounded-network-observer.mjs", "scripts/lib/opfs-disk-backing-proof.mjs", "scripts/lib/bounded-validation-chunk.mjs",
  "scripts/lib/lossless-native-memory-journal.mjs", "scripts/lib/native-memory-peaks.mjs", "scripts/lib/persistent-chromium-memory.mjs", "scripts/lib/chromium-private-memory.mjs",
  "workers/conversion.worker.ts", "workers/media-remux.ts", "workers/random-access-destination.ts", "lib/browser-capabilities.ts", "lib/capability-registry.ts",
  "lib/media-conversion-options.ts", "app/converter/ConverterApp.tsx", "app/globals.css"];
const pins = async () => Object.fromEntries(await Promise.all(sourceFiles.map(async file => [file, sha(await readFile(path.join(root, file)))])));
let browser, context, server, serverIdentity, monitor, journal, observer, monitorTimer, pending = Promise.resolve(), snapshotPending, monitorFailure, busy = false, serverLog = "", originalHash;
const identities = [], staged = [], tail = [], phases = [{ phase: "blank", at: Date.now() }];
const phase = name => phases.push({ phase: name, at: Date.now() });
const snapshot = async () => {
  if (snapshotPending) return snapshotPending;
  snapshotPending = (async () => { const batch = await monitor.drain();
    const samples = batch.samples.map(s => ({ ...s, phase: phases.findLast(p => p.at <= Date.parse(s.timestamp))?.phase ?? "unavailable" }));
    await journal.appendBatch({ ...batch, samples }); tail.push(...samples); if (tail.length > 128) tail.splice(0, tail.length - 128);
  })().finally(() => { snapshotPending = null; }); return snapshotPending;
};
const recordMemory = () => {
  if (!journal || !report.blankBaseline) return;
  const all = journal.peaksExcept([]), active = journal.peaksExcept(["blank"]);
  if (active.peak) report.memory = { scope: "selected-small-case lifecycle only, not stress acceptance", limitMiB: 250, intervalMs: 100,
    peak: active.peak, incrementalPrivateMiB: (active.peak.privateBytes - report.blankBaseline.privateBytes) / 1048576,
    validSamples: all.validSamples, unavailableSamples: all.unavailableSamples, fullHistoryInLosslessJournal: true };
};
try {
  report.executedHead = (await execute("git", ["rev-parse", "HEAD"], { cwd: root, env, windowsHide: true, maxBuffer: 1024 })).stdout.trim();
  report.sources = await pins(); const disk = await statfs(root); assert.ok(disk.bavail * disk.bsize >= 2 * 1024 ** 3);
  report.hostMemory = await inspectStressHostMemory(); assert.equal(report.hostMemory.safeToStart, true);
  assert.equal((await lstat(path.join(root, "test.mkv"))).size, 2958573265); originalHash = await hashFile(path.join(root, "test.mkv"));
  assert.equal(originalHash, "31f36695b5b44c62125a9e4264e84dc085accd21c02cc3487aae597f54b9db34");
  report.browser = await inspectInstalledChromePin(); report.artifact = await auditAudioMetadataArtifact(process.argv[2]);
  report.fixtures = {};
  for (const source of ["flac", "ogg", "opus"]) {
    const file = path.join(runtime.directory, "source." + source); await native(audioMetadataFixtureArguments(source, file));
    const bytes = (await lstat(file)).size; assert.ok(bytes < 1048576);
    const hash = await hashFile(file); assert.equal(hash, report.artifact.fixtures[source].sha256); assert.equal(bytes, report.artifact.fixtures[source].bytes);
    report.fixtures[source] = { bytes, sha256: hash };
  }
  report.repeatedFixtures = {};
  for (const source of remainingRepeated ? ["flac", "ogg", "opus"] : ["flac"]) {
    const original = path.join(runtime.directory, "source." + source), repeatedFile = path.join(runtime.directory, "source-repeated." + source);
    const bytes = await readFile(original), generated = source === "flac" ? appendFlacFixtureComments(bytes, AUDIO_REPEATED_COMMENTS)
      : appendOggFixtureComments(bytes, source, AUDIO_REPEATED_COMMENTS);
    await writeFile(repeatedFile, generated, { flag: "wx" });
    report.repeatedFixtures[source] = { bytes: (await lstat(repeatedFile)).size, sha256: await hashFile(repeatedFile),
      sourcePcmUnchanged: await compareNativeAudioPcm(original, repeatedFile, { cwd: root, env, lossless: true }) };
    const repeatedSource = await readAudioCommentEntries(repeatedFile, source);
    assert.deepEqual(repeatedSource.entries.filter(s => s.split("=", 1)[0].toLowerCase() === "custom_repeat"), AUDIO_REPEATED_COMMENTS);
  }
  report.repeatedFixture = report.repeatedFixtures.flac;
  await execute(process.execPath, ["node_modules/vinext/dist/cli.js", "build"], { cwd: root, env, windowsHide: true, timeout: 180000, maxBuffer: 4 * 1024 ** 2 });
  for (const file of ["within-remux.mjs", "within-remux.wasm"]) {
    const target = path.join(root, "dist/client/engines/remux", file), backup = path.join(runtime.directory, "original-" + file), original = sha(await readFile(target));
    assert.equal(original, sha(await readFile(path.join(root, "public/engines/remux", file)))); await copyFile(target, backup);
    const row = { target, backup, original, candidate: report.artifact.deliveredArtifacts[file], staged: false }; staged.push(row);
    await copyFile(path.join(report.artifact.directory, file), target); row.staged = true; row.identity = await lstat(target, { bigint: true });
    assert.equal(sha(await readFile(target)), row.candidate);
  }
  const port = 3219, base = `http://127.0.0.1:${port}`, { createServer } = await import("node:net"), portProbe = createServer();
  await new Promise((resolve, reject) => { portProbe.once("error", reject); portProbe.listen(port, "127.0.0.1", resolve); }); await new Promise(r => portProbe.close(r));
  server = spawn(process.execPath, ["node_modules/wrangler/bin/wrangler.js", "dev", "--config", "dist/server/wrangler.json", "--port", String(port), "--persist-to", path.join(runtime.directory, "wrangler")],
    { cwd: root, env, windowsHide: true, stdio: ["pipe", "pipe", "pipe"] });
  serverIdentity = await queryProcessIdentity(server.pid); assert.ok(serverIdentity); identities.push(serverIdentity);
  for (const pipe of [server.stdout, server.stderr]) pipe.on("data", b => { serverLog = (serverLog + b.toString()).slice(-16384); });
  let ready = false;
  for (let i = 0; i < 60; i++) { assert.equal(server.exitCode, null, serverLog); try { if ((await fetch(base)).ok) { ready = true; break; } } catch {} await pause(500); }
  assert.ok(ready, serverLog);
  const internal = createRequire(import.meta.url)(path.join(root, "node_modules/playwright-core/lib/coreBundle.js")); assert.equal(internal.getPlaywrightVersion(), "1.62.1");
  observer = installBoundedNetworkObserver(Object.getPrototypeOf(internal.server.createPlaywright({ sdkLanguage: "javascript", isServer: true }).chromium), "_innerLaunchWithRetries");
  report.protocolObserverBinding = { version: internal.getPlaywrightVersion(), sha256: sha(await readFile(path.join(root, "node_modules/playwright-core/lib/coreBundle.js"))) };
  const profile = path.join(runtime.directory, "chrome-profile"); await mkdir(profile);
  context = await chromium.launchPersistentContext(profile, { executablePath: report.browser.launcher.path, headless: true, env, serviceWorkers: "block" }); browser = context.browser(); assert.ok(browser);
  const identitySession = await browser.newBrowserCDPSession();
  try { const roots = (await identitySession.send("SystemInfo.getProcessInfo")).processInfo.filter(p => p.type === "browser"); assert.equal(roots.length, 1);
    const identity = await queryProcessIdentity(Number(roots[0].id)); assert.ok(identity); identities.push(identity); report.browserBirth = identity;
  } finally { await identitySession.detach(); }
  assert.ok(context.pages().length <= 1); const page = context.pages()[0] ?? await context.newPage();
  await context.addInitScript({ content: "Object.defineProperty(globalThis, '__WITHIN_AUDIO_VALIDATION_CHUNK__', { value: (" + encodeBoundedValidationChunk.toString() + ") });" });
  context.on("request", request => { report.network.observedRequests++;
    if (request.url() === base + "/engines/remux/within-remux.mjs") report.network.nativeGlueRequests++;
    if (request.url() === base + "/engines/remux/within-remux.wasm") report.network.nativeWasmRequests++;
    if (!request.url().startsWith(base + "/") || request.method() !== "GET" || request.postData() !== null) {
      assert.ok(report.network.forbidden.length < 16); report.network.forbidden.push({ method: request.method(), url: request.url().slice(0, 256) });
    }
  });
  journal = await createLosslessNativeMemoryJournal(report.browserBirth.pid, path.join(root, "output/playwright", stamp + "-audio-fidelity-memory.ndjson"));
  monitor = await startChromiumMemoryMonitor(report.browserBirth.pid, runtime.directory, 100); const monitorIdentity = await queryProcessIdentity(monitor.pid); assert.ok(monitorIdentity); identities.push(monitorIdentity);
  monitorTimer = setInterval(() => { if (busy) return; busy = true; pending = snapshot().catch(e => { monitorFailure ??= e; }).finally(() => { busy = false; }); }, 500);
  const observations = [], windows = [];
  for (let i = 0; i < 20; i++) { await pause(2100); await snapshot(); observations.push({ ...tail.at(-1), elapsedMs: Date.parse(tail.at(-1).timestamp) - Date.parse(report.browserBirth.createdAt) });
    const stable = stableWindow(observations, 8000); if (stable) windows.push(stable); if (windows.length >= 2) break; }
  assert.ok(windows.length >= 2); report.blankBaseline = windows.reduce((a, b) => a.privateBytes < b.privateBytes ? a : b);
  phase("loaded"); const response = await page.goto(base + "/?test=1"); assert.equal(response.status(), 200);
  const headers = response.headers(); assert.equal(headers["cross-origin-opener-policy"], "same-origin"); assert.equal(headers["cross-origin-embedder-policy"], "require-corp");
  await page.waitForFunction(() => window.__WITHIN_TEST__?.getState().workerStatus === "ready"); report.diskProof = await verifyOpfsDiskBacking(page, profile);
  const loaded = [];
  for (let i = 0; i < 30; i++) { await pause(2100); await snapshot(); loaded.push({ ...tail.at(-1), elapsedMs: Date.parse(tail.at(-1).timestamp) - Date.parse(report.browserBirth.createdAt) });
    const stable = stableWindow(loaded, 8000); if (stable) { report.loadedIdle = stable; break; } }
  assert.ok(report.loadedIdle);
  report.screenshots = [];
  for (const [index, conversion] of selectedCases.entries()) {
    if (monitorFailure) throw monitorFailure;
    const profileId = `${conversion.source}-to-${conversion.destination}`, input = path.join(runtime.directory, (conversion.repeated ? "source-repeated." : "source.") + conversion.source),
      output = path.join(runtime.directory, `output-${index}.${conversion.destination}`);
    const row = { name: profileId + (conversion.repeated ? "-repeated-values" : "") + (conversion.quality ? "-" + conversion.quality : ""),
      profileId, requestedQuality: conversion.quality ?? "automatic", repeated: Boolean(conversion.repeated), status: "failed", failures: [] }; report.cases.push(row);
    let outputIdentity, entryName;
    try {
      const sourceProbe = await probeAudio(input); const tags = validateScopedAudioTags(sourceProbe, AUDIO_METADATA_TAGS, { scope: conversion.source === "flac" ? "format" : "audio-stream" }); assert.equal(tags.status, "passed");
      row.source = { ...report.fixtures[conversion.source], ...(conversion.repeated ? report.repeatedFixtures[conversion.source] : {}), tags };
      phase("case-" + index); await page.locator('[data-testid="file-input"]').setInputFiles(input); await page.locator('[data-testid="format-select"]').selectOption(profileId);
      await page.waitForFunction(() => !document.querySelector('[data-testid="convert-button"]')?.disabled && window.__WITHIN_TEST__?.getState().workerStatus === "ready");
      if (conversion.quality) {
        await page.locator('[data-testid="audio-quality-select"]').selectOption(conversion.quality);
        assert.equal(await page.locator('[data-testid="audio-quality-select"]').inputValue(), conversion.quality);
      }
      const startedAt = Date.now(); await page.locator('[data-testid="convert-button"]').click();
      await page.waitForFunction(() => ["complete", "error", "cancelled"].includes(window.__WITHIN_TEST__?.getState().jobState ?? ""), null, { timeout: 60000 });
      const state = await page.evaluate(() => window.__WITHIN_TEST__.getState()); row.browserElapsedMs = Date.now() - startedAt; row.browserState = state; entryName = state.opfsName;
      assert.equal(state.audioOptions.quality, row.requestedQuality, "Actual production job must retain the requested quality selection");
      assert.equal(state.jobState, "complete", state.error ?? state.phase); assert.ok(entryName);
      for (const count of [state.metrics.maxReadChunkBytes, state.metrics.maxWriteChunkBytes, state.metrics.peakQueuedBytes]) assert.ok(count <= 262144);
      assert.ok(state.metrics.peakPendingOperations <= 1); assert.equal(state.metrics.pendingOperations, 0);
      const size = await page.evaluate(async name => (await (await (await navigator.storage.getDirectory()).getFileHandle(name)).getFile()).size, entryName); assert.ok(size > 0 && size < 1048576);
      const writer = await open(output, "wx"); outputIdentity = await writer.stat({ bigint: true });
      try { for (let offset = 0; offset < size; offset += 65536) {
        const encoded = await page.evaluate(async ({ name, offset, count }) => {
          const file = await (await (await navigator.storage.getDirectory()).getFileHandle(name)).getFile();
          return window.__WITHIN_AUDIO_VALIDATION_CHUNK__(new Uint8Array(await file.slice(offset, offset + count).arrayBuffer()));
        }, { name: entryName, offset, count: Math.min(65536, size - offset) });
        const bytes = decodeBoundedValidationChunk(encoded); assert.equal(bytes.length, Math.min(65536, size - offset)); let at = 0;
        while (at < bytes.length) { const n = (await writer.write(bytes, at, bytes.length - at, offset + at)).bytesWritten; assert.ok(n > 0); at += n; }
      } } finally { await writer.close(); }
      const outputProbe = await probeAudio(output); assert.equal(outputProbe.streams.length, 1); const audio = outputProbe.streams[0];
      assert.equal(audio.codec_name, conversion.destination === "ogg" ? "vorbis" : conversion.destination); assert.equal(Number(audio.sample_rate), 48000); assert.equal(audio.channels, 1);
      row.output = { bytes: size, sha256: await hashFile(output), probe: outputProbe };
      row.output.tags = validateScopedAudioTags(outputProbe, AUDIO_METADATA_TAGS, { scope: conversion.destination === "flac" ? "format" : "audio-stream" });
      if (row.output.tags.status !== "passed") row.failures.push("One or more25metadata fields lost or changed");
      try { row.fidelity = await compareNativeAudioPcm(input, output, { cwd: root, env, lossless: conversion.destination === "flac" }); row.fullIndependentDecode = true; }
      catch (error) { row.fidelity = error.fidelity ?? null; row.fullIndependentDecode = error.fullIndependentDecodePassed ?? false; row.failures.push(String(error)); }
      const comments = await readAudioCommentEntries(output, conversion.destination); row.binaryComments = comments;
      if (conversion.repeated) {
        row.repeatedValues = comments.entries.filter(s => s.split("=", 1)[0].toLowerCase() === "custom_repeat");
        try { assert.deepEqual(row.repeatedValues, AUDIO_REPEATED_COMMENTS); } catch { row.failures.push("Repeated comment values were folded, overwritten or reordered"); }
      }
      if (index === 0 || conversion.repeated) {
        const directory = path.join(root, "output/playwright", stamp + "-audio-fidelity"); await mkdir(directory, { recursive: true });
        await page.locator(".progress-panel").scrollIntoViewIfNeeded(); const file = path.join(directory, `case-${index}-terminal.png`);
        await page.screenshot({ path: file, fullPage: false }); const bytes = await readFile(file); assert.ok(bytes.length <= 4 * 1048576);
        report.screenshots.push({ path: path.relative(root, file).replaceAll(path.sep, "/"), bytes: bytes.length, sha256: sha(bytes), headedCoverage: false });
      }
      row.status = row.failures.length ? "failed" : "passed-small-private-fidelity-and-metadata-case";
    } catch (error) { row.failures.push(String(error.stack ?? error).slice(0, 4096)); }
    finally {
      if (entryName) await page.evaluate(async name => { await (await navigator.storage.getDirectory()).removeEntry(name); }, entryName);
      if (outputIdentity) { const current = await lstat(output, { bigint: true }); assert.equal(current.dev, outputIdentity.dev); assert.equal(current.ino, outputIdentity.ino); await unlink(output); }
      row.disposableOutputRemoved = true;
    }
    await snapshot(); recordMemory(); if (report.memory.incrementalPrivateMiB > 250) throw new Error("Whole Chromium250MiB gate failed; retain completed fidelity evidence without promotion");
  }
  phase("recovery"); await pause(2100); await snapshot(); recordMemory();
  assert.deepEqual(report.network.forbidden, []); assert.deepEqual(await pins(), report.sources); assertInstalledChromePinsEqual(report.browser, await inspectInstalledChromePin());
  assert.ok(report.network.nativeGlueRequests > 0 && report.network.nativeWasmRequests > 0, "Fresh context must request the staged audited native assets");
  assert.equal(report.cases.length, selectedCases.length); assert.ok(report.cases.every(c => c.status === "passed-small-private-fidelity-and-metadata-case"));
  assert.ok(report.memory.incrementalPrivateMiB <= 250); report.status = "passed-selected-small-private-cases-not-promotion";
} catch (error) { report.status = "failed"; report.failures.push(String(error.stack ?? error).slice(0, 8192)); }
finally {
  clearInterval(monitorTimer); await pending;
  if (monitor && journal) {
    let coverageFailure = null;
    try { await snapshot(); recordMemory(); } catch (error) { coverageFailure = String(error); }
    try { await monitor.close(); monitor = null; } catch (error) { coverageFailure ??= String(error); }
    try { const receipt = await journal.close(); report.losslessMemoryJournal = await compactLosslessNativeMemoryJournal(coverageFailure
      ? { ...receipt, complete: false, failure: coverageFailure, conversionAcceptance: false } : receipt);
      if (coverageFailure) throw new Error(coverageFailure);
    } catch (error) { report.failures.push("Memory finalization: " + String(error)); report.status = "failed"; }
  }
  if (monitorFailure) { report.failures.push(String(monitorFailure)); report.status = "failed"; }
  if (report.memory?.incrementalPrivateMiB > 250 || report.network.forbidden.length) report.status = "failed";
  await finishOwnedCleanup([
    async () => { if (monitor) await monitor.close(); }, async () => { if (context) await context.close(); else if (browser) await browser.close(); },
    async () => { if (server && server.exitCode === null) { assert.deepEqual(await queryProcessIdentity(server.pid), serverIdentity);
      await execute("taskkill.exe", ["/PID", String(server.pid), "/T", "/F"], { cwd: root, env, windowsHide: true, timeout: 15000, maxBuffer: 16384 }); } },
  ]).catch(error => { report.failures.push(String(error)); report.status = "failed"; });
  if (observer) { report.networkObserver = observer.summary(); observer.close(); }
  const cleanupIdentities = new Map(identities.map(i => [i.pid + ":" + i.createdAt, i]));
  for (const identity of report.losslessMemoryJournal?.summary?.native?.identities ?? []) cleanupIdentities.set(identity.pid + ":" + identity.createdAt, identity);
  report.processCleanup = [];
  for (const identity of cleanupIdentities.values()) report.processCleanup.push(await observeOwnedProcessExit(identity));
  let restored = true;
  await finishOwnedCleanup(staged.filter(r => r.staged).map(r => async () => {
    const current = await lstat(r.target, { bigint: true }); assert.equal(current.dev, r.identity.dev); assert.equal(current.ino, r.identity.ino); assert.equal(sha(await readFile(r.target)), r.candidate);
    await copyFile(r.backup, r.target); assert.equal(sha(await readFile(r.target)), r.original);
  })).catch(error => { restored = false; report.failures.push(String(error)); report.status = "failed"; });
  try {
    if (originalHash) { assert.equal(await hashFile(path.join(root, "test.mkv")), originalHash); report.protectedOriginalUnchanged = true; }
    assert.ok(report.processCleanup.every(c => c.status === "owned-identity-absent")); assert.ok(restored);
    await runtime.close(); report.cleanup = { allRecordedBirthsAbsent: true, publishedAssetsNeverChanged: true, stagedPrivateAssetsRestored: true, ownedProfileFixturesOutputsRemoved: true };
  } catch (error) { report.failures.push(String(error)); report.status = "failed"; }
  report.serverLog = serverLog; report.phaseChanges = phases; report.finishedAt = new Date().toISOString();
  const raw = Buffer.from(JSON.stringify(report)); assert.ok(raw.length <= 8 * 1048576); const packed = gzipSync(raw, { level: 9 }); assert.deepEqual(gunzipSync(packed), raw);
  const archive = path.join(root, "outputs/reports", stamp + "-audio-metadata-production-runtime.json.gz"); await mkdir(path.dirname(archive), { recursive: true }); await writeFile(archive, packed, { flag: "wx" });
  assert.equal(sha(await readFile(archive)), sha(packed));
  const receipt = { schemaVersion: 1, executedHead: report.executedHead, status: report.status, scope: report.scope, publicAcceptance: false, fullMetadataAcceptance: false,
    archive: { path: path.relative(root, archive).replaceAll(path.sep, "/"), bytes: packed.length, sha256: sha(packed), restoredBytes: raw.length, restoredSha256: sha(raw) },
    sourcePins: Object.keys(report.sources ?? {}).length, artifactManifestSha256: report.artifact?.manifestSha256, diskProof: report.diskProof,
    memory: report.memory, cases: report.cases.map(c => ({ name: c.name, status: c.status, requestedQuality: c.requestedQuality, browserElapsedMs: c.browserElapsedMs,
      failures: c.failures, fidelity: c.fidelity, outputBytes: c.output?.bytes, outputSha256: c.output?.sha256,
      tagsPreserved: c.output?.tags.fields.filter(f => f.status === "preserved").length, repeatedValues: c.repeatedValues, disposableOutputRemoved: c.disposableOutputRemoved })),
    losslessJournal: report.losslessMemoryJournal ? { file: path.relative(root, report.losslessMemoryJournal.file).replaceAll(path.sep, "/"), records: report.losslessMemoryJournal.records,
      sha256: report.losslessMemoryJournal.sha256, archiveSha256: report.losslessMemoryJournal.archiveSha256, complete: report.losslessMemoryJournal.complete } : null,
    failures: report.failures, network: report.network, cleanup: report.cleanup, protectedOriginalUnchanged: report.protectedOriginalUnchanged };
  const destination = path.join(root, "evidence", stamp + "-audio-metadata-fidelity-result.json"); await writeFile(destination, JSON.stringify(receipt, null, 2) + "\n", { flag: "wx" });
  console.log(JSON.stringify({ receipt: destination, status: report.status, cases: receipt.cases.map(c => ({ name: c.name, status: c.status, failures: c.failures })), memory: report.memory?.incrementalPrivateMiB, cleanup: report.cleanup }));
  if (report.status === "failed") process.exitCode = 1;
}
