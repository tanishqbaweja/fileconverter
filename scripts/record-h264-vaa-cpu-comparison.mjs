import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { readFile, writeFile, stat } from "node:fs/promises";
import path from "node:path";
import { vaaCpuHotspot } from "./lib/vaa-cpu-hotspot.mjs";
import { summarizeCpuProfile } from "./lib/cpu-profile-summary.mjs";

const root = path.resolve(import.meta.dirname, "..");
const sha = (bytes) => createHash("sha256").update(bytes).digest("hex");
const baselinePath = "evidence/h264-cpu-diagnostic-2026-10-04.json";
const baselineBytes = await readFile(path.join(root, baselinePath)), baseline = JSON.parse(baselineBytes);
const abBytes = await readFile(path.join(root, "evidence/h264-vaa-simd-comparison-2026-10-04.json"));
const ab = JSON.parse(abBytes);
const reportPath = process.argv[2];
assert.match(reportPath, /^outputs\/reports\/\d{4}-\d{2}-\d{2}T[\d-Z]+-private-h264-720p-cpu-diagnostic\.json$/);
assert.ok((await stat(path.join(root, reportPath))).size < 4 * 1024 ** 2);
const reportBytes = await readFile(path.join(root, reportPath)), report = JSON.parse(reportBytes);
assert.equal(report.status, "passed-instrumented-cpu-diagnostic-only");
assert.equal(report.cpuEnabled, true); assert.equal(report.requestedRunCount, 1);
assert.equal(report.publicAcceptance, false); assert.equal(report.runs.length, 1);
assert.equal(report.browserVersion, baseline.report.browserVersion);
assert.equal(report.inputMode, baseline.report.inputMode);
assert.equal(report.source.bytes, 105000218);
assert.equal(report.source.sha256, "938eb61229f60a434cc3fede71829e96c30a1d42a64a468d7efc2c7a43622839");
assert.equal(report.cpuDiagnostic.requestedWindowMs, 15000);
assert.equal(report.cpuDiagnostic.samplingIntervalMicroseconds, 1000);
assert.equal(report.cpuDiagnostic.error, null);
assert.deepEqual(report.asBuiltManifest, ab.reports[1].report.asBuiltManifest, "Same actually built/rejected SIMD module, not a new optimization");
const fields = ["candidateKernelSha256", "currentAvioWrapperSourceSha256", "generatedWrapperSourceSha256", "codecThreads",
  "pthreadPoolSize", "initialWasmMemoryBytes", "maximumWasmMemoryBytes", "allowMemoryGrowth", "encoderFrameSkipping", "normalizesSourceTiming"];
for (const field of fields) {
  assert.notEqual(report.asBuiltManifest[field], undefined);
  assert.deepEqual(report.asBuiltManifest[field], baseline.report.asBuiltManifest[field]);
}
const cpuPath = report.cpuDiagnostic.rawPath;
assert.match(cpuPath, /^outputs\/reports\/\d{4}-\d{2}-\d{2}T[\d-Z]+-private-h264-720p-cpu-diagnostic\.cpuprofile$/);
assert.ok((await stat(path.join(root, cpuPath))).size <= 16 * 1024 ** 2);
const cpuBytes = await readFile(path.join(root, cpuPath)), profile = JSON.parse(cpuBytes);
assert.equal(sha(cpuBytes), report.cpuDiagnostic.rawSha256);
assert.deepEqual(summarizeCpuProfile(profile), report.cpuDiagnostic.summary);
assert.equal(sha(JSON.stringify(baseline.rawCpuProfile.profile)), baseline.rawCpuProfile.sha256);
const run = report.runs[0], validation = run.independentValidation, metrics = run.state.metrics;
assert.equal(run.state.jobState, "complete");
assert.equal(validation.outputSha256, "a77bd1fb023a1a3072966d74f173c0c6010eccea689e67b346e29baca3c3a636");
assert.equal(validation.outputBytes, 19137689);
assert.equal(validation.fullDecodePassed, true);
assert.equal(validation.outputFrameTimes.length, 1800);
assert.ok(validation.outputFrameTimes.every((time, i) => Math.abs(time - report.source.frameTimes[i]) <= 0.001));
assert.deepEqual(validation.audioPacketHashes, report.source.audioPacketHashes);
assert.ok(validation.ordinalSsim >= 0.98);
assert.equal(metrics.peakWasmMemoryBytes, 33554432);
assert.ok(metrics.maxReadChunkBytes <= 262144 && metrics.maxWriteChunkBytes <= 262144 && metrics.peakQueuedBytes <= 262144 && metrics.peakPendingOperations <= 1);
assert.equal(metrics.queuedBytes, 0); assert.equal(metrics.pendingOperations, 0);
assert.ok(report.blankBaseline.stable && report.blankBaseline.sampleCount >= 5);
const samples = report.samples.filter((sample) => ["pre-conversion-1", "conversion-1"].includes(sample.phase) &&
  sample.privateBytes > 0 && Number.isFinite(sample.privateBytes));
assert.ok(samples.length > 2);
assert.equal(Math.max(...samples.map((sample) => sample.privateBytes)), run.peakPrivateBytes);
assert.equal(run.incrementalPrivateMiB, (run.peakPrivateBytes - report.blankBaseline.privateBytes) / 1048576);
assert.ok(run.incrementalPrivateMiB <= 250);
assert.equal(run.cleanup.opfsRemainingEntries.length, 0);
assert.ok(run.cleanup.deltaFromLoadedMiB <= 96);
assert.deepEqual(report.forbiddenRequests, []);
assert.equal(report.cleanup.repositoryLocalFixtureOutputsProfileAndTempRemoved, true);
assert.equal(report.cleanup.generatedDistRestored, true);
const before = vaaCpuHotspot(baseline.rawCpuProfile.profile), after = vaaCpuHotspot(profile);
assert.ok(before.targetSelf.samples > 0 && after.targetSelf.samples > 0);
const sourceHashDifferences = Object.keys(report.sourceHashes).filter((source) => report.sourceHashes[source] !== baseline.report.sourceHashes[source])
  .map((source) => ({ source, scalarExecutedSha256: baseline.report.sourceHashes[source] ?? null, simdExecutedSha256: report.sourceHashes[source] }));
const files = ["scripts/lib/vaa-cpu-hotspot.mjs", "scripts/record-h264-vaa-cpu-comparison.mjs", "scripts/h264-private-memory.mjs",
  "scripts/lib/cdp-cpu-window.mjs", "scripts/lib/cpu-profile-summary.mjs"];
const currentSources = Object.fromEntries(await Promise.all(files.map(async (file) => [file, sha(await readFile(path.join(root, file)))])));
const output = path.join(root, "evidence/h264-vaa-cpu-comparison-2026-10-04.json");
await writeFile(output, `${JSON.stringify({ recordedAt: new Date().toISOString(), requirement: "M-04",
  status: "private-vaa-simd-sampled-attribution-only-not-speed-acceptance",
  publicAcceptance: false, speedGainClaim: null, publicProfilesChanged: false,
  scope: "Historical scalar first-15s sample versus one SIMD first-15s sample; not matched frame work, same-time environment or repeated speed experiment",
  baseline: { path: baselinePath, evidenceSha256: sha(baselineBytes), reportSha256: baseline.rawReportSha256,
    cpuProfileSha256: baseline.rawCpuProfile.sha256, windowMs: baseline.report.cpuDiagnostic.observedWindowMs },
  precedingSpeedTrial: { path: "evidence/h264-vaa-simd-comparison-2026-10-04.json", sha256: sha(abBytes),
    accepted: false, measuredSpeedupFraction: ab.comparison.measuredSpeedupFraction },
  reportPath, reportSha256: sha(reportBytes), report,
  rawCpuProfile: { path: cpuPath, bytes: cpuBytes.length, sha256: sha(cpuBytes), profile },
  comparison: { before, after,
    targetSelfFractionDifferencePercentagePoints: (after.targetSelf.fractionOfSampledWindow - before.targetSelf.fractionOfSampledWindow) * 100,
    targetInclusiveUniqueDifferencePercentagePoints: (after.targetInclusiveUnique.fractionOfSampledWindow - before.targetInclusiveUnique.fractionOfSampledWindow) * 100,
    perFrameCostVerified: false, causalEndToEndSpeedupVerified: false },
  sourceHashDifferences, currentSources,
  sourceInvestigation: [
    { path: "codec/common/src/sad_common.cpp", bytes: 8268, sha256: "82c47be2c051aa92079ac0c731818c4a33612c6dbe61534ada5c0ac5c33667ae",
      url: "https://raw.githubusercontent.com/cisco/openh264/652bdb7719f30b52b08e506645a7322ff1b2cc6f/codec/common/src/sad_common.cpp",
      finding: "Actual SAD8x8 scalar body has independent strides and eight exact-byte reads per row; SAD16x16 sums four SAD8x8 blocks. These definitions, not sample.cpp call sites, are the next exact-result primitive target." },
    { path: "codec/common/inc/sad_common.h", bytes: 7078, sha256: "5ac0d869df6d808d216e39d1d761381d457521027b4df8d33d98791dd038b891",
      url: "https://raw.githubusercontent.com/cisco/openh264/652bdb7719f30b52b08e506645a7322ff1b2cc6f/codec/common/inc/sad_common.h" },
    { path: "codec/encoder/core/src/sample.cpp", bytes: 24258, sha256: "13b93c0c7e4430a916f383df73b6450daf6511965f0e46e336ddf61e40ed514e",
      url: "https://raw.githubusercontent.com/cisco/openh264/652bdb7719f30b52b08e506645a7322ff1b2cc6f/codec/encoder/core/src/sample.cpp",
      finding: "Actual SATD4x4 body and SAD/SATD function-pointer initialization; SAD16x16 occurrences here are calls/selection, not its definition." },
  ],
  conclusion: "VAA target has a lower sampled share, but unchanged SIMD remains rejected by real speed A/B. Aggregation by function name across all call-site nodes reveals remaining SAD/SATD hotspots. Do not infer equal-work or end-to-end gain from window percentages.",
  nextInvestigation: "Prove exact-result SAD8x8/16x16 SIMD against pinned sad_common.cpp and measure bounded warm primitive cost before another full native build. Keep all quality/timing settings and require a new production-browser identical-input A/B before acceptance.",
  cleanup: report.cleanup,
}, null, 2)}\n`, { flag: "wx" });
process.stdout.write(`${output}\nVAA sampled self share ${(before.targetSelf.fractionOfSampledWindow * 100).toFixed(3)}% -> ${(after.targetSelf.fractionOfSampledWindow * 100).toFixed(3)}%; not per-frame or end-to-end speed acceptance\n`);
