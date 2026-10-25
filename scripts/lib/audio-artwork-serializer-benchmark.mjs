// Report-only comparison. Never launches a converter or changes a threshold.
import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { readFile } from "node:fs/promises";
import path from "node:path";
import { gunzipSync } from "node:zlib";
const sha = bytes => createHash("sha256").update(bytes).digest("hex");
const outputSha = "e00860de6c495310697e32ad31a0fa859cd0c082e5b8921088e33c55f9db71f3";
const imageSha = "82018fd4354618bc019a1ca8ab9b4195b56ed477f976f6337b6d7e53cbcaf37f";
const pixelSha = "4355f9c1980ad3aaf1f077d06e2b06e4d2c70f3d22143d6ed8e210203c7495ba";
const pcmSha = "8386388f4a65fdeac269a12b9cfa6224a4673656dfebfaa21c91c4bbd2e153c2";
const median = values => { const sorted = values.toSorted((a, b) => a - b), n = sorted.length; assert.ok(n > 0); return n % 2 ? sorted[n >> 1] : (sorted[n / 2 - 1] + sorted[n / 2]) / 2; };

export function summarizeArtworkSerializerBenchmarks(reports) {
  assert.equal(reports.length, 4, "Require the predeclared A/B/B/A bracket, never select the fastest runs");
  const expectedEdits = [10, 14, 14, 10], summaries = [], engineTimes = [[], []], wallTimes = [[], []];
  const births = new Set(); let previousAt = -Infinity;
  for (const [index, report] of reports.entries()) {
    const at = Date.parse(report.startedAt); assert.ok(Number.isFinite(at) && at > previousAt, "Keep actual execution chronology"); previousAt = at;
    assert.ok(Number.isInteger(report.browserBirth.pid) && Number.isFinite(Date.parse(report.browserBirth.createdAt)));
    const birth = report.browserBirth.pid + ":" + report.browserBirth.createdAt;
    assert.ok(!births.has(birth), "Each bracket position must use its separately measured clean browser instance"); births.add(birth);
    const engine = expectedEdits[index] === 10 ? 0 : 1;
    assert.equal(report.status, "passed-selected-small-private-cases-not-promotion");
    for (const key of ["publicAcceptance", "fullMetadataAcceptance", "artworkAcceptance", "scalingAcceptance", "headedCoverage", "nativeConversionUsed"])
      assert.equal(report[key], false);
    assert.equal(report.artifact.core.allowedSourceEdits, expectedEdits[index]);
    assert.deepEqual(report.sources, reports[0].sources, "All production/harness source pins must be identical across the comparison");
    assert.deepEqual(report.browser, reports[0].browser, "Same installed browser binary/version/birth identity pins");
    assert.equal(report.benchmark.warmupJobs, 1); assert.equal(report.benchmark.measuredJobs, 6);
    assert.deepEqual(report.benchmark, reports[0].benchmark, "Validation backend and timing instrumentation must also match");
    assert.ok(["bounded-CDP-export-copy", "unique-byte-bound-physical-OPFS-no-output-copy"].includes(report.benchmark.validationBackend));
    assert.equal(report.benchmark.warmupExcludedOnlyFromTimingNotCorrectnessOrMemory, true);
    assert.equal(report.cases.length, 7); assert.deepEqual(report.failures, []); assert.deepEqual(report.network.forbidden, []);
    assert.equal(report.protectedOriginalUnchanged, true); assert.ok(Object.values(report.cleanup).every(value => value === true));
    for (const key of ["allRecordedBirthsAbsent", "publishedAssetsNeverChanged", "stagedPrivateAssetsRestored", "ownedProfileFixturesOutputsRemoved"])
      assert.equal(report.cleanup[key], true);
    assert.ok(report.processCleanup.length > 0 && report.processCleanup.every(row => row.status === "owned-identity-absent"));
    assert.equal(report.diskProof.provesThisContextOpfsBacking, true);
    const memory = report.memory; assert.equal(memory.limitMiB, 250); assert.equal(memory.unavailableSamples, 0);
    assert.ok(memory.validSamples > 0); assert.ok(memory.incrementalPrivateMiB <= 250);
    assert.equal(memory.peak.privateBytes, memory.peak.processes.reduce((total, row) => total + row.privateBytes, 0));
    assert.equal(memory.incrementalPrivateMiB, (memory.peak.privateBytes - report.blankBaseline.privateBytes) / 1048576);
    const times = [], wall = [];
    for (const [iteration, row] of report.cases.entries()) {
      assert.equal(row.status, "passed-small-private-fidelity-and-metadata-case"); assert.deepEqual(row.failures, []);
      assert.equal(row.benchmarkIteration, iteration); assert.equal(row.benchmarkWarmup, iteration === 0);
      assert.equal(row.requestedQuality, "automatic"); assert.equal(row.profileId, "flac-to-opus");
      assert.equal(row.source.sha256, "301d7332823f17f346eea802409d6459199056b59a2d8d17ba8bef6c40f1f919");
      assert.equal(row.source.bytes, 4231536); assert.equal(row.output.bytes, 5633796); assert.equal(row.output.sha256, outputSha);
      assert.equal(row.artwork.sha256, imageSha); assert.equal(row.artwork.bytes, 4194304); assert.equal(row.artwork.decodedRgbaSha256, pixelSha);
      assert.equal(row.output.tags.status, "passed"); assert.equal(row.output.tags.fields.filter(field => field.status === "preserved").length, 25);
      assert.deepEqual(row.repeatedValues, ["CUSTOM_REPEAT=Premier 音楽", "CUSTOM_REPEAT=Deuxième café"]);
      assert.equal(row.fidelity.samples, 96000); assert.equal(row.fidelity.outputSha256, pcmSha); assert.equal(row.fidelity.minimumPsnrDb, 60);
      assert.ok(row.fidelity.psnrDb >= 60); assert.equal(row.fullIndependentDecode, true); assert.equal(row.disposableOutputRemoved, true);
      assert.equal(row.browserState.error, null); assert.deepEqual(row.browserState.warnings, []);
      if (report.benchmark.validationBackend === "unique-byte-bound-physical-OPFS-no-output-copy") {
        const proof = row.physicalValidation; assert.ok(proof);
        assert.equal(proof.uniqueLogicalEntry, true); assert.equal(proof.uniquePhysicalMatch, true);
        assert.equal(proof.convertedCopyCreated, false); assert.equal(proof.nativeConversionUsed, false);
        assert.equal(proof.logicalBytes, row.output.bytes); assert.equal(proof.maximumBrowserSampleBytes, 4096);
        assert.equal(proof.totalBrowserSampleBytes, 12288); assert.equal(proof.samples.length, 3);
      }
      const metrics = row.browserState.metrics;
      for (const key of ["maxReadChunkBytes", "maxWriteChunkBytes", "peakQueuedBytes"]) assert.ok(metrics[key] > 0 && metrics[key] <= 262144);
      assert.equal(metrics.queuedBytes, 0); assert.equal(metrics.pendingOperations, 0); assert.equal(metrics.peakPendingOperations, 1);
      assert.equal(metrics.peakWasmMemoryBytes, 33554432);
      assert.ok(Number.isFinite(row.engineElapsedMs) && row.engineElapsedMs > 0); assert.equal(row.engineElapsedMs, metrics.elapsedMs);
      assert.ok(Number.isFinite(row.browserElapsedMs) && row.browserElapsedMs > 0);
      if (!row.benchmarkWarmup) { times.push(row.engineElapsedMs); wall.push(row.browserElapsedMs); }
    }
    engineTimes[engine].push(...times); wallTimes[engine].push(...wall);
    summaries.push({ position: index, engine: engine ? "lower-copy" : "baseline", measuredJobs: times.length,
      engineMedianMs: median(times), browserWallMedianMs: median(wall), incrementalPrivateMiB: memory.incrementalPrivateMiB,
      validMemorySamples: memory.validSamples, manifestSha256: report.artifact.manifestSha256 });
  }
  assert.equal(summaries[0].manifestSha256, summaries[3].manifestSha256); assert.equal(summaries[1].manifestSha256, summaries[2].manifestSha256);
  assert.notEqual(summaries[0].manifestSha256, summaries[1].manifestSha256);
  const baselineMs = median(engineTimes[0]), candidateMs = median(engineTimes[1]);
  const wallBaselineMs = median(wallTimes[0]), wallCandidateMs = median(wallTimes[1]);
  const bracketSpeedups = [summaries[0].engineMedianMs / summaries[1].engineMedianMs, summaries[3].engineMedianMs / summaries[2].engineMedianMs];
  return { status: "compared-four-qualified-small-browser-runs-not-promotion", order: "A/B/B/A", runs: summaries,
    measuredJobsPerEngine: 12, warmupsPerEngine: 2, validatedOutputs: 28,
    engineTiming: { baselineMedianMs: baselineMs, candidateMedianMs: candidateMs, observedMedianSpeedup: baselineMs / candidateMs, bracketMedianSpeedups: bracketSpeedups },
    browserWallTiming: { baselineMedianMs: wallBaselineMs, candidateMedianMs: wallCandidateMs, observedMedianSpeedup: wallBaselineMs / wallCandidateMs },
    conclusion: bracketSpeedups.every(value => value > 1) && baselineMs > candidateMs
      ? "lower-observed-engine-medians-in-both-brackets-on-this-small-max-cover-fixture-only"
      : "no-consistent-end-to-end-engine-speedup-demonstrated-on-this-fixture",
    equalInputsSettingsSourcesAndBrowser: true, allOutputsExactControl: true,
    publicAcceptance: false, longFileSpeedVerified: false, scalingAcceptance: false, fastestClaim: false, headedCoverage: false,
    wholeProcessSavingsInferredFromSerializerAllocation: false };
}

export async function loadArtworkSerializerBenchmark(root, receiptPath) {
  const receiptFile = path.resolve(root, receiptPath);
  assert.equal(path.dirname(receiptFile), path.join(root, "evidence"));
  const receiptBytes = await readFile(receiptFile); assert.ok(receiptBytes.length < 1048576);
  const receipt = JSON.parse(receiptBytes);
  assert.match(receipt.archive.path, /^outputs\/reports\/[\w.-]+-audio-metadata-production-runtime\.json\.gz$/);
  const archive = await readFile(path.join(root, receipt.archive.path));
  assert.equal(archive.length, receipt.archive.bytes); assert.equal(sha(archive), receipt.archive.sha256);
  const raw = gunzipSync(archive, { maxOutputLength: 1048576 });
  assert.equal(raw.length, receipt.archive.restoredBytes); assert.equal(sha(raw), receipt.archive.restoredSha256);
  const report = JSON.parse(raw); assert.equal(report.status, receipt.status); assert.deepEqual(report.memory, receipt.memory);
  assert.match(receipt.losslessJournal.file, /^output\/playwright\/[\w.-]+-audio-fidelity-memory\.ndjson\.gz$/);
  const journal = await readFile(path.join(root, receipt.losslessJournal.file)); assert.equal(sha(journal), receipt.losslessJournal.archiveSha256);
  const unpacked = gunzipSync(journal, { maxOutputLength: 8 * 1048576 }); assert.equal(sha(unpacked), receipt.losslessJournal.sha256);
  const samples = unpacked.toString().trim().split("\n").map(line => JSON.parse(line).sample);
  assert.equal(samples.length, receipt.losslessJournal.records);
  const valid = samples.filter(sample => sample.sampleError === null && Number.isFinite(sample.privateBytes));
  assert.equal(valid.length, receipt.memory.validSamples); assert.equal(samples.length - valid.length, receipt.memory.unavailableSamples);
  assert.equal(receipt.losslessJournal.complete, true);
  for (const [index, sample] of samples.entries()) {
    assert.equal(sample.sequence, index + 1);
    if (sample.sampleError !== null) assert.equal(sample.privateBytes, null, "Unavailable OS samples must never become zero");
    else assert.equal(sample.privateBytes, sample.processes.reduce((total, row) => total + row.privateBytes, 0));
  }
  assert.equal(Math.max(...valid.filter(sample => sample.phase !== "blank").map(sample => sample.privateBytes)), report.memory.peak.privateBytes);
  for (const screenshot of report.screenshots) {
    assert.match(screenshot.path, /^output\/playwright\/[\w.-]+-audio-fidelity\/case-[0-9]+-terminal\.png$/);
    assert.equal(sha(await readFile(path.join(root, screenshot.path))), screenshot.sha256); assert.equal(screenshot.headedCoverage, false);
  }
  return { report, evidence: { receipt: path.relative(root, receiptFile).replaceAll(path.sep, "/"), receiptSha256: sha(receiptBytes),
    archive: receipt.archive, losslessJournal: receipt.losslessJournal } };
}
