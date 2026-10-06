// Compact actual build/static/browser/progress evidence. No media conversion.
import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { access, readFile, stat, writeFile } from "node:fs/promises";
import path from "node:path";
const root = path.resolve(import.meta.dirname, ".."), sha = bytes => createHash("sha256").update(bytes).digest("hex");
const progressName = process.argv[2];
assert.match(progressName ?? "", /^[0-9T-]+Z-private-mpeg2-aligned-progress-native-100ms\.json$/);
const ref = async file => {
  const bytes = await readFile(path.join(root, file)); assert.ok(bytes.length <= 32 * 1024 * 1024);
  return { path: file, bytes: bytes.length, sha256: sha(bytes) };
};
const load = async file => ({ reference: await ref(file), data: JSON.parse(await readFile(path.join(root, file))) });
const build = await load("evidence/mpeg2-aligned-build-37479749443.json");
const small = await load("output/playwright/2026-10-06T14-44-33.051Z-mpeg2-split-pipeline-37479749443-direct-artwork.json");
const rejected = await load("output/playwright/2026-10-06T14-42-43-502Z-mpeg2-aligned-link.json");
const staticProof = await load("output/playwright/2026-10-06T14-43-32-572Z-mpeg2-aligned-link.json");
const oldLayout = await load("evidence/split-dlmalloc-static-layout-2026-10-06.json");
const oldRaw = await load(oldLayout.data.report.path);
assert.equal(oldRaw.reference.sha256, oldLayout.data.report.sha256);
const progress = await load(`outputs/reports/${progressName}`), run = progress.data.runs[0];
assert.equal(build.data.run.conclusion, "success");
assert.equal(build.data.run.headSha, "decd483b394ea132e22b9c75148a472c966c3441");
assert.equal(staticProof.data.failure, null); assert.equal(staticProof.data.cleanup.runtimeRemoved, true);
assert.equal(staticProof.data.inspection.binary.sha256, build.data.retained["within-mpeg2-split.wasm"].sha256);
assert.equal(staticProof.data.inspection.avMallocWrapperCallVerified, true);
assert.equal(staticProof.data.inspection.plainMallocCallVerified, true);
const before = oldRaw.data.inspection.selectedFunctions.av_malloc.text;
const after = staticProof.data.inspection.functions.av_malloc.text;
assert.equal(before.replaceAll("dlposix_memalign", "__wrap_posix_memalign"), after,
  "Every compiled FFmpeg admission/zero-size/return instruction unchanged apart from call target");
const successful = small.data.rows.filter(row => row.status === "passed" && row.outputCodec === "mpeg2video");
assert.equal(successful.length, 3);
for (const row of successful) {
  assert.equal(row.outputSha256, row.sourceCodec === "mpeg4"
    ? "d366abbe466cbd7a70ae7353efda456471c9b064402996a58fa1d2dd7589bf94"
    : "6c0575388593dd8e789e8e7d5d8c188620e16d6957c768585e9abc5694b4fc32");
  assert.ok(row.ssim >= 0.98); assert.equal(row.metrics.wasmMemoryBytes, 50331648);
  assert.equal(row.metrics.pendingOperations, 0); assert.equal(row.metrics.queuedBytes, 0);
}
for (const kind of ["direct-write-failure", "cancel-after-direct-output"])
  assert.equal(small.data.rows.find(row => row.kind === kind)?.status, "passed");
assert.equal(progress.data.diagnosticOnly, true); assert.equal(progress.data.publicAcceptance, false);
assert.equal(progress.data.requestedRuns, 1); assert.equal(progress.data.runs.length, 1);
assert.equal(progress.data.source.bytes, 2958573265);
assert.equal(progress.data.source.sha256, "31f36695b5b44c62125a9e4264e84dc085accd21c02cc3487aae597f54b9db34");
assert.equal(progress.data.cleanup.protectedFixtureUnchanged, true);
for (const key of ["mediaProfileRuntimeRemoved", "generatedDistRestored", "observerStopped", "sampledChromeRootStopped"])
  assert.equal(progress.data.cleanup[key], true, key);
for (const data of [rejected.data, staticProof.data]) await assert.rejects(access(data.runtimeDirectory), { code: "ENOENT" });
await assert.rejects(access(progress.data.runtimeDirectory), { code: "ENOENT" });
const sourcePins = {};
for (const file of ["scripts/freeze-mpeg2-aligned-candidate.mjs", "scripts/audit-mpeg2-aligned-link.mjs",
  "scripts/download-mpeg2-aligned-candidate.mjs", "tests/browser/mpeg2-split-direct-candidate.spec.ts",
  "scripts/validate-mpeg2-split-direct.mjs", ...Object.keys(progress.data.sourceHashes)])
  sourcePins[file] = (await ref(file)).sha256;
for (const [file, digest] of Object.entries(progress.data.sourceHashes)) assert.equal(sourcePins[file], digest, file);
assert.equal(sourcePins["scripts/audit-mpeg2-aligned-link.mjs"], staticProof.data.sourceSha256);
const evidence = {
  recordedAt: new Date().toISOString(), scope: "Private alignment candidate build, call-target/admission proof, exact browser goldens and ONE protected-source progress probe",
  publicAcceptance: false, completedOriginalConversion: false, completeChromiumMemoryAcceptance: false,
  speedupClaimed: false, qualityOrHeapLimitsRelaxed: false,
  build: { reference: build.reference, runId: build.data.run.databaseId, head: build.data.run.headSha,
    decoder: build.data.retained["within-mpeg2-split.wasm"], nativeSyntheticContract: build.data.manifest.alignedReuse.standaloneSyntheticContract,
    aggregateWasmMemoryBytes: 50331648, companionEncoderUnchanged: true,
    hostedCleanup: build.data.run.jobs[0].steps.find(step => step.name === "Remove repository-local build data") },
  static: { reference: staticProof.reference, baseline: oldRaw.reference,
    avMallocInstructionsUnchangedApartFromCallTarget: true,
    plainMallocCallVerified: true, upstreamFallbackVerified: false,
    optimizedFallback: "No separately named dlposix_memalign; actual wrapper body retains inline alignment allocation/reservation/splitting path. Full formal fallback equivalence is not claimed.",
    analysisSlice: staticProof.data.inspection.analysisOnlySlice,
    rejectedSeparateFunctionAssumption: { reference: rejected.reference, failure: rejected.data.failure, cleanup: rejected.data.cleanup } },
  browserGoldens: { reference: small.reference, passedTests: 5,
    conversions: successful.map(row => ({ sourceCodec: row.sourceCodec, destination: row.destination,
      frames: Number(row.frames), bytes: row.outputBytes, sha256: row.outputSha256, ssim: row.ssim, metrics: row.metrics })),
    exactBaselineOutputHashes: true, metadataAudioArtworkAndTimelineGatesUnchanged: true,
    writeFailureAndCancellationPassed: true, observedAfterEachOpfsEntries: small.data.rows.filter(row => "cleanupRemovedEntries" in row).map(row => row.cleanupRemovedEntries) },
  progress: { reference: progress.reference, status: progress.data.status, failure: progress.data.failure,
    requestedRuns: 1, browserVersion: progress.data.browserVersion, source: progress.data.source,
    blankBaseline: progress.data.blankBaseline, loadedIdle: progress.data.loadedIdle,
    state: run?.state ?? null, incrementalPrivateMiBIncomplete: run?.incrementalPrivateMiB ?? null,
    peakPrivateBytes: run?.peakPrivateBytes ?? null, nativePeaks: run?.nativePeaks ?? null,
    splitFinalSamples: progress.data.splitFinalSamples, nativeStackSamples: progress.data.nativeStackSamples,
    cleanup: progress.data.cleanup, ownedPids: progress.data.ownedPids, runtimeDirectory: progress.data.runtimeDirectory,
    completedOriginalOutputValidation: false },
  cleanup: { disassemblerCachesAndDriverRuntimesRemoved: true, partialOutputsRemovedWithOwnedProfile: true,
    originalHashVerifiedBeforeAndAfter: true, reusableSmallToolSlotRetained: build.data.localToolDirectory },
  sourcePins,
};
const output = path.join(root, "evidence/mpeg2-aligned-reuse-2026-10-06.json");
const json = JSON.stringify(evidence, null, 2) + "\n"; assert.ok(Buffer.byteLength(json) <= 96 * 1024);
await writeFile(output, json, { flag: "wx" }); console.log(`${output} (${(await stat(output)).size}bytes). NOT completed conversion acceptance.`);
