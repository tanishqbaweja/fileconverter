import assert from "node:assert/strict";
import path from "node:path";
import { fileURLToPath } from "node:url";
import test from "node:test";
import { loadArtworkSerializerBenchmark, summarizeArtworkSerializerBenchmarks } from "../scripts/lib/audio-artwork-serializer-benchmark.mjs";
const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");

// Synthetic policy fixture only. This is NOT conversion/performance evidence.
function syntheticReports() {
  return [10, 14, 14, 10].map((edits, index) => ({
    startedAt: new Date(Date.UTC(2026, 9, 25, 1, index)).toISOString(), browserBirth: { pid: index + 1, createdAt: new Date(Date.UTC(2026, 9, 25, 1, index, 1)).toISOString() },
    status: "passed-selected-small-private-cases-not-promotion", publicAcceptance: false, fullMetadataAcceptance: false,
    artworkAcceptance: false, scalingAcceptance: false, headedCoverage: false, nativeConversionUsed: false,
    artifact: { core: { allowedSourceEdits: edits }, manifestSha256: edits === 10 ? "baseline" : "candidate" },
    sources: { "test-only-synthetic": "same" }, browser: { testOnly: true },
    benchmark: { warmupJobs: 1, measuredJobs: 6, warmupExcludedOnlyFromTimingNotCorrectnessOrMemory: true },
    failures: [], network: { forbidden: [] }, protectedOriginalUnchanged: true,
    cleanup: { allRecordedBirthsAbsent: true, publishedAssetsNeverChanged: true, stagedPrivateAssetsRestored: true, ownedProfileFixturesOutputsRemoved: true },
    processCleanup: [{ status: "owned-identity-absent" }], diskProof: { provesThisContextOpfsBacking: true },
    blankBaseline: { privateBytes: 100 * 1048576 }, memory: { limitMiB: 250, unavailableSamples: 0, validSamples: 100,
      incrementalPrivateMiB: 150, peak: { privateBytes: 250 * 1048576, processes: [{ privateBytes: 250 * 1048576 }] } },
    cases: Array.from({ length: 7 }, (_, iteration) => ({
      status: "passed-small-private-fidelity-and-metadata-case", failures: [], benchmarkIteration: iteration, benchmarkWarmup: iteration === 0,
      requestedQuality: "automatic", profileId: "flac-to-opus", source: { bytes: 4231536, sha256: "301d7332823f17f346eea802409d6459199056b59a2d8d17ba8bef6c40f1f919" },
      output: { bytes: 5633796, sha256: "e00860de6c495310697e32ad31a0fa859cd0c082e5b8921088e33c55f9db71f3",
        tags: { status: "passed", fields: Array.from({ length: 25 }, () => ({ status: "preserved" })) } },
      artwork: { bytes: 4194304, sha256: "82018fd4354618bc019a1ca8ab9b4195b56ed477f976f6337b6d7e53cbcaf37f",
        decodedRgbaSha256: "4355f9c1980ad3aaf1f077d06e2b06e4d2c70f3d22143d6ed8e210203c7495ba" },
      repeatedValues: ["CUSTOM_REPEAT=Premier 音楽", "CUSTOM_REPEAT=Deuxième café"],
      fidelity: { samples: 96000, outputSha256: "8386388f4a65fdeac269a12b9cfa6224a4673656dfebfaa21c91c4bbd2e153c2", minimumPsnrDb: 60, psnrDb: 66 },
      fullIndependentDecode: true, disposableOutputRemoved: true,
      engineElapsedMs: iteration === 0 ? 1000 : edits === 10 ? 200 + index : 180,
      browserElapsedMs: iteration === 0 ? 2000 : edits === 10 ? 250 : 230,
      browserState: { error: null, warnings: [], metrics: { maxReadChunkBytes: 262144, maxWriteChunkBytes: 65307,
        peakQueuedBytes: 65307, queuedBytes: 0, pendingOperations: 0, peakPendingOperations: 1, peakWasmMemoryBytes: 33554432,
        elapsedMs: iteration === 0 ? 1000 : edits === 10 ? 200 + index : 180 } },
    })),
  }));
}

test("comparison uses all twelve timed samples per engine in fixed bracket order, validates every warmup, and never implies public/large-file acceptance", () => {
  const result = summarizeArtworkSerializerBenchmarks(syntheticReports());
  assert.equal(result.validatedOutputs, 28); assert.equal(result.measuredJobsPerEngine, 12);
  assert.equal(result.engineTiming.baselineMedianMs, 201.5); assert.equal(result.engineTiming.candidateMedianMs, 180);
  assert.equal(result.browserWallTiming.baselineMedianMs, 250);
  for (const key of ["publicAcceptance", "longFileSpeedVerified", "scalingAcceptance", "fastestClaim", "headedCoverage", "wholeProcessSavingsInferredFromSerializerAllocation"])
    assert.equal(result[key], false);
});

test("changing order, source, browser, quality, output, warmup fidelity, limits, cleanup or primary memory cannot pass the comparison", () => {
  for (const mutate of [r => { r.reverse(); }, r => { r[1].sources.extra = "changed"; }, r => { r[1].browser.testOnly = false; },
    r => { r[1].cases[1].requestedQuality = "higher"; }, r => { r[1].cases[0].fidelity.psnrDb = 59; },
    r => { r[1].cases[1].output.sha256 = "other"; }, r => { r[1].cleanup.ownedProfileFixturesOutputsRemoved = false; },
    r => { r[1].memory.incrementalPrivateMiB = 251; }, r => { r[1].memory.unavailableSamples = 1; },
    r => { r[1].cases.pop(); }, r => { r[1].cases[2].browserState.metrics.peakQueuedBytes = 262145; },
    r => { r[1].cases[0].benchmarkWarmup = false; }, r => { r[1].cases[1].engineElapsedMs = 1; }]) {
    const reports = syntheticReports(); mutate(reports); assert.throws(() => summarizeArtworkSerializerBenchmarks(reports));
  }
});

test("an inconsistent or slower candidate is reported without inventing a speed improvement", () => {
  const reports = syntheticReports();
  for (const row of reports[2].cases) if (!row.benchmarkWarmup) row.engineElapsedMs = row.browserState.metrics.elapsedMs = 300;
  const result = summarizeArtworkSerializerBenchmarks(reports);
  assert.equal(result.conclusion, "no-consistent-end-to-end-engine-speedup-demonstrated-on-this-fixture");
  assert.equal(result.fastestClaim, false);
});

test("actual first repeated baseline remains FAILED at251.59765625MiB despite six exact outputs; no retry/slicing/promotion", async () => {
  const { report } = await loadArtworkSerializerBenchmark(root, "evidence/2026-10-25T04-25-42.002Z-audio-metadata-fidelity-result.json");
  assert.equal(report.status, "failed"); assert.equal(report.cases.length, 6);
  assert.equal(report.memory.incrementalPrivateMiB, 251.59765625); assert.equal(report.memory.validSamples, 510);
  assert.equal(report.memory.unavailableSamples, 1); assert.equal(report.losslessMemoryJournal.records, 511);
  assert.ok(report.cases.every(row => row.status === "passed-small-private-fidelity-and-metadata-case" && row.disposableOutputRemoved));
  assert.ok(report.failures.some(message => message.includes("Whole Chromium250MiB gate failed")));
  assert.throws(() => summarizeArtworkSerializerBenchmarks([report, report, report, report]));
  assert.ok(Object.values(report.cleanup).every(Boolean));
});
