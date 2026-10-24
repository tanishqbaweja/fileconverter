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
import { createRequire } from "node:module";
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
import { encodeBoundedValidationChunk, decodeBoundedValidationChunk } from "./lib/bounded-validation-chunk.mjs";
import { compareStreamingVideoClocks } from "./lib/streaming-video-clock-fidelity.mjs";
import { boundedNativeLines, parseCompactAacPacket } from "./lib/bounded-native-lines.mjs";
import { runMpeg2UiJob } from "./lib/mpeg2-ui-job.mjs";
import { selectMpeg2UiControls } from "./lib/mpeg2-ui-controls.mjs";
import { mpeg2ControlReference, sourceMpeg2ControlClock, expectedMpeg2ControlClocks } from "./lib/mpeg2-control-reference.mjs";
import { loadMpeg2RuntimeNative } from "./lib/mpeg2-runtime-native-selection.mjs";
import { mpeg2ControlFixtureArguments } from "./lib/mpeg2-control-fixture.mjs";
import { createBoundedVisualObserver } from "./lib/bounded-visual-observer.mjs";
import { mpeg2StorageRecoveryCases, assertMpeg2StorageFailure } from "./lib/mpeg2-storage-recovery.mjs";
import { MPEG2_ORIGINAL_GATE, assertMpeg2OriginalStructure, compareOriginalAacPackets, selectExactLocalOriginal } from "./lib/mpeg2-original-gate.mjs";
import { createLosslessNativeMemoryJournal, compactLosslessNativeMemoryJournal } from "./lib/lossless-native-memory-journal.mjs";
import { startNativeAllocationProfile, captureBrowserNativeAllocationProfile, NATIVE_PROFILE_LIMITS } from "./lib/native-allocation-profile.mjs";
import { installProtocolMethodCounts } from "./lib/protocol-method-counts.mjs";
import { installBoundedNetworkObserver } from "./lib/bounded-network-observer.mjs";
import { verifyOpfsDiskBacking } from "./lib/opfs-disk-backing-proof.mjs";
import { conversionProfiles, formatById } from "../lib/capability-registry.ts";

const root = path.resolve(import.meta.dirname, ".."), exec = promisify(execFile);
const flags = new Set(process.argv.slice(2));
assert.ok(flags.size === process.argv.length - 2 && [...flags].every(flag => ["--diagnose-allocations", "--events-only-trace", "--bounded-visual-capture", "--post-measurement-allocators", "--memory-failure-allocators", "--native-allocation-profile", "--native-profile-late-window", "--persistent-opfs-context", "--protocol-method-counts", "--bounded-network-observer", "--cache-repeats", "--recovery", "--storage-recovery", "--planning", "--ui", "--controls", "--ui-controls", "--ui-batch", "--original"].includes(flag) || /^--scaled-properties-build=[0-9]{8,}$/.test(flag)));
const uiControls = flags.has("--ui-controls");
const fullOriginal = flags.has("--original");
const persistentOpfsContext = flags.has("--persistent-opfs-context");
assert.ok(!persistentOpfsContext || (fullOriginal && flags.has("--bounded-network-observer")), "Disk-backed context qualification is an explicit original-file mode");
assert.ok(!fullOriginal || (!flags.has("--ui") && !flags.has("--controls") && flags.has("--bounded-visual-capture")), "Original is one explicit full-file production gate");
const uiBatch = flags.has("--ui-batch");
assert.ok(!uiBatch || (!flags.has("--ui") && !uiControls && !flags.has("--controls") && flags.has("--bounded-visual-capture")), "UI batch is one finite actual-button gate");
const storageRecovery = flags.has("--storage-recovery");
assert.ok(!storageRecovery || (!flags.has("--recovery") && flags.has("--bounded-visual-capture")), "Storage recovery is one finite bounded fault-injection gate");
assert.ok(!uiControls || (!flags.has("--ui") && !flags.has("--controls") && flags.has("--bounded-visual-capture")), "UI controls is one bounded real-form gate");
const scaledBuildFlags = [...flags].filter(flag => flag.startsWith("--scaled-properties-build="));
assert.ok(scaledBuildFlags.length <= 1);
const scaledBuildRunId = scaledBuildFlags.length ? scaledBuildFlags[0].split("=")[1] : null;
assert.ok(scaledBuildRunId === null || flags.has("--controls") || uiControls || storageRecovery || uiBatch || fullOriginal, "Changed scaler core is explicit qualification only, not implicit route promotion");
assert.ok(!flags.has("--events-only-trace") || flags.has("--diagnose-allocations"), "Observer control is diagnostic-only, never route promotion");
assert.ok(!flags.has("--post-measurement-allocators") || flags.has("--diagnose-allocations"));
const diagnose = flags.has("--diagnose-allocations"), eventsOnly = flags.has("--events-only-trace");
const failureAllocators = flags.has("--memory-failure-allocators");
const nativeProfile = flags.has("--native-allocation-profile");
const lateNativeProfile = flags.has("--native-profile-late-window");
assert.ok(!lateNativeProfile || (nativeProfile && flags.has("--bounded-network-observer")), "Late diagnostic requires native sampling and already-verified bounded network observation");
const nativeProfileWindowMs = lateNativeProfile ? NATIVE_PROFILE_LIMITS.lateWindowMs : NATIVE_PROFILE_LIMITS.shortWindowMs;
assert.ok(!failureAllocators || (fullOriginal && diagnose && !flags.has("--post-measurement-allocators")), "Failure allocator dump is a separate bounded original diagnosis");
assert.ok(!nativeProfile || (fullOriginal && diagnose && !failureAllocators && !flags.has("--post-measurement-allocators")), "Native sampling is one finite non-acceptance diagnosis");
assert.ok(!flags.has("--protocol-method-counts") || nativeProfile, "Protocol names are a separate finite native-profile diagnosis only");
assert.ok(!flags.has("--bounded-network-observer") || fullOriginal, "Bounded network body retention is explicit original-file observation only");
const boundedVisual = flags.has("--bounded-visual-capture"), continuousVisual = !eventsOnly && !boundedVisual;
assert.ok(!boundedVisual || (diagnose && (flags.has("--controls") || uiControls || storageRecovery || uiBatch || fullOriginal) && !eventsOnly), "Bounded visual observer is one explicit finite gate, not implicit acceptance");
const recovery = flags.has("--recovery") || storageRecovery;
const planning = flags.has("--planning");
const ui = flags.has("--ui") || uiControls || uiBatch || fullOriginal;
const controls = flags.has("--controls") || uiControls;
assert.ok(Number(recovery) + Number(planning) + Number(ui && !uiControls && !uiBatch && !fullOriginal) + Number(controls && !uiControls) + Number(uiControls) + Number(uiBatch) + Number(fullOriginal) + Number(flags.has("--cache-repeats")) <= 1, "Select one finite qualification gate");
assert.ok(!recovery || !flags.has("--cache-repeats"), "Recovery is a separate missing gate, not an unchanged repeat run");
const cases = controls ? [
  { name: "unchanged-default-policy", expected: "complete" },
  { name: "requested-controls", expected: "complete", videoOptions: { codec: "automatic", maxWidth: 320, bitRateBps: 1000000, frameRateFps: 15, quality: "higher" } },
] : planning ? [
  { name: "planned-native-conversion", expected: "complete" },
  { name: "unavailable-decoder-preflight", expected: "error", preflightRejection: true },
] : storageRecovery ? mpeg2StorageRecoveryCases() : recovery ? [
  { name: "in-flight-cancel", expected: "cancelled", cancelDuringEncoding: true },
  { name: "recover-after-cancel", expected: "complete" },
  { name: "final-write-failure", expected: "error", testFault: "write" },
  { name: "recover-after-write-failure", expected: "complete" },
] : Array.from({ length: flags.has("--cache-repeats") ? 3 : 1 }, (_, index) => ({ name: `complete-${index + 1}`, expected: "complete" }));
const repetitions = cases.length;
const pause = ms => new Promise(resolve => setTimeout(resolve, ms));
const sha = bytes => createHash("sha256").update(bytes).digest("hex");
const hashFile = async file => { const hash = createHash("sha256"); for await (const chunk of createReadStream(file)) hash.update(chunk); return hash.digest("hex"); };
const report = { scope: "production-MPEG2-dispatch-and-staged-lifecycle-small-fixture-not-public-acceptance", startedAt: new Date().toISOString(),
  publicAcceptance: false, uiPlannerCoverage: false, largeFileCoverage: false, speedComparison: false, standaloneWorker: false, failures: [] };
if (fullOriginal) report.scope = "one-exact-full-original-through-current-production-UI-and-native-pipeline-not-repeat-stress-or-public-acceptance";
report.observer = { allocationDiagnostics: diagnose, screenshots: continuousVisual, snapshots: continuousVisual, sources: true,
  boundedVisualCapture: boundedVisual, controlScope: boundedVisual ? "bounded real-state visual evidence, not route promotion"
    : eventsOnly ? "events-only observer comparison, not route promotion" : "existing full screenshot/snapshot trace" };
report.cacheQualification = { repetitions, sameSource: !recovery && !planning, outputHashes: [], results: [], globalSpeedClaim: false };
if (planning) report.planningQualification = { cases: [], completed: false, rejectedBeforeDestinationOrCode: false,
  finalUiSelectorCoverage: false, publicAcceptance: false };
if (controls) report.controlsQualification = { cases: [], completed: false, sameNativeBytes: true, uiControlsCovered: false, publicAcceptance: false, speedComparison: false };
if (uiControls) report.uiControlsQualification = { cases: [], completed: false, actualConvertButton: false, publicAcceptance: false, nativeOsPickerCovered: false };
if (uiBatch) report.uiBatchQualification = { completed: false, inputFiles: 2, actualConvertButton: false, outputs: [],
  sameFilenameCollisionCovered: true, terminalMetricsScope: "final batch item only; native work observed separately for each index",
  nativeOsPickerCovered: false, publicAcceptance: false };
if (fullOriginal) report.originalQualification = { ...MPEG2_ORIGINAL_GATE, completed: false, currentProductionPipeline: true,
  actualConvertButton: false, nativeOsPickerCovered: false, near10GBScalingCovered: false };
if (recovery) report.recoveryQualification = { cases: [], completed: false, nativeDuringEncodingCancellation: false,
  destinationRollback: false, noStagesAfterEachTerminal: false, publicAcceptance: false };
if (storageRecovery) report.storageRecoveryQualification = { completed: false, faultInjection: true, actualQuotaExhaustion: false,
  actualOsPermissionRevocation: false, actualConvertButton: false, nativeOsPickerCovered: false, publicAcceptance: false };
const staticRequests = { manifests: 0, decoder: 0, encoder: 0 }; report.staticRequests = staticRequests;
const runtime = await createOwnedRuntimeScratch("mpeg2-production-runtime-");
const env = { ...runtime.env, NODE_OPTIONS: [process.env.NODE_OPTIONS ?? "", "--import=" + pathToFileURL(path.join(root, "scripts/lib/hidden-unit-subprocesses.mjs")).href].filter(Boolean).join(" "),
  NEXT_TELEMETRY_DISABLED: "1", WRANGLER_SEND_METRICS: "false" };
const generated = [], processIdentities = [], samples = [], baselineWindows = [], blankObservations = [], forbiddenRequests = [];
let server, serverIdentity, browserServer, browser, context, monitor, monitorTimer, monitorPending = Promise.resolve(), monitorFailure, realmSampler, browserRootPid;
let visualObserver, nativeJournal, snapshotPending, rendererNativeProfile, protocolCounter, boundedNetworkObserver, browserNativeSession;
let networkRequestsObserved = 0;
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
let serverLog = "", output, browserPin, originalHash, work, monitorBusy = false, tracing = false, validationTarget;
let browserOutputName = "mpeg2-runtime-output.mp4";
const snapshot = async () => {
  if (snapshotPending) return snapshotPending;
  snapshotPending = (async () => {
  const batch = await monitor.drain();
  const annotated = batch.samples.map(sample => ({ ...sample,
    phase: phaseChanges.findLast(change => change.at <= Date.parse(sample.timestamp))?.phase ?? "unavailable",
    elapsedMs: Date.parse(sample.timestamp) - Date.parse(report.startedAt) }));
  if (nativeJournal) await nativeJournal.appendBatch({ ...batch, samples: annotated });
  if (!fullOriginal) assert.ok(samples.length + annotated.length <= 3000, "Bounded short-test sample cap");
  samples.push(...annotated);
  if (fullOriginal && samples.length > 128) samples.splice(0, samples.length - 128);
  })().finally(() => { snapshotPending = null; });
  return snapshotPending;
};
const recordObservedMemory = () => {
  if (!report.blankBaseline) return;
  const available = samples.filter(sample => sample.privateBytes !== null);
  const active = samples.filter(sample => sample.phase !== "blank" && sample.privateBytes !== null);
  const all = nativeJournal?.peaksExcept([]), retained = nativeJournal?.peaksExcept(["blank"]);
  const peak = retained?.peak ?? active.reduce((a, b) => !a || a.privateBytes < b.privateBytes ? b : a, null);
  if (!peak) return;
  report.memory = { scope: fullOriginal ? "one-current-production-full-original-attempt-not-repeat-stress-or-public-acceptance" : "small-runtime-integration-only-not-large-file-or-public-profile-acceptance",
    intervalMs: 100, validSamples: all?.validSamples ?? available.length,
    unavailableSamples: samples.filter(s => s.privateBytes === null), unavailableListIsTailOnly: fullOriginal,
    unavailableSampleCount: all?.unavailableSamples ?? samples.filter(s => s.privateBytes === null).length,
    conversionSamples: nativeJournal ? null : samples.filter(s => s.phase === "conversion" && s.privateBytes !== null).length,
    fullHistoryInLosslessJournal: fullOriginal, peak, incrementalPrivateMiB: (peak.privateBytes - report.blankBaseline.privateBytes) / 1048576 };
};
const startActiveMonitor = page => {
  monitorTimer = setInterval(() => {
    if (monitorBusy) return;
    monitorBusy = true;
    monitorPending = snapshot().then(async () => {
      if (fullOriginal && !report.earlyMemoryFailure && !report.nativeProfileFiniteStop) {
        const peak = nativeJournal.peaksExcept(["blank"]).peak;
        const budgetExceeded = peak && (peak.privateBytes - report.blankBaseline.privateBytes) / 1048576 > 250;
        const nativeProfileDue = rendererNativeProfile && phaseChanges.at(-1).phase === "conversion" && Date.now() - Date.parse(rendererNativeProfile.startedAt) >= nativeProfileWindowMs;
        if (peak && (budgetExceeded || nativeProfileDue)) {
          const stop = { peak, incrementalPrivateMiB: (peak.privateBytes - report.blankBaseline.privateBytes) / 1048576,
            reason: budgetExceeded ? "Stop spending hours on a known failed primary memory gate; no threshold, baseline or process exclusion change"
              : `Finite native sampling diagnostic intentionally cancels after${nativeProfileWindowMs / 1000}s; not full-original qualification` };
          if (budgetExceeded) report.earlyMemoryFailure = stop; else report.nativeProfileFiniteStop = stop;
          if (rendererNativeProfile) {
            const captures = await Promise.allSettled([rendererNativeProfile.capture(), browserNativeSession
              ? captureBrowserNativeAllocationProfile(browserNativeSession,
                path.join(root, "output/playwright", report.startedAt.replaceAll(":", "-") + "-original-browser-native-profile.json.gz")) : Promise.resolve(null)]);
            rendererNativeProfile = null; browserNativeSession = null;
            for (const [index, key] of ["nativeAllocationProfile", "browserNativeAllocationProfile"].entries()) {
              const result = captures[index];
              report[key] = result.status === "fulfilled" ? result.value : { status: "unavailable", error: String(result.reason).slice(0, 1024), acceptanceMetric: false, perturbsMemory: true };
            }
          }
          if (failureAllocators) {
            // The primary gate has already failed. Keep recording its true
            // complete-tree peak, including perturbation; never turn this
            // diagnostic into a passing memory/speed or allocation-stack claim.
            report.memoryFailureDiagnosticPerturbsMeasurement = true;
            try {
              report.failureMemoryAllocators = await captureLiveMemoryInfra({ session: await browser.newBrowserCDPSession(),
                phase: "after-known-budget-failure-before-native-cancel", processes: peak.processes, captureMs: 8000,
                archivePath: path.join(root, "output/playwright", report.startedAt.replaceAll(":", "-") + "-original-failure-allocators.json.gz") });
            } catch (error) { report.failureMemoryAllocators = { status: "unavailable", error: String(error).slice(0, 1024),
              acceptanceMetric: false, perturbsMemory: true }; }
          }
          const observations = await Promise.allSettled([captureAttribution("memory-limit-failure"), page.evaluate(() => {
            const state = window.__WITHIN_TEST__?.getState(), cancel = document.querySelector("button.cancel");
            const requested = state?.jobState === "running" && cancel instanceof HTMLButtonElement && !cancel.disabled;
            if (requested) cancel.click();
            return { requested, phase: state?.phase ?? null, inputBytes: state?.metrics?.inputBytes ?? null,
              outputBytes: state?.metrics?.outputBytes ?? null, wasmMemoryBytes: state?.metrics?.wasmMemoryBytes ?? null };
          })]);
          stop.cancellation = observations[1].status === "fulfilled" ? observations[1].value : { unavailable: String(observations[1].reason).slice(0, 512) };
          if (!stop.cancellation.requested) {
            // This is the exact owned browser connection, not a PID-wide sweep.
            // Stop a failed loading/selection phase even before a Cancel exists.
            await browser.close();
          }
          throw new Error(budgetExceeded ? "Full-original complete-browser incremental private memory exceeded250MiB" : "Finite native allocation diagnostic intentionally stopped before full conversion");
        }
      }
    }).catch(error => { monitorFailure ??= error; }).finally(() => { monitorBusy = false; });
  }, 500);
};
try {
  if (flags.has("--bounded-network-observer")) {
    const bundlePath = path.join(root, "node_modules/playwright-core/lib/coreBundle.js");
    const internal = createRequire(import.meta.url)(bundlePath);
    assert.equal(internal.getPlaywrightVersion(), "1.62.1");
    const source = await readFile(bundlePath, "utf8");
    assert.match(source, /this\._protocolLogger\("send", message\);\s+this\._transport\.send\(message\);/);
    const probe = internal.server.createPlaywright({ sdkLanguage: "javascript", isServer: true });
    boundedNetworkObserver = installBoundedNetworkObserver(Object.getPrototypeOf(probe.chromium), persistentOpfsContext ? "_innerLaunchWithRetries" : "launch");
    report.boundedNetworkObserverBinding = { playwrightVersion: internal.getPlaywrightVersion(), bundleSha256: sha(source), diagnosticOnly: nativeProfile };
  }
  if (flags.has("--protocol-method-counts")) {
    const bundlePath = path.join(root, "node_modules/playwright-core/lib/coreBundle.js");
    const internal = createRequire(import.meta.url)(bundlePath);
    protocolCounter = installProtocolMethodCounts(internal.utils.debugLogger);
    report.protocolMethodObserverBinding = { playwrightVersion: internal.getPlaywrightVersion(), bundleSha256: sha(await readFile(bundlePath)),
      localVendorFilesModified: false, browserFlagsChanged: false };
  }
  const disk = await statfs(root); assert.ok(disk.bavail * disk.bsize >= 32 * 1024 ** 3);
  report.hostMemory = await inspectStressHostMemory(); assert.equal(report.hostMemory.safeToStart, true);
  const selectedNative = await loadMpeg2RuntimeNative(root, scaledBuildRunId);
  report.scaledPropertiesBuild = selectedNative.proof;
  browserPin = await inspectInstalledChromePin(); report.browser = browserPin;
  assert.equal((await lstat(path.join(root, "test.mkv"))).size, 2958573265);
  originalHash = await hashFile(path.join(root, "test.mkv"));
  assert.equal(originalHash, "31f36695b5b44c62125a9e4264e84dc085accd21c02cc3487aae597f54b9db34");
  work = runtime.directory;
  const native = (args, executable = "ffmpeg") => exec(executable, args, { cwd: root, env, windowsHide: true, timeout: fullOriginal ? MPEG2_ORIGINAL_GATE.validatorDeadlineMs : 120000, maxBuffer: 4 * 1024 ** 2 });
  const fixture = fullOriginal ? path.join(root, "test.mkv") : path.join(work, "source.mkv"); output = path.join(work, "output.mp4");
  const fixtureSeconds = ui && !uiControls && !uiBatch ? 12 : 4;
  const fixtureWidth = fullOriginal ? MPEG2_ORIGINAL_GATE.width : controls || storageRecovery || uiBatch ? 640 : 320,
    fixtureHeight = fullOriginal ? MPEG2_ORIGINAL_GATE.height : controls || storageRecovery || uiBatch ? 360 : 240;
  if (!fullOriginal) await native(controls || storageRecovery || uiBatch ? mpeg2ControlFixtureArguments(fixture) : ["-v", "error", "-f", "lavfi", "-i", `testsrc2=size=${fixtureWidth}x${fixtureHeight}:rate=24:duration=${fixtureSeconds}`,
    "-f", "lavfi", "-i", `sine=frequency=997:sample_rate=48000:duration=${fixtureSeconds}`, "-map", "0:v", "-map", "1:a",
    "-c:v", "libx265", "-preset", "ultrafast", "-crf", "18", "-threads:v", "1", "-x265-params",
    "pools=none:frame-threads=1:wpp=0:bframes=2:keyint=48:scenecut=0:log-level=error", "-c:a", "aac", "-b:a", "128k",
    "-metadata", "title=MPEG-2 café 音楽", "-metadata:s:a:0", "language=eng", "-avoid_negative_ts", "make_zero", fixture]);
  report.fixture = { bytes: (await lstat(fixture)).size, sha256: fullOriginal ? originalHash : await hashFile(fixture), video: "hevc", width: fixtureWidth, height: fixtureHeight,
    frames: fullOriginal ? MPEG2_ORIGINAL_GATE.frames : fixtureSeconds * 24, completeOriginal: fullOriginal };
  const cancellationFixture = path.join(work, "cancellation-source.mkv");
  const rejectedFixture = path.join(work, "unavailable-decoder.mkv");
  if (planning) {
    await native(["-v", "error", "-f", "lavfi", "-i", "testsrc2=size=320x240:rate=24:duration=1",
      "-c:v", "libaom-av1", "-cpu-used", "8", "-threads", "1", "-crf", "32", "-b:v", "0", rejectedFixture]);
    report.rejectedFixture = { bytes: (await lstat(rejectedFixture)).size, sha256: await hashFile(rejectedFixture), video: "av1", frames: 24 };
  }
  if (recovery && !storageRecovery) {
    // Long enough to observe real output before clicking the production Cancel
    // button. This is genuine encoded media, not a delay inside the converter.
    await native(["-v", "error", "-f", "lavfi", "-i", "testsrc2=size=320x240:rate=24:duration=12",
      "-f", "lavfi", "-i", "sine=frequency=997:sample_rate=48000:duration=12", "-map", "0:v", "-map", "1:a",
      "-c:v", "libx265", "-preset", "ultrafast", "-crf", "18", "-threads:v", "1", "-x265-params",
      "pools=none:frame-threads=1:wpp=0:bframes=2:keyint=48:scenecut=0:log-level=error", "-c:a", "aac", "-b:a", "128k",
      "-avoid_negative_ts", "make_zero", cancellationFixture]);
    report.cancellationFixture = { bytes: (await lstat(cancellationFixture)).size, sha256: await hashFile(cancellationFixture),
      frames: 288, durationSeconds: 12, video: "hevc", width: 320, height: 240 };
  }
  await exec(process.execPath, ["node_modules/vinext/dist/cli.js", "build"], { cwd: root, env, windowsHide: true, timeout: 180000, maxBuffer: 4 * 1024 ** 2 });
  const assetsParent = path.join(root, "dist/client/engines");
  // Exact fixed directory URL is worker-owned, created exclusively; never replace
  // public assets or reuse a previous run's generated directory.
  const assetDirectory = path.join(assetsParent, "mpeg2"); await mkdir(assetDirectory);
  generated.push({ directory: assetDirectory, identity: await lstat(assetDirectory, { bigint: true }) });
  report.native = [];
  for (const [file, directory, source, expected, pages] of selectedNative.rows) {
    const sourcePath = path.join(root, "work", directory, source), bytes = await readFile(sourcePath); assert.equal(sha(bytes), expected);
    if (pages) assert.deepEqual(readWasmMemoryLimits(bytes), [{ imported: true, initialPages: pages, maximumPages: pages, shared: true }]);
    await copyFile(sourcePath, path.join(assetDirectory, file)); report.native.push({ source: path.relative(root, sourcePath), sha256: expected, bytes: bytes.length });
  }
  const codeManifest = { schemaVersion: 1, engine: "within-mpeg2-split-jspi", decoderMemoryBytes: 33554432, encoderMemoryBytes: 16777216,
    artifactBytes: { "decoder.wasm": report.native.find(row => row.source.endsWith("within-mpeg2-split.wasm")).bytes,
      "encoder.wasm": report.native.find(row => row.source.endsWith("split-encoder.wasm")).bytes },
    artifacts: { "decoder.wasm": report.native.find(row => row.source.endsWith("within-mpeg2-split.wasm")).sha256,
      "encoder.wasm": report.native.find(row => row.source.endsWith("split-encoder.wasm")).sha256 }, publicAcceptance: false };
  const manifestBytes = Buffer.from(JSON.stringify(codeManifest) + "\n");
  await writeFile(path.join(assetDirectory, "build-manifest.json"), manifestBytes, { flag: "wx" });
  report.codeManifest = { bytes: manifestBytes.length, sha256: sha(manifestBytes), value: codeManifest };
  report.sources = {};
  for (const file of ["workers/media-remux.ts", "workers/mpeg2-split-runtime.ts", "workers/random-access-destination.ts",
    "workers/conversion.worker.ts", "workers/mpeg2-core-loader.ts", "workers/staged-save.worker.ts", "workers/staged-save-runtime.ts",
    "lib/staged-worker-coordinator.ts", "lib/staged-copy-protocol.ts", "lib/mpeg2-stage-policy.ts", "lib/mpeg2-qualification-job.ts", "lib/mpeg2-compiled-core.ts",
    "lib/media-conversion-plan.ts", "lib/media-source-inspection.ts", "lib/media-conversion-options.ts", "lib/conversion-protocol.ts",
    "lib/browser-capabilities.ts", "scripts/lib/mpeg2-ui-job.mjs",
    "scripts/lib/mpeg2-ui-controls.mjs",
    "scripts/lib/mpeg2-control-reference.mjs",
    "scripts/lib/mpeg2-runtime-native-selection.mjs",
    "scripts/lib/mpeg2-control-fixture.mjs",
    "scripts/lib/bounded-visual-observer.mjs",
    "scripts/lib/mpeg2-storage-recovery.mjs",
    "scripts/lib/mpeg2-original-gate.mjs", "scripts/lib/lossless-native-memory-journal.mjs", "scripts/lib/native-memory-peaks.mjs",
    "scripts/lib/native-allocation-profile.mjs",
    "scripts/lib/protocol-method-counts.mjs",
    "scripts/lib/bounded-network-observer.mjs",
    "scripts/lib/opfs-disk-backing-proof.mjs",
    "scripts/lib/bounded-validation-chunk.mjs", "scripts/lib/streaming-video-clock-fidelity.mjs", "scripts/lib/bounded-native-lines.mjs",
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
  let launchedBrowserPid, profileDirectory;
  if (persistentOpfsContext) {
    profileDirectory = path.join(work, "chrome-profile"); await mkdir(profileDirectory);
    context = await chromium.launchPersistentContext(profileDirectory, { executablePath: browserPin.launcher.path, headless: true, env, serviceWorkers: "block" });
    browser = context.browser(); assert.ok(browser, "Persistent context must expose its genuine browser");
    const identitySession = await browser.newBrowserCDPSession();
    try {
      const info = await identitySession.send("SystemInfo.getProcessInfo"), roots = info.processInfo.filter(row => row.type === "browser");
      assert.equal(roots.length, 1); launchedBrowserPid = Number(roots[0].id); assert.ok(Number.isSafeInteger(launchedBrowserPid) && launchedBrowserPid > 0);
      const command = await identitySession.send("Browser.getBrowserCommandLine");
      assert.ok(command.arguments.includes("--user-data-dir=" + profileDirectory)); assert.ok(!command.arguments.includes("--incognito"));
      report.storageContext = { mode: "fresh-persistent-normal-context", ownedProfile: path.relative(root, profileDirectory),
        browserPidFromCdp: launchedBrowserPid, explicitIncognitoFlag: false, diskBackingVerified: false };
    } finally { await identitySession.detach(); }
  } else {
    browserServer = await chromium.launchServer({ executablePath: browserPin.launcher.path, headless: true, env });
    launchedBrowserPid = browserServer.process().pid;
    browser = await chromium.connect(browserServer.wsEndpoint());
    context = await browser.newContext({ serviceWorkers: "block" });
    report.storageContext = { mode: "isolated-incognito-context", diskBackingVerified: false, opfsMayBeMemoryBacked: true };
  }
  const browserIdentity = await queryProcessIdentity(launchedBrowserPid); assert.ok(browserIdentity); processIdentities.push(browserIdentity);
  browserRootPid = browserIdentity.pid;
  await context.addInitScript({ content: "Object.defineProperty(globalThis, '__WITHIN_ENCODE_RUNTIME_CHUNK__', { value: (" + encodeBoundedValidationChunk.toString() + ") });" });
  assert.ok(context.pages().length <= 1); const page = context.pages()[0] ?? await context.newPage();
  report.workerEvents = [];
  page.on("worker", worker => {
    const record = type => { assert.ok(report.workerEvents.length < 32); report.workerEvents.push({ type, url: worker.url(), at: new Date().toISOString() }); };
    record("created"); worker.on("close", () => record("closed"));
  });
  page.on("console", message => { if (browserLogs.length === 32) browserLogs.shift(); browserLogs.push({ type: message.type(), text: message.text().slice(0, 512) }); });
  page.on("pageerror", error => { if (browserLogs.length === 32) browserLogs.shift(); browserLogs.push({ type: "pageerror", text: error.message.slice(0, 512) }); });
  if (fullOriginal) {
    const directory = path.join(root, "output/playwright"); await mkdir(directory, { recursive: true });
    nativeJournal = await createLosslessNativeMemoryJournal(browserIdentity.pid, path.join(directory, report.startedAt.replaceAll(":", "-") + "-mpeg2-original-memory.ndjson"));
  }
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
  startActiveMonitor(page);
  await context.tracing.start({ screenshots: continuousVisual, snapshots: continuousVisual, sources: true }); tracing = true;
  changePhase("loaded");
  context.on("request", request => {
    networkRequestsObserved++;
    if (request.url() === base + "/engines/mpeg2/build-manifest.json") staticRequests.manifests++;
    if (request.url() === base + "/engines/mpeg2/decoder.wasm") staticRequests.decoder++;
    if (request.url() === base + "/engines/mpeg2/encoder.wasm") staticRequests.encoder++;
    if (!request.url().startsWith(base + "/") || request.method() !== "GET" || request.postData() !== null) {
    forbiddenRequests.push({ method: request.method(), url: request.url().slice(0, 256) }); } });
  const response = await page.goto(base + (ui ? "/?test=1&directory=1" : "/?test=1"));
  assert.equal(response.status(), 200, "Production app route must load before file selection");
  const headers = response.headers(); assert.equal(headers["cross-origin-opener-policy"], "same-origin");
  if (persistentOpfsContext) {
    report.storageContext.diskProof = await verifyOpfsDiskBacking(page, profileDirectory);
    report.storageContext.diskBackingVerified = true;
  }
  assert.equal(headers["cross-origin-embedder-policy"], "require-corp"); assert.ok(headers["content-security-policy"]);
  await captureAttribution("loaded-before-catalogue");
  const screenshotDirectory = path.join(root, "output/playwright", report.startedAt.replaceAll(":", "-") + "-catalogue");
  await mkdir(screenshotDirectory);
  report.catalogueUi = await verifyProductionCatalogue(page, conversionProfiles.filter(profile => profile.public && profile.automatedTestStatus === "passed")
    .map(profile => ({ id: profile.id, route: profile.route, inputLabel: formatById(profile.input).label, outputLabel: formatById(profile.output).label })), screenshotDirectory);
  if (fullOriginal) report.originalQualification.inputAdapter = await selectExactLocalOriginal(page, fixture);
  else await page.locator('input[type="file"]').first().setInputFiles(uiBatch ? [fixture, fixture] : fixture);
  await page.waitForFunction(() => document.querySelector('[data-testid="media-inspection-status"]')?.textContent.includes("These stream facts came from bounded local header reads"));
  await page.waitForFunction(() => window.__WITHIN_TEST__?.getState().workerStatus === "ready");
  if (boundedVisual) {
    await page.getByTestId("format-select").selectOption("mkv-to-mp4-mpeg2");
    visualObserver = await createBoundedVisualObserver({ page, directory: path.join(screenshotDirectory, "bounded-visual"), maximumCaptures: uiControls || storageRecovery ? 7 : 5 });
    if (!uiControls) await visualObserver.capture("source-ready");
  }
  if (ui) {
    await page.getByTestId("format-select").selectOption("mkv-to-mp4-mpeg2");
    assert.match(await page.getByTestId("media-plan-stream-0").innerText(), /MPEG-2.*4 Mbps/);
    assert.match(await page.getByTestId("media-plan-stream-1").innerText(), /Copy.*AAC/is);
    assert.match(await page.locator('[data-testid="format-select"] option:checked').innerText(), /private qualification/);
    report.uiQualification = { privateSelector: true, realPlanVisible: true, publicAcceptance: false,
      screenshots: [], finalUiMatrixCoverage: false, nativeOsPickerCovered: false };
    if (!uiControls && !uiBatch) {
      const screenshot = path.join(screenshotDirectory, "mpeg2-private-plan.png");
      await page.screenshot({ path: screenshot, fullPage: false }); report.uiQualification.screenshots.push(path.relative(root, screenshot));
    }
  }
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
  report.loadedPeakIncrementalPrivateMiB = ((nativeJournal?.peaksExcept(["blank"]).peak?.privateBytes ?? Math.max(...loadedSamples.filter(sample => sample.privateBytes !== null).map(sample => sample.privateBytes))) - report.blankBaseline.privateBytes) / 1048576;
  await captureAttribution("loaded-after-catalogue");
  if (nativeProfile) {
    report.nativeProfileDiagnosticOnly = true;
    report.nativeProfileWindowMs = nativeProfileWindowMs;
    rendererNativeProfile = await startNativeAllocationProfile(await context.newCDPSession(page),
      path.join(root, "output/playwright", report.startedAt.replaceAll(":", "-") + "-original-native-profile.json.gz"));
    if (lateNativeProfile) browserNativeSession = await context.newCDPSession(page);
  }
  await page.exposeFunction("receiveRuntimeOutput", async chunk => { assert.ok(validationTarget); await validationTarget.write(decodeBoundedValidationChunk(chunk)); });
  for (let repetition = 1; repetition <= repetitions; repetition++) {
  const testCase = cases[repetition - 1];
  if (monitorFailure) throw monitorFailure;
  if ((recovery && !storageRecovery && repetition <= 2) || (planning && repetition === 2)) {
    await page.locator('input[type="file"]').first().setInputFiles(testCase.preflightRejection ? rejectedFixture : testCase.cancelDuringEncoding ? cancellationFixture : fixture);
    await page.waitForFunction(() => document.querySelector('[data-testid="media-inspection-status"]')?.textContent.includes("These stream facts came from bounded local header reads"));
  }
  await page.waitForFunction(() => window.__WITHIN_TEST__?.getState().workerStatus === "ready" && window.__WITHIN_TEST__?.getState().jobState !== "running");
  let selectedUiOptions = null;
  if (uiControls || uiBatch || fullOriginal) {
    const form = await selectMpeg2UiControls(page, testCase.videoOptions); selectedUiOptions = form.selected;
    if (uiControls) {
      const capture = await visualObserver.capture(`case-${repetition}-options`);
      assert.equal(capture.regionInViewport, true, "Actual options must be visible in their bounded screenshot");
      report.uiControlsQualification.cases.push({ name: testCase.name, form, screenshot: capture.file });
    } else if (uiBatch) report.uiBatchQualification.form = form;
    else report.originalQualification.form = form;
  }
  const workerEventStart = report.workerEvents.length;
  changePhase("conversion");
  const visualLifetime = new AbortController();
  const visualWork = !storageRecovery || testCase.testFault ? visualObserver?.observeNativeWork(`case-${repetition}-native`, visualLifetime.signal) : undefined;
  const tasks = [ui ? (fullOriginal ? page.evaluate(runMpeg2UiJob, { fullOriginal: true, options: selectedUiOptions }) : uiBatch ? page.evaluate(runMpeg2UiJob, { batchSize: 2, options: selectedUiOptions }) : page.evaluate(runMpeg2UiJob, selectedUiOptions)).then(value => { changePhase("recovery"); return value; }) : page.evaluate(async testCase => {
    const file = document.querySelector('input[type="file"]').files[0];
    const root = await navigator.storage.getDirectory(), handle = await root.getFileHandle("mpeg2-runtime-output.mp4", { create: true });
    const sentinel = "existing destination must survive";
    const existing = await handle.createWritable(); await existing.write(sentinel); await existing.close();
    const jobId = crypto.randomUUID(), cancellationBuffer = new SharedArrayBuffer(4);
    const job = { type: "start", jobId, profileId: "mkv-to-mp4-mpeg2", file,
      destination: { mode: "staged-handle", handle, stagingName: `within-stage-mkv-to-mp4-mpeg2-${jobId}` }, cancellationBuffer,
      ...(testCase.testFault ? { testFault: testCase.testFault } : {}) };
    if (testCase.videoOptions) job.videoOptions = testCase.videoOptions;
    let timeout, cancellationTimer, cancellation = null;
    if (testCase.cancelDuringEncoding) cancellationTimer = setInterval(() => {
      const state = window.__WITHIN_TEST__.getState();
      if (cancellation || state.jobState !== "running" || state.phase !== "Encoding MPEG-2 MP4" ||
          state.metrics.inputBytes <= 0 || state.metrics.outputBytes <= 0) return;
      const button = document.querySelector("button.cancel");
      if (!(button instanceof HTMLButtonElement) || button.disabled) return;
      cancellation = { inputBytes: state.metrics.inputBytes, outputBytes: state.metrics.outputBytes,
        wasmMemoryBytes: state.metrics.wasmMemoryBytes, phase: state.phase, requestedAt: performance.now(),
        mechanism: "production Cancel safely button after observed native media read/write" };
      button.click();
    }, 16);
    try {
      const result = await Promise.race([
        window.__WITHIN_TEST__.runQualificationJob(job),
        new Promise((_, reject) => { timeout = setTimeout(() => { Atomics.store(new Int32Array(cancellationBuffer), 0, 1);
          reject(new Error("Production job conversion timeout")); }, 60000); }),
      ]);
      if (cancellation) cancellation.finishedAt = performance.now();
      const stageNames = [];
      for await (const name of root.keys()) if (name.startsWith("within-stage-mkv-to-mp4-mpeg2-")) {
        if (stageNames.length >= 8) throw new Error("Unexpected stage accumulation"); stageNames.push(name);
      }
      let destinationUnchanged = null;
      if (result.type !== "complete") {
        const destination = await handle.getFile();
        destinationUnchanged = destination.size === sentinel.length && await destination.slice(0, 128).text() === sentinel;
        await root.removeEntry("mpeg2-runtime-output.mp4");
      }
      return { result, cancellation, stageNames, destinationUnchanged };
    } finally { clearTimeout(timeout); clearInterval(cancellationTimer); }
  }, testCase).then(result => { changePhase("recovery"); return result; }), repetition === 1 ? captureAttribution("conversion") : Promise.resolve()];
  tasks[0] = tasks[0].finally(() => visualLifetime.abort());
  const outcomes = await Promise.allSettled([...tasks, visualWork]);
  const taskErrors = outcomes.filter(outcome => outcome.status === "rejected").map(outcome => outcome.reason);
  if (taskErrors.length) throw new AggregateError(taskErrors, "Conversion or bounded observation failed");
  const execution = outcomes[0].value;
  report.conversion = execution.result;
  if (ui) { browserOutputName = execution.destinationName; Object.assign(report.uiQualification, execution.uiEvidence); }
  if (uiControls) report.uiControlsQualification.cases.at(-1).actualButtonEvidence = execution.uiEvidence;
  if (uiBatch) Object.assign(report.uiBatchQualification, { actualConvertButton: execution.uiEvidence.actualConvertButton,
    actualButtonEvidence: execution.uiEvidence, destinationNames: execution.destinationNames, nativeBatchItems: execution.nativeBatchItems });
  if (fullOriginal) Object.assign(report.originalQualification, { actualConvertButton: execution.uiEvidence.actualConvertButton, actualButtonEvidence: execution.uiEvidence });
  await monitorPending; await snapshot(); changePhase("validation");
  if (recovery) report.recoveryQualification.cases.push({ name: testCase.name, expected: testCase.expected, ...execution });
  if (planning) report.planningQualification.cases.push({ name: testCase.name, expected: testCase.expected, ...execution });
  assert.equal(report.conversion.type, testCase.expected, JSON.stringify(report.conversion));
  if (visualObserver) await visualObserver.capture(`case-${repetition}-terminal`);
  assert.deepEqual(execution.stageNames, [], "Owned media stage must be removed before terminal completion");
  if (!ui) assert.ok(report.conversion.phases.includes("Inspecting MPEG-2 source"));
  if (planning) {
    assert.ok(report.conversion.plan, "Actual production worker must emit its bounded stream plan");
    if (testCase.preflightRejection) {
      assert.match(report.conversion.message, /no AV1 video decoder/);
      assert.ok(report.conversion.plan.blockingReasons.length > 0);
      assert.equal(execution.destinationUnchanged, true);
      for (const phase of ["Destination opened", "Worker started", "Compiled MPEG-2 code", "Reusing compiled MPEG-2 code", "Encoding MPEG-2 MP4"])
        assert.equal(report.conversion.phases.includes(phase), false, "Preflight rejection must precede " + phase);
      assert.equal(report.conversion.nativeMetrics, null);
      assert.equal(report.conversion.metrics.peakPendingOperations, 0); assert.equal(report.conversion.metrics.outputBytes, 0);
      assert.deepEqual(staticRequests, { manifests: 1, decoder: 1, encoder: 1 });
      continue;
    }
    assert.deepEqual(report.conversion.plan.blockingReasons, []);
    assert.deepEqual(report.conversion.plan.streams.map(row => row.action), ["re-encode", "copy"]);
    assert.match(report.conversion.plan.streams[0].detail, /MPEG-2.*4 Mbps/);
  }
  assert.ok(report.conversion.phases.includes("Encoding MPEG-2 MP4"));
  if (!ui) {
    if (testCase.expected !== "cancelled") assert.ok(report.conversion.phases.includes("Copying staged MP4 to selected destination"));
    assert.ok(report.conversion.phases.includes(repetition === 1 ? "Compiled MPEG-2 code" : "Reusing compiled MPEG-2 code"));
  }
  const nativeMetrics = report.conversion.nativeMetrics;
  assert.equal(nativeMetrics.wasmMemoryBytes, 50331648); assert.ok(nativeMetrics.maxReadChunkBytes <= 262144);
  assert.ok(nativeMetrics.maxWriteChunkBytes <= 262144); assert.ok(nativeMetrics.peakQueuedBytes <= 262144);
  assert.equal(nativeMetrics.peakPendingOperations, 1);
  const metrics = report.conversion.metrics;
  // Cancellation reports its last native allocation before the application
  // retires that worker; do not relabel that value as zero. A saver terminal
  // genuinely owns no Wasm. The complete-tree observer remains authoritative.
  assert.equal(metrics.wasmMemoryBytes, testCase.expected === "cancelled" ? 50331648 : 0);
  assert.equal(metrics.peakWasmMemoryBytes, 50331648); assert.equal(metrics.scratchBytes, 0);
  assert.ok(metrics.maxWriteChunkBytes <= 524288); assert.ok(metrics.peakQueuedBytes <= 524288);
  assert.equal(metrics.peakPendingOperations, 1); assert.equal(metrics.pendingOperations, 0);
  assert.equal(metrics.queuedBytes, 0);
  if (testCase.expected !== "complete") {
    assert.equal(execution.destinationUnchanged, true, "Cancelled/failed job must not overwrite the existing destination");
    if (testCase.cancelDuringEncoding) {
      assert.ok(execution.cancellation, "Cancellation must occur during actual processing, not before start");
      assert.ok(execution.cancellation.inputBytes > 0 && execution.cancellation.outputBytes > 0);
      assert.equal(execution.cancellation.wasmMemoryBytes, 50331648);
      assert.ok(execution.cancellation.finishedAt - execution.cancellation.requestedAt < 5000, "Native cancellation response exceeded5s");
    } else if (storageRecovery) assertMpeg2StorageFailure(testCase, execution);
    else assert.match(report.conversion.message, /destination rejected a bounded write/i);
    await page.waitForFunction(() => window.__WITHIN_TEST__?.getState().workerStatus === "ready" && window.__WITHIN_TEST__?.getState().jobState !== "running");
    const retiredRole = testCase.expected === "cancelled" ? "conversion.worker" : "staged-save.worker";
    assert.ok(report.workerEvents.slice(workerEventStart).some(event => event.type === "closed" && event.url.includes(retiredRole)), "Failed job worker must retire before recovery");
    report.recoveryQualification.cases.at(-1).terminalWorkerRetired = true;
    continue;
  }
  assert.ok(report.workerEvents.some(event => event.type === "closed" && event.url.includes("conversion.worker")));
  assert.ok(report.workerEvents.some(event => event.type === "created" && event.url.includes("staged-save.worker")));
  const outputNamesToValidate = uiBatch ? execution.destinationNames : [browserOutputName];
  for (const outputNameToValidate of outputNamesToValidate) {
  const file = await open(output, "wx");
  try {
    validationTarget = file;
    await page.evaluate(async browserOutputName => {
      const root = await navigator.storage.getDirectory(), handle = await root.getFileHandle(browserOutputName), file = await handle.getFile();
      const reader = file.stream().getReader({ mode: "byob" }); let buffer = new Uint8Array(65536);
      try { for (;;) { const { done, value } = await reader.read(buffer); if (done) break;
        await window.receiveRuntimeOutput(window.__WITHIN_ENCODE_RUNTIME_CHUNK__(value)); buffer = new Uint8Array(value.buffer); } }
      finally { await reader.cancel(); await root.removeEntry(browserOutputName); }
    }, outputNameToValidate);
  } finally { validationTarget = undefined; await file.close(); }
  const probe = async file => JSON.parse((await native(["-v", "error", ...fullOriginal ? [] : ["-count_frames"], "-show_streams", "-show_format", "-show_chapters", "-of", "json", file], "ffprobe")).stdout);
  const source = await probe(fixture), converted = await probe(output);
  const reference = controls || storageRecovery || uiBatch ? mpeg2ControlReference(source.streams[0], testCase.videoOptions) : null;
  assert.equal(source.streams[0].codec_name, "hevc"); assert.equal(converted.streams[0].codec_name, "mpeg2video");
  // Full original is frame-counted by the independent streaming all-frame
  // clock comparison below, avoiding a redundant complete native decode here.
  if (!fullOriginal) assert.equal(Number(converted.streams[0].nb_read_frames), reference?.frames ?? report.fixture.frames);
  assert.equal(converted.streams[0].width, reference?.width ?? fixtureWidth); assert.equal(converted.streams[0].height, reference?.height ?? fixtureHeight);
  if (reference) {
    const actual = report.conversion.metrics.mpeg2EncoderSettings;
    assert.deepEqual(actual, { width: reference.width, height: reference.height, frameRateNumerator: reference.frameRate,
      frameRateDenominator: 1, bitRateBps: reference.bitrate, qmin: reference.qmin, qmax: reference.qmax });
    assert.equal(converted.streams[0].avg_frame_rate, reference.frameRate + "/1");
    assert.equal(converted.streams[0].display_aspect_ratio, source.streams[0].display_aspect_ratio);
  }
  assert.equal(converted.streams[1].codec_name, "aac");
  if (fullOriginal) report.originalQualification.structure = assertMpeg2OriginalStructure(source, converted, report.conversion.warnings);
  else { assert.equal(converted.streams[1].tags.language, "eng"); assert.equal(converted.format.tags.title, source.format.tags.title); }
  const audioHash = async file => (await native(["-v", "error", "-i", file, "-map", "0:a", "-c", "copy", "-f", "streamhash", "-hash", "sha256", "pipe:1"])).stdout.trim();
  assert.equal(await audioHash(output), await audioHash(fixture));
  if (fullOriginal) {
    const art = async (file, index) => (await native(["-v", "error", "-i", file, "-map", `0:${index}`, "-c", "copy", "-f", "streamhash", "-hash", "sha256", "pipe:1"])).stdout.trim();
    const before = await art(fixture, 3), after = await art(output, 2); assert.equal(after, before);
    report.originalQualification.artworkPacketHash = after;
    const packets = file => (async function* () {
      for await (const line of boundedNativeLines("ffprobe", ["-v", "error", "-select_streams", "a:0", "-show_packets", "-show_entries",
        "packet=stream_index,pts_time,dts_time,dts,duration_time,data_hash:packet_side_data=side_data_type,skip_samples,discard_padding",
        "-show_data_hash", "sha256", "-of", "compact", file], { cwd: root, env, timeoutMs: MPEG2_ORIGINAL_GATE.validatorDeadlineMs })) yield parseCompactAacPacket(line);
    })();
    report.originalQualification.aacPackets = await compareOriginalAacPackets(packets(fixture), packets(output));
  }
  await native(["-v", "error", "-xerror", "-i", output, "-f", "null", "-"]);
  const comparison = await native(["-v", "info", "-i", fixture, "-i", output, "-filter_complex",
    `[0:v:0]${reference?.referenceFilter ?? ""}settb=1/1,setpts=N[ref];[1:v:0]settb=1/1,setpts=N[out];[ref][out]ssim`, "-an", "-f", "null", "-"]);
  const ssim = Number(/All:([0-9.]+)/.exec(comparison.stderr)?.[1]); assert.ok(ssim >= 0.98, `SSIM ${ssim}`);
  const times = file => boundedNativeLines("ffprobe", ["-v", "error", "-select_streams", "v:0", "-show_frames", "-show_entries", "frame=best_effort_timestamp_time", "-of", "compact", file], { cwd: root, env,
    timeoutMs: fullOriginal ? MPEG2_ORIGINAL_GATE.validatorDeadlineMs : 600000 });
  const clockReference = reference ? expectedMpeg2ControlClocks(await sourceMpeg2ControlClock(times(fixture)), reference) : times(fixture);
  const videoClocks = await compareStreamingVideoClocks(clockReference, times(output), reference?.frames ?? report.fixture.frames);
  report.output = { bytes: (await lstat(output)).size, sha256: await hashFile(output), codec: "mpeg2video", frames: reference?.frames ?? report.fixture.frames, ssim, fullNativeDecodePassed: true,
    copiedAudioPacketHash: await audioHash(output), titlePreserved: true, languagePreserved: true, videoClocks };
  report.cacheQualification.outputHashes.push(report.output.sha256);
  report.cacheQualification.results.push({ repetition, conversion: report.conversion, output: report.output });
  if (uiBatch) report.uiBatchQualification.outputs.push({ name: outputNameToValidate, ...report.output });
  if (fullOriginal) { report.originalQualification.output = report.output; report.originalQualification.completed = true; report.largeFileCoverage = true; }
  if (recovery) report.recoveryQualification.cases.at(-1).independentOutput = report.output;
  if (planning) report.planningQualification.cases.at(-1).independentOutput = report.output;
  if (controls) report.controlsQualification.cases.push({ name: testCase.name, requested: testCase.videoOptions ?? "automatic", reference,
    actualNativeSettings: report.conversion.metrics.mpeg2EncoderSettings, output: report.output, conversion: report.conversion });
  await rm(output);
  }
  }
  assert.equal(report.cacheQualification.results.length, uiBatch ? 2 : planning ? 1 : recovery ? 2 : repetitions);
  assert.equal(new Set(report.cacheQualification.outputHashes).size, controls ? 2 : 1);
  if (controls) { assert.equal(report.controlsQualification.cases.length, 2); report.controlsQualification.completed = true;
    if (uiControls) {
      assert.equal(report.uiControlsQualification.cases.length, 2);
      report.uiControlsQualification.actualConvertButton = report.uiControlsQualification.cases.every(c =>
        c.form.realSelectEvents && c.actualButtonEvidence?.actualConvertButton && c.actualButtonEvidence?.optionsReadFromActualForm && c.actualButtonEvidence?.nativeWorkObserved);
      assert.equal(report.uiControlsQualification.actualConvertButton, true);
      report.controlsQualification.uiControlsCovered = true; report.uiControlsQualification.completed = true;
    } }
  if (visualObserver) {
    report.boundedVisualObservation = visualObserver.summary();
  }
  assert.deepEqual(staticRequests, { manifests: uiBatch ? 2 : planning ? 1 : repetitions, decoder: 1, encoder: 1 });
  if (uiBatch) {
    assert.equal(report.uiBatchQualification.outputs.length, 2);
    assert.equal(new Set(report.uiBatchQualification.outputs.map(o => o.name.toLowerCase())).size, 2);
    assert.deepEqual(report.uiBatchQualification.nativeBatchItems.map(i => i.index).sort(), [0, 1]);
    report.uiBatchQualification.completed = true;
  }
  if (planning) Object.assign(report.planningQualification, { completed: true, rejectedBeforeDestinationOrCode: true });
  if (recovery) Object.assign(report.recoveryQualification, { completed: true, nativeDuringEncodingCancellation: !storageRecovery,
    destinationRollback: true, noStagesAfterEachTerminal: true });
  if (storageRecovery) report.storageRecoveryQualification.completed = true;
  clearInterval(monitorTimer); await monitorPending; await snapshot();
  await captureAttribution("post-completion"); await snapshot();
  await monitor.close(); monitor = null;
  if (diagnose) {
    annotateNativeProcessTypes(samples, attribution.references, browserRootPid);
    report.attribution = attribution; report.diagnosticMemorySamples = samples;
  }
  assert.equal(forbiddenRequests.length, 0); report.forbiddenRequests = forbiddenRequests;
  if (!fullOriginal) assert.ok(samples.some(sample => sample.phase === "conversion" && sample.privateBytes !== null));
  else assert.ok(nativeJournal.peaksExcept(["blank", "loaded", "validation", "recovery"]).validSamples > 0);
  recordObservedMemory();
  assertInstalledChromePinsEqual(browserPin, await inspectInstalledChromePin());
  for (const [file, hash] of Object.entries(report.sources)) assert.equal(sha(await readFile(path.join(root, file))), hash, "Executed source changed: " + file);
  report.executedSourcesAndBrowserPinsVerified = true;
  // Persist all memory/privacy/source evidence before a visual-only assertion.
  // A late observation failure must not erase the primary measurements.
  if (visualObserver) assert.ok(report.boundedVisualObservation.captures.some(capture => capture.nativeProgressVisuallyInViewport), "Actual active native progress was not visibly verified");
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
  report.status = fullOriginal ? "passed-one-full-original-production-attempt-not-repeat-stress-or-public-acceptance"
    : diagnose ? "passed-small-allocation-diagnostic-not-route-promotion" : "passed-small-production-runtime-integration";
} catch (error) {
  report.status = "failed"; report.failures.push(String(error.stack ?? error)); report.serverLog = serverLog;
  if (error instanceof AggregateError) for (const detail of error.errors) report.failures.push(String(detail.stack ?? detail));
  report.failureMemorySamples = samples; process.exitCode = 1;
} finally {
  if (visualObserver) report.boundedVisualObservation = visualObserver.summary();
  clearInterval(monitorTimer); await monitorPending;
  realmSampler?.close();
  if (rendererNativeProfile) {
    try { await rendererNativeProfile.close(); rendererNativeProfile = null; }
    catch (error) { report.failures.push("Native profile cleanup: " + String(error)); report.status = "failed"; process.exitCode = 1; }
  }
  if (browserNativeSession) {
    try { await browserNativeSession.detach(); browserNativeSession = null; }
    catch (error) { report.failures.push("Browser native session cleanup: " + String(error)); report.status = "failed"; process.exitCode = 1; }
  }
  if (protocolCounter) {
    try { report.protocolMethodCounts = protocolCounter.summary(); protocolCounter.close(); }
    catch (error) { report.failures.push("Protocol observer cleanup: " + String(error)); report.status = "failed"; process.exitCode = 1; }
  }
  if (fullOriginal && nativeJournal) {
    let coverageFailure = null;
    if (monitor) {
      try { await snapshot(); } catch (error) { coverageFailure = String(error.stack ?? error); }
      try { await monitor.close(); monitor = null; } catch (error) { coverageFailure ??= String(error.stack ?? error); }
    }
    try {
      recordObservedMemory();
      const receipt = await nativeJournal.close();
      report.losslessMemoryJournal = await compactLosslessNativeMemoryJournal(coverageFailure
        ? { ...receipt, complete: false, conversionAcceptance: false, failure: coverageFailure } : receipt);
      report.diagnosticMemoryTailOnly = true;
      report.diagnosticMemoryTailLimit = 128;
      if (coverageFailure) {
        if (report.memory) { report.memory.coverageComplete = false; report.memory.fullHistoryInLosslessJournal = false; }
        throw new Error("Native observer coverage unavailable: " + coverageFailure);
      }
      if (report.memory) assert.ok(report.memory.incrementalPrivateMiB <= 250);
    } catch (error) { report.failures.push("Full-original lossless memory finalization: " + String(error.stack ?? error)); report.status = "failed"; process.exitCode = 1; }
  }
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
  if (boundedNetworkObserver) {
    try {
      report.boundedNetworkObserver = boundedNetworkObserver.summary(); boundedNetworkObserver.close();
      assert.ok(report.boundedNetworkObserver.networkEnables >= 3, "Page and worker network observation must remain enabled");
      assert.equal(report.boundedNetworkObserver.networkDisabled, false);
      assert.ok(networkRequestsObserved > 0, "Request metadata observation unavailable");
    }
    catch (error) { report.failures.push("Network observer cleanup: " + String(error)); report.status = "failed"; process.exitCode = 1; }
  }
  report.networkObservation = { requestsObserved: networkRequestsObserved, forbiddenRequests, sameOriginGetOnly: forbiddenRequests.length === 0,
    responseBodiesRequestedForPrivacy: false, bodyRetentionLimitsDoNotDisableEvents: Boolean(boundedNetworkObserver) };
  if (forbiddenRequests.length) { report.failures.push("Forbidden network request observed, including on a failed conversion"); report.status = "failed"; process.exitCode = 1; }
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
