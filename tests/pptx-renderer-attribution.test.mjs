import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { readFile } from "node:fs/promises";
import { test } from "node:test";
import { gunzipSync } from "node:zlib";
import { matchPageRenderer } from "../scripts/lib/pptx-renderer-attribution.mjs";
import { prePptxMetricWorker } from "../scripts/lib/reviewed-pptx-destination-metrics.mjs";

function fixture() {
  const mark = "within-pptx-renderer-active";
  const row = { pid: 42, parentPid: 9, creationFileTime: "134385344138865344", privateBytes: 10000, rssBytes: 12000 };
  return {
    mark,
    trace: { traceEvents: [{ cat: "blink.user_timing", name: mark, pid: 42, tid: 88, ts: 10 }] },
    before: { processes: [row] },
    after: { processes: [{ ...row, privateBytes: 18000 }] },
    dump: {
      traceIntervalMicroseconds: [11, 19],
      processes: [{ pid: 42, traceName: "Renderer", tracePrivateFootprintBytes: 16000,
        liveAllocatorCounters: { blink_gc: { size: 3000 }, v8: { allocated_objects_size: 2500 } } }],
    },
  };
}

test("an exact page mark joins one dump to the same native birth, not to allocator totals", () => {
  const result = matchPageRenderer(fixture());
  assert.equal(result.available, true);
  assert.equal(result.birth, "134385344138865344");
  assert.equal(result.privateBefore, 10000);
  assert.equal(result.privateAfter, 18000);
  assert.equal(result.tracePrivateFootprintBytes, 16000);
  assert.equal(result.allocators.blink_gc.size, 3000);
  assert.equal(result.allocators.skia, null);
  assert.equal(result.overlappingAllocatorValues, true);
});

for (const [name, alter] of [
  ["duplicate mark", v => v.trace.traceEvents.push(v.trace.traceEvents[0])],
  ["wrong trace category", v => { v.trace.traceEvents[0].cat = "devtools.timeline"; }],
  ["mark later than dump", v => { v.trace.traceEvents[0].ts = 12; }],
  ["missing PID", v => { v.after.processes = []; }],
  ["reused PID", v => { v.after.processes[0].creationFileTime = "134385344138865345"; }],
  ["changed parent", v => { v.after.processes[0].parentPid = 17; }],
  ["missing dump renderer", v => { v.dump.processes = []; }],
]) test(`renderer attribution is unavailable for ${name}`, () => {
  const value = fixture();
  alter(value);
  const result = matchPageRenderer(value);
  assert.equal(result.available, false);
  assert.equal(result.privateBefore, undefined);
});

test("the exact reporting hunk can be reversed for historical receipts, but unrelated edits are rejected", async () => {
  const live = await readFile("workers/conversion.worker.ts");
  const prior = prePptxMetricWorker(live);
  assert.notDeepEqual(live, prior);
  assert.match(live.toString(), /metrics\.activeWorkerCount = 1 \+ \(presentationDestination\.additionalWorkerCount \?\? 0\)/);
  assert.match(live.toString(), /\(presentationDestination\.sharedBufferBytes \?\? 0\)/);
  assert.deepEqual(prePptxMetricWorker(prior), prior);
  assert.throws(() => prePptxMetricWorker(Buffer.concat([live, Buffer.from("\n")])));
});

const exactOutput = "2c32bb680e8ce5d7917ba180829a39b8b9431fc0b460ad5e62776db4bb51bff5";
const sha = bytes => createHash("sha256").update(bytes).digest("hex");
const readEvidence = file => readFile(new URL("../" + file, import.meta.url));
for (const [name, peak, cleanup, expectedWorkers, expectedSharedBytes] of [
  ["2026-11-07T14-25-05-809Z-pptx-published-renderer", 208.53125, 120.03125, 1, 0],
  ["2026-11-07T14-30-48-876Z-pptx-published-handle", 239.07421875, 145.0703125, 1, 0],
  ["2026-11-07T14-34-23-732Z-pptx-handle-metrics", 191.37109375, 90.94921875, 2, 266272],
]) test(`retained ${name} proves its scoped result without converting a diagnostic into acceptance`, async () => {
  const report = JSON.parse(await readEvidence(`evidence/${name}.json`));
  assert.equal(report.diagnosticOnly, true);
  assert.match(report.status, /not-acceptance$/);
  assert.equal(report.browserServicesDisabled, false);
  assert.equal(report.headed, false);
  assert.deepEqual(report.forbiddenRequests, []);
  assert.deepEqual(report.protectedOriginalBefore, report.protectedOriginalAfter);
  assert.equal(report.ownedRuntimeRemoved, true);
  const row = report.cases[0];
  assert.equal(row.validation.bytes, 92391679);
  assert.equal(row.validation.sha256, exactOutput);
  assert.equal(row.metrics.inputBytes, 135296355);
  assert.equal(row.metrics.activeWorkerCount, expectedWorkers);
  assert.equal(row.metrics.sharedArrayBufferBytes, expectedSharedBytes);
  assert.equal(row.cleanupGatePassed, cleanup <= 96);
  assert.equal(row.memory.cleanupDeltaFromLoadedMiB, cleanup);
  assert.equal(report.memory.incrementalPrivateMiB, peak);
  assert.equal((report.memory.peak.privateBytes - report.blankBaseline.privateBytes) / 1048576, peak);
  const phases = report.rendererDiagnostic.rows;
  assert.deepEqual(phases.map(phase => phase.phase), ["loaded", "selected", "active", "complete", "cleanup-first", "removed"]);
  assert.ok(phases.every(phase => phase.renderer.available));
  assert.equal(new Set(phases.map(phase => phase.renderer.pid + ":" + phase.renderer.birth)).size, 1);
  assert.equal(phases[2].stateAtMark.job, "running");
  const packed = await readEvidence(report.nativeArchive.path);
  assert.equal(sha(packed), report.nativeArchive.sha256);
  const raw = gunzipSync(packed, { maxOutputLength: 4 * 1024 * 1024 });
  assert.equal(sha(raw), report.nativeArchive.decodedSha256);
  const peakRow = JSON.parse(raw).find(sample => sample.sequence === report.memory.peak.sequence);
  assert.equal(peakRow.processes.reduce((total, proc) => total + proc.privateBytes, 0), peakRow.privateBytes);
  assert.equal(peakRow.privateBytes, report.memory.peak.privateBytes);
  if (expectedWorkers === 2) assert.equal(row.destination.reportingVerified, true);
});
