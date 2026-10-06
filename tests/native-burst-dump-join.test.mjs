import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";
import { joinNativeBurstDumps } from "../scripts/lib/native-burst-dump-join.mjs";
const process = { pid: 2, parentPid: 1, createdAt: "2026-10-07T00:00:00.000Z",
  creationFileTime: "134040000010000000", privateBytes: 90 };
const event = { after: { sequence: 2, timestamp: "2026-10-07T00:00:00.100Z", processes: [process] },
  delta: { treeDeltaPrivateBytes: 50, processDeltas: [{ ...process, deltaPrivateBytes: 50 }] } };
const bursts = { events: [event], callbacks: [{ sequence: 2, status: "completed", error: null,
  result: { success: true, dumpGuid: "actual" } }] };
const allocator = bytes => ({ blink_gc: { size: bytes }, v8: { size: null } });
const attribution = () => ({ dumps: [
  { phase: "pre-conversion-attribution", timestamp: "2026-10-07T00:00:00.000Z", processes: [process], memoryDump: { success: true, dumpGuid: "before" } },
  { timestamp: "2026-10-07T00:00:00.180Z", finishedAt: "2026-10-07T00:00:00.200Z", processes: [process], memoryDump: { success: true, dumpGuid: "actual" } },
], allocatorSummary: [
  { requestDumpGuid: "before", processes: [{ pid: 2, traceName: "Renderer", allocators: allocator(10) }] },
  { requestDumpGuid: "actual", processes: [{ pid: 2, traceName: "Renderer", allocators: allocator(70) }] },
] });

test("GUID/native identity joining retains latency, overlapping allocator deltas, and unknown cause", () => {
  const [row] = joinNativeBurstDumps(bursts, attribution());
  assert.equal(row.dumpGuid, "actual"); assert.equal(row.acquisitionToDumpRequestMs, 80);
  assert.equal(row.acquisitionToDumpCompletionMs, 100);
  assert.equal(row.processes[0].matchingPreDumpNativeIdentity, true);
  assert.equal(row.processes[0].allocatorDeltasFromSameIdentityBaseline.blink_gc.size, 60);
  assert.equal(row.processes[0].allocatorDeltasFromSameIdentityBaseline.v8.size, null);
  assert.equal(row.processes[0].summedAllocatorTotal, null); assert.equal(row.originalFailureCause, null);
  assert.equal(row.acceptanceMetric, false);
});
test("reused PID cannot supply a baseline identity or an invented zero allocator delta", () => {
  const trace = attribution(); trace.dumps[0].processes = [{ ...process, creationFileTime: "134040000020000000" }];
  const [row] = joinNativeBurstDumps(bursts, trace);
  assert.equal(row.processes[0].matchingBaselineIdentity, false);
  assert.equal(row.processes[0].allocatorDeltasFromSameIdentityBaseline.blink_gc.size, null);
});
test("failed/busy callback and missing trace summary remain explicitly unavailable", () => {
  const trace = attribution(); trace.allocatorSummary = null;
  const [row] = joinNativeBurstDumps(bursts, trace);
  assert.equal(row.allocatorSummaryAvailable, false); assert.equal(row.processes[0].allocatorsAtDump, null);
  const failed = { ...bursts, callbacks: [{ sequence: 2, status: "skipped-busy-no-queue", error: null, result: null }] };
  const [unavailable] = joinNativeBurstDumps(failed, trace);
  assert.equal(unavailable.dumpGuid, null); assert.equal(unavailable.acquisitionToDumpRequestMs, null);
});
test("ambiguous/missing/native-time-regressed joins fail instead of claiming peak attribution", () => {
  const trace = attribution(); trace.dumps.push(trace.dumps[1]);
  assert.throws(() => joinNativeBurstDumps(bursts, trace), /Ambiguous/);
  const early = attribution(); early.dumps[1].timestamp = "2026-10-07T00:00:00.090Z";
  assert.throws(() => joinNativeBurstDumps(bursts, early), /precede/);
  assert.throws(() => joinNativeBurstDumps({ ...bursts, events: [] }, attribution()), /actual native trigger/);
});
test("actually executed native blank control joins both dumps without inventing an identity-bound baseline", async () => {
  const proof = JSON.parse(await readFile(new URL("../evidence/native-burst-control-passed-2026-10-07.json", import.meta.url)));
  const rows = joinNativeBurstDumps(proof.bursts, { dumps: proof.trace.dumps, allocatorSummary: proof.trace.allocatorSummary });
  assert.equal(rows.length, 2); assert.equal(rows[0].acquisitionToDumpRequestMs, 78);
  assert.equal(rows[0].acquisitionToDumpCompletionMs, 127);
  const renderer = rows[0].processes.find(p => p.nativeIdentity.pid === 40604);
  assert.ok(renderer); assert.equal(renderer.nativeDeltaPrivateBytes, 43126784);
  assert.equal(renderer.matchingPreDumpNativeIdentity, true); assert.equal(renderer.matchingBaselineIdentity, false);
  assert.equal(renderer.traceName, "Renderer"); assert.equal(renderer.allocationObjectOrCallsite, null);
  for (const attrs of Object.values(renderer.allocatorDeltasFromSameIdentityBaseline))
    for (const value of Object.values(attrs)) assert.equal(value, null);
});
