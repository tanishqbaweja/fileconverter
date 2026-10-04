import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { readFile } from "node:fs/promises";
import test from "node:test";
import { summarizeH264StartupFailure } from "../scripts/lib/h264-startup-failure.mjs";

const read = (file) => readFile(new URL(`../${file}`, import.meta.url));
const sha = (bytes) => createHash("sha256").update(bytes).digest("hex");
const evidence = JSON.parse(await read("evidence/h264-startup-scaling-failure-2026-10-04.json"));

test("long genuine H264 failure remains a failed incomplete conversion despite a sub-250 observed peak", () => {
  const report = evidence.report.data;
  assert.equal(sha(`${JSON.stringify(report, null, 2)}\n`), evidence.report.sha256);
  assert.deepEqual(summarizeH264StartupFailure(report), evidence.summary);
  assert.equal(evidence.summary.sourceBytes, 1050296904);
  assert.equal(evidence.summary.observedIncrementalPrivateMiB, 217.6015625);
  assert.equal(evidence.summary.completedConversions, 0);
  assert.equal(evidence.summary.memoryAcceptance, false);
  assert.equal(evidence.summary.startupUtilityWindowReached, false);
  assert.equal(evidence.summary.underlyingRetainedAllocationOrFragmentationCauseProven, false);
  assert.equal(evidence.publicAcceptance, false);
  assert.equal(evidence.failureTrace.bytes, 15795);
});

test("failure summary rejects partial-output success, fabricated memory totals and falsely completed startup overlap", () => {
  for (const alter of [
    (r) => { r.status = "passed-private-startup-scaling-gate"; },
    (r) => { r.runs[0].state.jobState = "complete"; },
    (r) => { r.runs[0].incrementalPrivateMiB = 0; },
    (r) => { r.samples.find((s) => s.phase === "conversion-1").processes[0].privateBytes = 0; },
    (r) => { r.startupOverlap.observed = true; },
    (r) => { r.cleanup.repositoryLocalFixtureOutputsProfileAndTempRemoved = false; },
  ]) {
    const report = structuredClone(evidence.report.data); alter(report);
    assert.throws(() => summarizeH264StartupFailure(report));
  }
});

test("failure evidence keeps executed sources, bounded cleanup and unchanged public engines auditable", async () => {
  for (const [file, expected] of Object.entries(evidence.currentSources)) assert.equal(sha(await read(file)), expected, file);
  assert.equal(evidence.cleanup.convertedMediaBytesInWork, 0);
  assert.equal(evidence.cleanup.ownedBenchmarkChromeProcesses, 0);
  assert.equal(evidence.cleanup.staticTools.length, 5);
  assert.equal(evidence.cleanup.retainedStaticToolBytes, 42206230);
  for (const [file, expected] of Object.entries(evidence.cleanup.distHashes)) assert.equal(sha(await read(`public/engines/remux/${file}`)), expected);
  assert.ok(evidence.investigation.actualGeneratedAsyncifyAllocatesAndFreesEachSuspendStack);
  assert.match(evidence.investigation.nextAction, /allocator/);
});
