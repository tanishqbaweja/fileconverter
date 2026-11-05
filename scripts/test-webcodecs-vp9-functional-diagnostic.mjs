// Exact reversible diagnostic: collect previously unreached real conversion
// facts before applying the SAME baseline/memory verdict. No acceptance bypass.
import assert from "node:assert/strict";
import { spawn } from "node:child_process";
import { readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import { pathToFileURL } from "node:url";
import { createHash } from "node:crypto";
import { gzipSync } from "node:zlib";
import { createOwnedRuntimeScratch } from "./lib/owned-runtime-scratch.mjs";
const nativeAllocation = process.argv[2] === "--fallback-native-allocation";
const recoveryQualification = process.argv[2] === "--recovery-qualification";
const streamDurationFidelity = process.argv[2] === "--stream-duration-fidelity" || recoveryQualification;
const storedTimingDiagnostic = process.argv[2] === "--duration-stored-timing" || streamDurationFidelity;
const durationFixedFidelity = process.argv[2] === "--duration-fixed-fidelity" || storedTimingDiagnostic;
const isolatedFidelity = process.argv[2] === "--isolated-fidelity" || durationFixedFidelity;
const isolatedFallback = process.argv[2] === "--isolated-fallback" || isolatedFidelity;
const realmDiagnostic = process.argv[2] === "--fallback-realms" || nativeAllocation;
const checkOnly = process.argv[3] === "--check-only";
const durationRunId = process.env.WITHIN_VP9_DURATION_NATIVE_RUN_ID ?? (checkOnly ? "12345678" : "");
if (durationFixedFidelity) assert.match(durationRunId, /^\d{8,14}$/, "Select an authenticated source-built private CPU receipt explicitly");
const preflightRecovery = process.argv[2] === "--compare-single-core-preflight-recovery";
const compareDefault = process.argv[2] === "--compare-default-core", compareSingle = process.argv[2] === "--compare-single-core" || preflightRecovery || nativeAllocation || isolatedFallback;
const compareCore = compareDefault || compareSingle;
const rebuiltCpuFallback = process.argv[2] === "--rebuilt-cpu-fallback" || realmDiagnostic || compareCore;
const rebuiltNative = process.argv[2] === "--rebuilt-native" || rebuiltCpuFallback;
const preferenceFallbackFixture = process.argv[2] === "--encoder-preference-fallback" || rebuiltNative;
const frameColorFixture = process.argv[2] === "--frame-color-fixture" || (preferenceFallbackFixture && !rebuiltCpuFallback);
const explicitColorFixture = process.argv[2] === "--explicit-color-fixture" || frameColorFixture;
const nativeColorDiagnostic = process.argv[2] === "--native-color-diagnostic" || explicitColorFixture || rebuiltCpuFallback;
assert.ok(process.argv.length === 2 || (process.argv.length === (checkOnly ? 4 : 3) && nativeColorDiagnostic));
const root = path.resolve(import.meta.dirname, ".."), sha = x => createHash("sha256").update(x).digest("hex");
const outputLabel = recoveryQualification ? "recovery-qualification-" + durationRunId : streamDurationFidelity ? "stream-duration-fidelity-" + durationRunId : storedTimingDiagnostic ? "duration-stored-timing-" + durationRunId : durationFixedFidelity ? "duration-fixed-" + durationRunId : isolatedFidelity ? "isolated-fidelity" : isolatedFallback ? "isolated-fallback" : nativeAllocation ? "fallback-native-allocation" : preflightRecovery ? "comparison-single-core-preflight-recovery" : compareDefault ? "comparison-default-core" : compareSingle ? "comparison-single-core" :
  realmDiagnostic ? "fallback-realms" : rebuiltCpuFallback ? "rebuilt-cpu-fallback" : rebuiltNative ? "rebuilt-native" :
  preferenceFallbackFixture ? "encoder-preference-fallback" : frameColorFixture ? "frame-color-fixture" :
  explicitColorFixture ? "explicit-color-fixture" : "native-color-diagnostic";
const source = await readFile(path.join(root, "scripts/test-webcodecs-vp9-smoke.mjs"), "utf8");
const prior = JSON.parse(await readFile(path.join(root, "evidence/2026-11-01-webcodecs-vp9-first-smoke.json")));
assert.equal(sha(source), prior.sourcePins["scripts/test-webcodecs-vp9-smoke.mjs"]);
assert.equal(prior.status, "failed-private-vp9-browser-smoke"); assert.equal(prior.browserResult, undefined);
assert.equal(prior.blankBaseline, null); assert.equal(prior.ownedRuntimeRemoved, true);
const edits = [[ 'import "./lib/hidden-unit-subprocesses.mjs";',
  'import ' + JSON.stringify(pathToFileURL(path.join(root, "scripts/lib/hidden-unit-subprocesses.mjs")).href) + ';' ],
  ...[...source.matchAll(/from "(\.\/lib\/[a-z0-9-]+\.mjs)"/g)].map(match =>
  [match[0], "from " + JSON.stringify(pathToFileURL(path.resolve(root, "scripts", match[1])).href)])];
if (preflightRecovery) {
  const stopped = JSON.parse(await readFile(path.join(root, "evidence/2026-11-01-webcodecs-vp9-comparison-single-core.json")));
  assert.equal(stopped.status, "failed-private-vp9-browser-smoke"); assert.equal(stopped.hostMemory.safeToStart, false);
  assert.equal(stopped.browserResult, undefined); assert.equal(stopped.browserPin, undefined);
  assert.equal(stopped.nativeMemory, null); assert.deepEqual(stopped.processCleanup, []);
  assert.ok(stopped.finishedAt);
  edits.push(['  report.hostMemory = await inspectStressHostMemory(); assert.equal(report.hostMemory.safeToStart, true);',
    '  report.preflightRecoveryOf = "evidence/2026-11-01-webcodecs-vp9-comparison-single-core.json";\n' +
    '  report.previousAttemptReachedBrowser = false;\n' +
    '  report.hostMemory = await inspectStressHostMemory(); assert.equal(report.hostMemory.safeToStart, true);']);
}
edits.push(
  ['path.resolve(import.meta.dirname, "..")', JSON.stringify(root)],
  ['evidence/2026-11-01-webcodecs-vp9-first-smoke.json', 'evidence/2026-11-01-webcodecs-vp9-functional-diagnostic.json'],
  ['2026-11-01-webcodecs-vp9-first-smoke-failure.zip', '2026-11-01-webcodecs-vp9-functional-diagnostic-failure.zip'],
  ['  assert.equal(report.blankBaseline?.stable, true); report.baselineAdjusted = false;',
    '  report.baselineAdjusted = false; report.baselineAvailable = report.blankBaseline?.stable === true;\n' +
    '  if (!report.baselineAvailable) report.failures.push("Earliest stable blank baseline unavailable; collect functional facts, retain overall failure and null incremental memory");'],
  ['incrementalPrivateMiB: peaks.peak ? (peaks.peak.privateBytes - report.blankBaseline.privateBytes) / 1048576 : null',
    'incrementalPrivateMiB: peaks.peak && report.blankBaseline ? (peaks.peak.privateBytes - report.blankBaseline.privateBytes) / 1048576 : null'],
  ['  assert.ok(peaks.validSamples > 0 && peaks.unavailableSamples === 0 && report.memory.incrementalPrivateMiB <= 250);',
    '  assert.equal(report.blankBaseline?.stable, true, "Stable blank baseline remains required; no smaller metric substitutes");\n' +
    '  assert.ok(peaks.validSamples > 0 && peaks.unavailableSamples === 0 && report.memory.incrementalPrivateMiB <= 250);'],
  ['import { chromium } from "playwright";', 'import { chromium } from "playwright";\nimport { finishPrivateVp9Integrity } from ' +
    JSON.stringify(pathToFileURL(path.join(root, "scripts/lib/private-vp9-finalization.mjs")).href) + ';'],
  ['"workers/media-remux.ts",', '"workers/media-remux.ts", "scripts/lib/private-vp9-finalization.mjs",'],
  ['    await runtime?.close(); report.ownedRuntimeRemoved = Boolean(runtime);\n' +
    '    report.originalAfter = await original(); assert.deepEqual(report.originalAfter, expectedOriginal);\n' +
    '    assertInstalledChromePinsEqual(report.browserPin, await inspectInstalledChromePin());\n' +
    '    for (const [file, digest] of Object.entries(report.sourcePins)) assert.equal(sha(await readFile(path.join(root, file))), digest);\n' +
    '  } catch (error) { report.failures.push("Final cleanup/integrity: " + error); }',
    '  } catch (error) { report.failures.push("Owned stage cleanup: " + error); }\n' +
    '  await finishPrivateVp9Integrity({ report, runtime,\n' +
    '    runtimeRemovalAllowed: report.processCleanup.every(x => x.status === "owned-identity-absent"),\n' +
    '    original, expectedOriginal, assertEqual: assert.deepEqual,\n' +
    '    inspectBrowserPin: inspectInstalledChromePin, assertBrowserPinsEqual: assertInstalledChromePinsEqual,\n' +
    '    verifySources: async () => { for (const [file, digest] of Object.entries(report.sourcePins)) assert.equal(sha(await readFile(path.join(root, file))), digest); } });'],
);
if (nativeColorDiagnostic) {
  edits[edits.findIndex(([before]) => before === 'evidence/2026-11-01-webcodecs-vp9-first-smoke.json')][1] =
    'evidence/2026-11-01-webcodecs-vp9-' + outputLabel + '.json';
  edits[edits.findIndex(([before]) => before === '2026-11-01-webcodecs-vp9-first-smoke-failure.zip')][1] =
    '2026-11-01-webcodecs-vp9-' + outputLabel + '-failure.zip';
  edits.push(['  report.fixture = { generatedBeforeBrowser: true,',
    '  report.sourceProbe = JSON.parse((await execute(ffprobe, ["-v", "error", "-show_streams", "-show_format", "-of", "json", fixture],\n' +
    '    { cwd: root, env: runtime.env, windowsHide: true, timeout: 30000, maxBuffer: 1048576 })).stdout);\n' +
    '  report.fixture = { generatedBeforeBrowser: true,']);
}
if (explicitColorFixture) {
  edits.push(['"-color_range", "tv", fixture];',
    frameColorFixture ? '"-color_range", "tv", "-vf", "setparams=color_primaries=bt709:color_trc=bt709:colorspace=bt709:range=tv", fixture];' :
      '"-color_range", "tv", "-bsf:v", "h264_metadata=video_full_range_flag=0:colour_primaries=1:transfer_characteristics=1:matrix_coefficients=1", fixture];']);
  const probeEnd = '    { cwd: root, env: runtime.env, windowsHide: true, timeout: 30000, maxBuffer: 1048576 })).stdout);\n';
  edits.push([probeEnd, probeEnd +
    '  assert.equal(report.sourceProbe.streams.length, 1);\n' +
    '  const sourceColor = report.sourceProbe.streams[0];\n' +
    '  assert.deepEqual([sourceColor.color_primaries, sourceColor.color_transfer, sourceColor.color_space, sourceColor.color_range], ["bt709", "bt709", "bt709", "tv"], "Verify actual source metadata before launching Chromium");\n']);
}
if (rebuiltNative) {
  edits.push(
    ['evidence/2026-11-01-webcodecs-vp9-native-41305653513.json', 'evidence/2026-11-01-webcodecs-vp9-native-41309113218.json'],
    ['work/webcodecs-vp9-input-41305653513', 'work/webcodecs-vp9-input-41309113218'],
    ['  assert.equal(native.publicAcceptance, false); const input = path.resolve(root, native.retainedDirectory);',
      '  report.nativeTool = { runId: native.runId, head: native.head, wasm: native.nativeContract.artifacts["within-webcodecs-vp9.wasm"] };\n' +
      '  assert.equal(native.publicAcceptance, false); const input = path.resolve(root, native.retainedDirectory);'],
  );
}
if (rebuiltCpuFallback) {
  edits.push(
    ['implementation: "candidate",', 'implementation: "automatic",'],
    ['  assert.equal(report.browserResult.encoder.frames, 48); assert.equal(report.browserResult.encoder.packets, 48);',
      '  assert.equal(report.browserResult.selection.backend, "wasm");\n' +
      '  assert.match(report.browserResult.selection.fallbackReason, /native CICP primaries\\/transfer\\/matrix\\/range=2\\/2\\/1\\/1/);\n' +
      '  assert.equal(report.browserResult.encoder.frames, 0); assert.equal(report.browserResult.encoder.packets, 0);'],
  );
}
if (realmDiagnostic) {
  const sampler = pathToFileURL(path.join(root, "scripts/lib/chromium-attribution.mjs")).href;
  edits.push(
    ['import { chromium } from "playwright";', 'import { chromium } from "playwright";\nimport { connectPlaywrightRealmSampler } from ' + JSON.stringify(sampler) + ';'],
    ['let runtime, server, chrome, browser, observer, nativeMonitor,', 'let runtime, server, chrome, browser, observer, nativeMonitor, realmSampler,'],
    ['"workers/webcodecs-vp9-core.ts",', '"workers/webcodecs-vp9-core.ts", "workers/webcodecs-vp9-optional.ts", "scripts/lib/cdp-realm-memory.mjs", "scripts/lib/chromium-attribution.mjs",'],
    ['  report.loadedIdle = await sampleChromiumTree(chrome.pid);',
      '  report.loadedIdle = await sampleChromiumTree(chrome.pid);\n' +
      '  report.diagnosticPerturbsMemoryAndTiming = true; report.realmSamples = [];\n' +
      '  realmSampler = await connectPlaywrightRealmSampler(browser, origin);\n' +
      '  const captureRealm = async (label, metrics = null) => {\n' +
      '    assert.ok(report.realmSamples.length < 8);\n' +
      '    const sample = await realmSampler.sample();\n' +
      '    report.realmSamples.push({ label, acquiredAt: new Date().toISOString(), workerMetrics: metrics, sample });\n' +
      '    return true;\n' +
      '  };\n' +
      '  await captureRealm("loaded-idle");\n' +
      '  await page.exposeBinding("__profileVp9Realm", async ({ frame }, payload) => {\n' +
      '    assert.equal(frame, page.mainFrame());\n' +
      '    assert.match(payload.label, /^(webcodecs-vp9-ready|candidate-disposed|wasm-ready|output-closed)$/);\n' +
      '    const metrics = { activeWorkerCount: payload.metrics.activeWorkerCount, wasmMemoryBytes: payload.metrics.wasmMemoryBytes, sharedArrayBufferBytes: payload.metrics.sharedArrayBufferBytes };\n' +
      '    return captureRealm(payload.label, metrics);\n' +
      '  });'],
    ['        worker.onmessage = ({ data }) => {',
      '        worker.onmessage = async ({ data }) => {\n' +
      '          if (data.type === "diagnostic-checkpoint") {\n' +
      '            try { await window.__profileVp9Realm(data); }\n' +
      '            catch (error) { clearTimeout(timer); reject(error); }\n' +
      '            finally { worker.postMessage({ diagnosticRelease: data.id }); }\n' +
      '            return;\n' +
      '          }'],
    ['implementation: "automatic",', 'implementation: "automatic", diagnosticCheckpoints: true,'],
    ['  report.conversionEndedAt = new Date().toISOString();', '  await captureRealm("workers-terminated");\n  report.conversionEndedAt = new Date().toISOString();'],
    ['  await outputFile?.close(); await browser?.close().catch(() => {});', '  realmSampler?.close();\n  await outputFile?.close(); await browser?.close().catch(() => {});'],
    ['  report.status = "passed-one-small-private-browser-conversion-not-public-or-stress-acceptance";',
      '  report.status = "completed-perturbed-vp9-fallback-realm-diagnostic-not-acceptance";'],
  );
}
if (compareCore) {
  edits.push(
    ['"-color_range", "tv", fixture];', '"-color_range", "tv", "-bitexact", fixture];'],
    ['  await execute(ffmpeg, fixtureArgs, { cwd: root, env: runtime.env, windowsHide: true, timeout: 30000, maxBuffer: 65536 });',
      '  const comparisonManifest = JSON.parse(await readFile(path.join(root, "fixtures/media/vp9-fallback-comparison.mkv.json")));\n' +
      '  assert.equal(comparisonManifest.sha256, "4fad7ea6c1dd0d374b1b69201b6af4b68e8518bf2672884d23b1f136f5f2cc46");\n' +
      '  await copyFile(path.join(root, "fixtures/media/vp9-fallback-comparison.mkv"), fixture);\n' +
      '  assert.equal(await hashFile(fixture), comparisonManifest.sha256);\n' +
      '  report.coreComparison = { sourceSha256: comparisonManifest.sha256, sourceBytes: comparisonManifest.bytes, policy: ' + JSON.stringify(compareSingle ? "single-thread" : "default") + ', singleColdRunOnly: true, acceptedOptimization: false };'],
    ['implementation: "automatic",', 'implementation: "automatic", fallbackCore: ' + JSON.stringify(compareSingle ? "single-thread" : "default") + ','],
    ['  assert.equal(report.browserResult.selection.backend, "wasm");',
      '  assert.equal(report.browserResult.selection.backend, "wasm");\n' +
      '  assert.equal(report.browserResult.selection.wasmFallbackCore, ' + JSON.stringify(compareSingle ? "single-thread" : "default") + ');\n' +
      '  assert.equal(report.browserResult.metrics.activeWorkerCount, ' + (isolatedFallback ? '2' : compareSingle ? '1' : '9') + ');'],
  );
}
if (nativeAllocation) {
  const helper = pathToFileURL(path.join(root, "scripts/lib/vp9-native-allocation-diagnostic.mjs")).href;
  edits[edits.findIndex(([before]) => before === 'evidence/2026-11-01-webcodecs-vp9-first-smoke.json')][1] =
    'evidence/2026-11-05-webcodecs-vp9-fallback-native-allocation.json';
  edits[edits.findIndex(([before]) => before === '2026-11-01-webcodecs-vp9-first-smoke-failure.zip')][1] =
    '2026-11-05-webcodecs-vp9-fallback-native-allocation-failure.zip';
  edits.push(
    ['import { connectPlaywrightRealmSampler } from ', 'import { createVp9NativeAllocationDiagnostic } from ' + JSON.stringify(helper) + ';\nimport { connectPlaywrightRealmSampler } from '],
    ['"scripts/lib/private-vp9-finalization.mjs",', '"scripts/lib/private-vp9-finalization.mjs", "scripts/lib/vp9-native-allocation-diagnostic.mjs", "scripts/lib/live-memory-infra.mjs", "scripts/lib/memory-infra-attribution.mjs",'],
    ['  const captureRealm = async (label, metrics = null) => {',
      '  const nativeCapture = createVp9NativeAllocationDiagnostic({ root, createSession: () => browser.newBrowserCDPSession(), sampleProcesses: () => sampleChromiumTree(chrome.pid) });\n' +
      '  report.nativeAllocation = nativeCapture.report();\n' +
      '  const captureRealm = async (label, metrics = null) => {'],
    ['    report.realmSamples.push({ label, acquiredAt: new Date().toISOString(), workerMetrics: metrics, sample });',
      '    report.realmSamples.push({ label, acquiredAt: new Date().toISOString(), workerMetrics: metrics, sample });\n' +
      '    await nativeCapture.capture(label);'],
  );
}
if (isolatedFallback) {
  edits[edits.findIndex(([before]) => before === 'evidence/2026-11-01-webcodecs-vp9-first-smoke.json')][1] =
    'evidence/2026-11-05-webcodecs-vp9-' + outputLabel + '.json';
  edits[edits.findIndex(([before]) => before === '2026-11-01-webcodecs-vp9-first-smoke-failure.zip')][1] =
    '2026-11-05-webcodecs-vp9-' + outputLabel + '-failure.zip';
  edits.push(
    ['"workers/webcodecs-vp9-core.ts",', '"workers/webcodecs-vp9-core.ts", "workers/webcodecs-vp9-isolated.ts", "workers/webcodecs-vp9-isolated.worker.ts", "workers/webcodecs-vp9-worker-protocol.ts",'],
    ['  await writeFile(path.join(stage, "qualification.mjs"), compiled.outputFiles[0].contents, { flag: "wx" });',
      '  await writeFile(path.join(stage, "qualification.mjs"), compiled.outputFiles[0].contents, { flag: "wx" });\n' +
      '  const isolated = await build({ entryPoints: ["workers/webcodecs-vp9-isolated.worker.ts"], bundle: true, format: "esm", platform: "browser", write: false });\n' +
      '  assert.equal(isolated.outputFiles.length, 1); report.isolatedWorkerSha256 = sha(isolated.outputFiles[0].contents); report.workerIsolation = true;\n' +
      '  await writeFile(path.join(stage, "isolated.mjs"), isolated.outputFiles[0].contents, { flag: "wx" });'],
    ['new Worker("/engines/webcodecs-vp9/qualification.mjs",', 'new Worker("/engines/webcodecs-vp9/isolated.mjs",'],
    ['  assert.equal(report.browserResult.selection.wasmFallbackCore, "single-thread");',
      '  assert.equal(report.browserResult.selection.wasmFallbackCore, "single-thread");\n' +
      '  assert.equal(report.browserResult.isolation.childrenStarted, 2); assert.equal(report.browserResult.isolation.terminationRequests, 2);\n' +
      '  assert.equal(report.browserResult.isolation.candidateTerminationRequestedBeforeFallback, true);\n' +
      '  assert.equal(report.browserResult.cleanupComplete, true); assert.ok(report.browserResult.writeAttempts > 0);'],
  );
}
if (isolatedFidelity) {
  const helper = pathToFileURL(path.join(root, "scripts/lib/small-vp9-fidelity.mjs")).href;
  edits.push(
    ['import { chromium } from "playwright";', 'import { chromium } from "playwright";\nimport { validateSmallVp9Fidelity } from ' + JSON.stringify(helper) + ';'],
    ['"scripts/lib/private-vp9-finalization.mjs",', '"scripts/lib/private-vp9-finalization.mjs", "scripts/lib/small-vp9-fidelity.mjs", "scripts/lib/bounded-native-lines.mjs", "scripts/lib/streaming-video-clock-fidelity.mjs", "scripts/lib/cr-aware-ssim-summary.mjs", "scripts/lib/bounded-ssim-summary.mjs", "scripts/lib/ebml-reuse-browser-components.mjs",'],
    ['report.independentFullDecodePassed = true;',
      'report.independentFullDecodePassed = true;\n' +
      '  report.outputSha256 = await hashFile(converted);\n' +
      '  report.independentFidelity = await validateSmallVp9Fidelity({ root, source: fixture, output: converted, sourceProbe: report.sourceProbe, outputProbe: report.outputProbe, ffmpeg, ffprobe, env: runtime.env });'],
    ['  assert.ok(peaks.validSamples > 0 && peaks.unavailableSamples === 0 && report.memory.incrementalPrivateMiB <= 250);',
      '  assert.ok(peaks.validSamples > 0 && peaks.unavailableSamples === 0 && report.memory.incrementalPrivateMiB <= 250);\n' +
      '  assert.equal(report.independentFidelity.passed, true, JSON.stringify(report.independentFidelity.failures));'],
  );
}
if (durationFixedFidelity) {
  const helper = pathToFileURL(path.join(root, "scripts/lib/vp9-duration-browser-assets.mjs")).href;
  edits.push(
    ['import { chromium } from "playwright";', 'import { chromium } from "playwright";\nimport { loadVp9DurationCpuAssets, createVp9DurationAssetResponder } from ' + JSON.stringify(helper) + ';'],
    ['"scripts/lib/private-vp9-finalization.mjs",', '"scripts/lib/private-vp9-finalization.mjs", "scripts/lib/vp9-duration-browser-assets.mjs", ' +
      JSON.stringify("evidence/2026-11-05-vp9-duration-native-" + durationRunId + ".json") + ', "public/engines/remux/within-remux.mjs", "public/engines/remux/within-remux.wasm", ' +
      JSON.stringify("work/vp9-duration-input-" + durationRunId + "/within-remux.mjs") + ', ' +
      JSON.stringify("work/vp9-duration-input-" + durationRunId + "/within-remux.wasm") + ','],
    ['  report.forbiddenRequests = [];',
      '  report.forbiddenRequests = [];\n' +
      '  const privateCpuAssets = await loadVp9DurationCpuAssets(root, ' + JSON.stringify(durationRunId) + ');\n' +
      '  const privateCpuResponder = createVp9DurationAssetResponder(origin, privateCpuAssets);\n' +
      '  report.privateCpuOverride = privateCpuResponder.report(); report.privateAssetErrorCount = 0;'],
    ['    } else await route.continue();',
      '    } else {\n' +
      '      try { if (!await privateCpuResponder.respond(route)) await route.continue(); }\n' +
      '      catch (error) { report.privateAssetErrorCount++; if (report.failures.length < 32) report.failures.push("Private asset route: " + String(error).slice(0, 512)); await route.abort().catch(() => {}); }\n' +
      '    }'],
    ['  assert.equal(report.independentFidelity.passed, true, JSON.stringify(report.independentFidelity.failures));',
      '  assert.equal(report.independentFidelity.passed, true, JSON.stringify(report.independentFidelity.failures));\n' +
      '  assert.deepEqual(report.privateCpuOverride.served, { javascript: 1, wasm: 1 }); assert.equal(report.privateAssetErrorCount, 0);'],
  );
}
if (storedTimingDiagnostic) {
  const helper = pathToFileURL(path.join(root, "scripts/lib/small-matroska-stored-timing.mjs")).href;
  edits.push(
    ['import { chromium } from "playwright";', 'import { chromium } from "playwright";\nimport { inspectSmallMatroskaTimingFile } from ' + JSON.stringify(helper) + ';'],
    ['"scripts/lib/private-vp9-finalization.mjs",', '"scripts/lib/private-vp9-finalization.mjs", "scripts/lib/small-matroska-stored-timing.mjs",'],
    ['  report.outputSha256 = await hashFile(converted);',
      '  report.outputSha256 = await hashFile(converted);\n' +
      '  report.storedTiming = { source: await inspectSmallMatroskaTimingFile(fixture), output: await inspectSmallMatroskaTimingFile(converted), strictVerdictChanged: false };'],
  );
}
if (streamDurationFidelity) {
  edits.push(['  assert.equal(report.independentFidelity.passed, true, JSON.stringify(report.independentFidelity.failures));',
    '  assert.equal(report.independentFidelity.passed, true, JSON.stringify(report.independentFidelity.failures));\n' +
    '  assert.equal(report.storedTiming.source.tracks[0].defaultDurationNs, 41666666);\n' +
    '  assert.equal(report.storedTiming.output.tracks[0].defaultDurationNs, report.storedTiming.source.tracks[0].defaultDurationNs);\n' +
    '  assert.equal(report.storedTiming.output.blocks.length, 48);\n' +
    '  assert.ok(report.storedTiming.output.blocks.every(row => row.kind === "SimpleBlock" && !row.invisible));\n' +
    '  report.storedTiming.explicitDefaultDurationGatePassed = true;']);
}
if (recoveryQualification) {
  const helper = pathToFileURL(path.join(root, "scripts/lib/vp9-recovery-qualification.mjs")).href;
  edits.push(
    ['import { chromium } from "playwright";', 'import { chromium } from "playwright";\nimport { qualifyVp9Recovery } from ' + JSON.stringify(helper) + ';'],
    ['"scripts/lib/private-vp9-finalization.mjs",', '"scripts/lib/private-vp9-finalization.mjs", "scripts/lib/vp9-recovery-qualification.mjs",'],
    ['  assert.deepEqual(report.privateCpuOverride.served, { javascript: 1, wasm: 1 }); assert.equal(report.privateAssetErrorCount, 0);',
      '  assert.deepEqual(report.privateCpuOverride.served, { javascript: 1, wasm: 1 }); assert.equal(report.privateAssetErrorCount, 0);\n' +
      '  report.recovery = {}; report.initialMemory = report.memory;\n' +
      '  try { await qualifyVp9Recovery({ page, observer, evidence: report.recovery, root, directory: runtime.directory, source: fixture,\n' +
      '    sourceProbe: report.sourceProbe, ffmpeg, ffprobe, env: runtime.env, blankBaseline: report.blankBaseline, loadedIdle: report.loadedIdle,\n' +
      '    sampleChromiumTree, chromePid: chrome.pid, initialOutputSha256: report.outputSha256 }); }\n' +
      '  finally { if (report.recovery.memory) report.memory = report.recovery.memory; }\n' +
      '  assert.deepEqual(report.privateCpuOverride.served, { javascript: 6, wasm: 6 }); assert.equal(report.privateAssetErrorCount, 0);'],
    ['report.status = "passed-one-small-private-browser-conversion-not-public-or-stress-acceptance";',
      'report.status = "passed-private-vp9-recovery-sequence-not-large-or-public-acceptance";'],
  );
}
let generated = source;
for (const [before, after] of edits) { assert.equal(generated.split(before).length, 2, before); generated = generated.replace(before, after); }
let reversed = generated;
for (const [before, after] of edits.toReversed()) { assert.equal(reversed.split(after).length, 2); reversed = reversed.replace(after, before); }
assert.equal(reversed, source);
assert.doesNotMatch(generated, /(?:from\s+|import\s+)["']\.\//, "No unresolved relative import may remain in the owned generated location");
const recipe = { scope: "Collect previously unreached real conversion facts; all original verdicts retained, not acceptance relaxation",
  parentSha256: sha(source), generatedSha256: sha(generated), edits, reversible: true, publicAcceptance: false,
  baselineFormulaChanged: false, baselineWindowOrThresholdChanged: false, nativeOrCodecSettingsChanged: preferenceFallbackFixture,
  changedEncoderSetting: rebuiltNative ? "Rebuilt native error mapping; same video controls and checked platform preference fallback" :
    preferenceFallbackFixture ? "hardwareAcceleration preference only; no video dimensions/bitrate/timing/quality change" : null,
  nativeErrorMappingRebuilt: rebuiltNative, controlledCpuFallbackExercised: rebuiltCpuFallback,
  realmDiagnostic, observationPerturbsTimingAndMemory: realmDiagnostic, noForcedGarbageCollection: true,
  nativeAllocationDiagnostic: nativeAllocation,
  isolatedFallback,
  isolatedFidelity, fidelityThresholdsRelaxed: false,
  durationFixedFidelity, privateDurationNativeRunId: durationFixedFidelity ? durationRunId : null,
  storedTimingDiagnostic, storedTimingChangesStrictVerdict: false,
  streamDurationFidelity, additionalStoredDefaultDurationGateRequired: streamDurationFidelity,
  recoveryQualification, realAdverseWritesAndThreeSameSessionRecoveriesRequired: recoveryQualification,
  samePinnedComparisonInput: compareCore, alternateSingleThreadCoreSelected: compareSingle,
  preflightRecovery, previousAttemptReachedBrowser: preflightRecovery ? false : null,
  usesConfigurationCheckedPlatformPreferenceFallback: preferenceFallbackFixture,
  fixtureBitstreamColorMetadataCorrected: explicitColorFixture,
  fixtureFrameColorMetadataAssigned: frameColorFixture,
  generatedSourceGzipBase64: gzipSync(generated, { level: 9 }).toString("base64") };
const recipeName = isolatedFallback ? "2026-11-05-webcodecs-vp9-" + outputLabel + "-recipe.json" :
  nativeAllocation ? "2026-11-05-webcodecs-vp9-fallback-native-allocation-recipe.json" :
  rebuiltNative ? "2026-11-01-webcodecs-vp9-" + outputLabel + "-recipe.json" :
  preferenceFallbackFixture ? "2026-11-01-webcodecs-vp9-encoder-preference-fallback-recipe.json" :
  frameColorFixture ? "2026-11-01-webcodecs-vp9-frame-color-fixture-recipe.json" :
  explicitColorFixture ? "2026-11-01-webcodecs-vp9-explicit-color-fixture-recipe.json" :
  nativeColorDiagnostic ? "2026-11-01-webcodecs-vp9-native-color-diagnostic-recipe.json" :
  "2026-11-01-webcodecs-vp9-functional-diagnostic-recipe-repaired.json";
if (checkOnly) {
  // Parse all reversible edits without writing a recipe, launching Chrome, or
  // bypassing the exclusive guards on actual conversion runs.
  await (await import("esbuild")).transform(generated, { loader: "js", format: "esm" });
  console.log(JSON.stringify({ checkOnly: true, generatedSha256: sha(generated), outputLabel,
    reversible: true, browserLaunched: false, recipeWritten: false }));
} else {
  await writeFile(path.join(root, "evidence", recipeName), JSON.stringify(recipe, null, 2) + "\n", { flag: "wx" });
  const runtime = await createOwnedRuntimeScratch("webcodecs-vp9-diagnostic-");
  try {
    const file = path.join(runtime.directory, "diagnostic.mjs"); await writeFile(file, generated, { flag: "wx" });
    const child = spawn(process.execPath, [file], { cwd: root, env: runtime.env, windowsHide: true, stdio: "inherit" });
    process.exitCode = await new Promise((resolve, reject) => { child.once("error", reject); child.once("close", (code, signal) => {
      if (signal) reject(new Error("Owned diagnostic interrupted: " + signal)); else resolve(code ?? 1);
    }); });
  } finally { await runtime.close(); }
}
