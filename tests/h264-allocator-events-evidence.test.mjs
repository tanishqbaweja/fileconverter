import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { readFile } from "node:fs/promises";
import test from "node:test";
import { summarizeH264Allocator } from "../scripts/lib/h264-allocator-summary.mjs";

const read = (file) => readFile(new URL(`../${file}`, import.meta.url));
const sha = (data) => createHash("sha256").update(data).digest("hex");
const evidence = JSON.parse(await read("evidence/h264-allocator-events-2026-10-04.json"));
test("native console events retain all 29 ordered snapshots without confusing startup allocations with steady growth", () => {
  const report = evidence.report.data;
  assert.equal(sha(`${JSON.stringify(report, null, 2)}\n`), evidence.report.sha256);
  assert.deepEqual(summarizeH264Allocator(report.allocatorSamples), evidence.allocator);
  assert.equal(report.allocatorCaptureMode, "console-event");
  assert.equal(report.allocatorCaptureError, null);
  assert.deepEqual(report.allocatorSamples.map((s) => s.sequence), Array.from({ length: 29 }, (_, i) => i + 1));
  const second = report.allocatorSamples[1], last = report.allocatorSamples.at(-1);
  assert.equal((last.dynamicHeapBytes - last.freeDynamicBytes) - (second.dynamicHeapBytes - second.freeDynamicBytes), 468712);
  assert.equal(evidence.allocator.liveUsedDeltaBytes, 13340620);
  assert.equal(evidence.allocator.individualAllocationSourceProven, false);
  assert.equal(evidence.allocator.failedInstantSnapshotAvailable, false);
  assert.equal(report.status, "failed");
  assert.equal(report.source.bytes, 1050296904);
  assert.equal(report.runs.length, 1);
  assert.equal(report.runs[0].state.jobState, "error");
  assert.equal(report.runs[0].independentValidation, null);
  assert.equal(report.runs[0].incrementalPrivateMiB, 225.7578125);
  assert.equal(report.runs[0].state.metrics.outputBytes, 58188932);
  assert.equal(evidence.publicAcceptance, false);
});
test("event diagnostic preserves executed source/build hashes, exact public engines and finally cleanup", async () => {
  assert.equal(evidence.build.status, "completed");
  assert.equal(evidence.build.conclusion, "success");
  assert.equal(evidence.build.headSha, "af4ee8fa010fbf70f8b9da290c2380d7dc0b265d");
  assert.equal(evidence.report.data.asBuiltManifest.candidateKernelSha256,
    "6021062d1fcb1434b44840346e66402b178aa439165c4fef197bd6bcb645587b");
  for (const [file, expected] of Object.entries(evidence.currentSources)) assert.equal(sha(await read(file)), expected, file);
  assert.equal(evidence.cleanup.convertedMediaBytesInWork, 0);
  assert.equal(evidence.cleanup.ownedBenchmarkChromeProcesses, 0);
  assert.equal(evidence.cleanup.hostedArtifactsRemaining, 0);
  assert.equal(evidence.cleanup.staticTools.length, 6);
  for (const [file, expected] of Object.entries(evidence.cleanup.distHashes)) assert.equal(sha(await read(`public/engines/remux/${file}`)), expected);
});
