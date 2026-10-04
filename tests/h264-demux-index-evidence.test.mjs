import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { readFile } from "node:fs/promises";
import test from "node:test";
import { summarizeH264Allocator } from "../scripts/lib/h264-allocator-summary.mjs";
import { startupConversionOverlap } from "../scripts/lib/h264-stress-profile.mjs";

const read = (file) => readFile(new URL(`../${file}`, import.meta.url));
const sha = (bytes) => createHash("sha256").update(bytes).digest("hex");
const e = JSON.parse(await read("evidence/h264-demux-index-diagnostic-2026-10-04.json"));
const r = e.report.data;
test("index-capped native candidate completes three independently validated long browser jobs without promoting diagnostic scope", () => {
  assert.equal(sha(`${JSON.stringify(r, null, 2)}\n`), e.report.sha256);
  assert.equal(r.status, "passed-instrumented-allocator-diagnostic-only");
  assert.equal(r.publicAcceptance, false);
  assert.equal(r.cpuEnabled, false);
  assert.equal(r.source.bytes, 1050296904);
  assert.equal(r.source.sha256, "031f4cdf9a40bbeacd84c2c1c4640565d37d96e600cdcb31fece6becf2b5ac12");
  assert.equal(r.source.frameTimes.length, 18000);
  assert.equal(r.primaryLimitMiB, 250);
  assert.equal(r.runs.length, 3);
  assert.deepEqual(r.startupOverlap, startupConversionOverlap(r.samples));
  assert.equal(r.startupOverlap.observed, true);
  assert.deepEqual(r.runs.map((s) => s.incrementalPrivateMiB), [219.7421875, 198.1640625, 199.1796875]);
  assert.equal(r.samples.filter((s) => s.privateBytes == null).length, 0);
  for (const run of r.runs) {
    const active = r.samples.filter((s) => [`pre-conversion-${run.run}`, `conversion-${run.run}`].includes(s.phase));
    for (const sample of active) {
      assert.ok(sample.privateBytes > 0);
      assert.ok(sample.processes.every((p) => p.privateBytes > 0));
      assert.equal(sample.privateBytes, sample.processes.reduce((n, p) => n + p.privateBytes, 0));
    }
    const peak = Math.max(...active.map((s) => s.privateBytes));
    assert.equal(run.peakPrivateBytes, peak);
    assert.equal(run.incrementalPrivateMiB, (peak - r.blankBaseline.privateBytes) / 1024 ** 2);
    assert.equal(run.state.jobState, "complete");
    const v = run.independentValidation;
    assert.equal(v.outputBytes, 194031981);
    assert.equal(v.outputSha256, "08b2da23c7c0deba576511af5c5fa77f36aac441607e00a1d03be10817478f7f");
    assert.equal(v.outputProbe.streams[0].codec_name, "h264");
    assert.deepEqual([v.outputProbe.streams[0].width, v.outputProbe.streams[0].height], [1280, 720]);
    assert.equal(v.outputFrameTimes.length, 18000);
    assert.equal(v.maximumFrameTimeErrorSeconds, 0);
    assert.equal(v.ordinalSsim, 0.987764);
    assert.equal(v.fullDecodePassed, true);
    assert.deepEqual(v.audioPacketHashes, r.source.audioPacketHashes);
    assert.ok(run.cleanup.deltaFromLoadedMiB <= 96);
    assert.deepEqual(run.cleanup.opfsRemainingEntries, []);
  }
  const utility = r.utilityActivity.utilities.find((s) => s.utilitySubtype === "on_device_model.mojom.OnDeviceModelService");
  assert.ok(utility.browserAgeAtProcessCreationMs >= 180000);
  assert.equal(utility.peakPrivateBytes, 14467072);
  assert.equal(e.publicAcceptance, false);
});
test("actual bounded index counts and executed native provenance remain distinct from universal demux or uninstrumented acceptance", async () => {
  assert.deepEqual(summarizeH264Allocator(r.allocatorSamples), e.allocator);
  assert.equal(r.allocatorCaptureError, null);
  assert.equal(e.allocator.observedSnapshots, 288);
  assert.equal(e.demuxIndex.maximumObservedEntries, 4005);
  assert.equal(e.demuxIndex.maximumObservedLogicalBytes, 96120);
  assert.ok(e.demuxIndex.maximumObservedLogicalBytes <= 3 * 32768);
  assert.equal(e.demuxIndex.logicalBytesOnlyNotBackingAllocation, true);
  assert.equal(e.demuxIndex.mandatoryFullIndexDemuxersBounded, false);
  assert.deepEqual(e.demuxIndex.steadyStateLiveUsedDeltasByRun.map((s) => s.deltaBytes), [183872, 154248, 157164]);
  for (const { run, snapshots } of e.demuxIndex.steadyStateLiveUsedDeltasByRun) {
    const values = r.allocatorSamples.filter((s) => s.phase === `conversion-${run}`);
    assert.deepEqual(values.map((s) => s.sequence), Array.from({ length: snapshots }, (_, i) => i + 1));
    assert.ok(values.some((s, i) => i && s.demuxIndexEntries < values[i - 1].demuxIndexEntries));
    assert.ok(values.every((s) => s.inputIndexLimitBytes === 32768 && s.demuxIndexLogicalBytes === s.demuxIndexEntries * 24));
  }
  assert.equal(e.build.headSha, "aee6478b041bdca6bb5e5336bfcf649478cdc36c");
  assert.equal(e.build.conclusion, "success");
  assert.equal(r.asBuiltManifest.candidateKernelSha256, "a6283ed5ee3080044ccabf2d79e8009e680bfb0d9aa26420b3359af25cb682a9");
  assert.deepEqual(r.actualWasmMemoryLimits, [{ imported: true, initialPages: 512, maximumPages: 512, shared: true }]);
  for (const [file, expected] of Object.entries(e.currentSources)) assert.equal(sha(await read(file)), expected, file);
  assert.equal(sha(await read(e.priorUncappedDiagnostic.path)), e.priorUncappedDiagnostic.sha256);
  assert.equal(e.cleanup.convertedMediaBytesInWork, 0);
  assert.equal(e.cleanup.ownedBenchmarkChromeProcesses, 0);
  assert.equal(e.cleanup.hostedArtifactsRemaining, 0);
  assert.equal(e.cleanup.staticTools.length, 7);
  assert.equal(e.cleanup.retainedBuildCaches[0].bytes, 294108);
  assert.equal(e.cleanup.retainedBuildCaches[0].deletionPolicyBlocked, true);
  assert.equal(e.cleanup.retainedBuildCaches[0].alternativeDeletionAttempted, false);
  for (const [file, expected] of Object.entries(e.cleanup.distHashes)) assert.equal(sha(await read(`public/engines/remux/${file}`)), expected);
});
