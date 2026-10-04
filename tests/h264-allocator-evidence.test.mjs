import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { readFile } from "node:fs/promises";
import test from "node:test";
import { summarizeH264Allocator } from "../scripts/lib/h264-allocator-summary.mjs";

const read = (file) => readFile(new URL(`../${file}`, import.meta.url));
const sha = (data) => createHash("sha256").update(data).digest("hex");
const evidence = JSON.parse(await read("evidence/h264-allocator-diagnostic-2026-10-04.json"));
test("first native allocator diagnosis retains five actual snapshots and honest failed/incomplete scope", () => {
  const report = evidence.report.data;
  assert.equal(sha(`${JSON.stringify(report, null, 2)}\n`), evidence.report.sha256);
  assert.deepEqual(summarizeH264Allocator(report.allocatorSamples), evidence.allocator);
  assert.equal(report.status, "failed"); assert.equal(report.source.bytes, 1050296904);
  assert.equal(report.runs[0].state.jobState, "error");
  assert.equal(report.runs[0].independentValidation, null);
  assert.equal(report.runs[0].incrementalPrivateMiB, 213.2578125);
  assert.equal(evidence.allocator.observedSnapshots, 5);
  assert.equal(evidence.allocator.liveUsedDeltaBytes, 408980);
  assert.equal(evidence.allocator.individualAllocationSourceProven, false);
  assert.equal(evidence.allocator.failedInstantSnapshotAvailable, false);
  assert.equal(evidence.publicAcceptance, false);
});
test("compiled allocator proof and cleanup are source-bound without modifying public engines", async () => {
  assert.equal(evidence.build.status, "completed"); assert.equal(evidence.build.conclusion, "success");
  assert.equal(evidence.build.headSha, "af4ee8fa010fbf70f8b9da290c2380d7dc0b265d");
  for (const [file, expected] of Object.entries(evidence.currentSources)) assert.equal(sha(await read(file)), expected, file);
  assert.equal(evidence.cleanup.convertedMediaBytesInWork, 0);
  assert.equal(evidence.cleanup.ownedBenchmarkChromeProcesses, 0);
  assert.equal(evidence.cleanup.hostedArtifactsRemaining, 0);
  assert.equal(evidence.cleanup.staticTools.length, 6);
  for (const [file, expected] of Object.entries(evidence.cleanup.distHashes)) assert.equal(sha(await read(`public/engines/remux/${file}`)), expected);
});
