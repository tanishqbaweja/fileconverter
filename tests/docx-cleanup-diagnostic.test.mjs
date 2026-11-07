import assert from "node:assert/strict";
import test from "node:test";
import path from "node:path";
import { createDocxCleanupDiagnostic, DOCX_CLEANUP_PHASES, compactDocxMemoryInfra } from "../scripts/lib/docx-cleanup-diagnostic.mjs";

function setup(capture = async () => ({ summary: [], acceptanceMetric: false })) {
  const commands = []; let detached = 0, native = 0;
  const session = { send: async method => { commands.push(method); return { documents: 1, nodes: 8, jsEventListeners: 2 }; }, detach: async () => { detached++; } };
  const options = { page: {}, context: { newCDPSession: async () => session }, browser: { newBrowserCDPSession: async () => ({}) },
    realms: { sample: async () => ({ realms: [] }) }, nativeSnapshot: async () => ({ sequence: ++native, processes: [{ pid: 1, privateBytes: 123 }] }),
    archiveDirectory: path.resolve("output/playwright"), stamp: "2026-11-07T00-00-00-000Z", capture };
  return { options, commands, detached: () => detached };
}
test("DOCX diagnostic observes only eight ordered metadata phases without changing acceptance or forcing GC", async () => {
  const calls = [], s = setup(async options => { calls.push(options); return { summary: [], acceptanceMetric: false }; });
  const d = await createDocxCleanupDiagnostic(s.options);
  for (const phase of DOCX_CLEANUP_PHASES) await d.sample(phase);
  await assert.rejects(d.sample("cleanup-first"));
  assert.equal(calls.length, 8); assert.deepEqual(s.commands, Array(8).fill("Memory.getDOMCounters"));
  for (const [n, row] of d.report().rows.entries()) {
    assert.equal(row.nativeBefore.sequence, n * 2 + 1); assert.equal(row.nativeAfter.sequence, n * 2 + 2);
    assert.equal(row.dom.nativeProcessIdentity, null); assert.equal(row.acceptanceMetric, false);
    assert.equal(path.dirname(calls[n].archivePath), s.options.archiveDirectory);
  }
  assert.equal(d.report().nativeTargetJoinVerified, false); assert.equal(d.report().maximumPending, 1);
  await d.close(); await d.close(); assert.equal(s.detached(), 1); await assert.rejects(d.sample("loaded"));
});
test("diagnostic compact summary retains category counters and exact trace archive identity, not duplicated thousands of buckets", () => {
  const full = { archive: { sha256: "unchanged" }, summary: [{ phase: "complete", processes: [{ pid: 42,
    allocators: { v8: { size: 123 } }, liveAllocatorCounters: { "malloc/bucket": { size: 4 } } }] }] };
  const compact = compactDocxMemoryInfra(full);
  assert.equal(compact.archive, full.archive); assert.equal(compact.summary[0].processes[0].allocators.v8.size, 123);
  assert.equal(compact.summary[0].processes[0].liveAllocatorCounters, undefined);
  assert.deepEqual(full.summary[0].processes[0].liveAllocatorCounters, { "malloc/bucket": { size: 4 } });
  assert.equal(compact.detailedAllocatorBucketsInHashedTraceArchive, true);
});
test("DOCX diagnostic refuses concurrent/queued captures, retains failed phase and closes owned DOM session", async () => {
  let rejectCapture, entered;
  const ready = new Promise(resolve => { entered = resolve; });
  const s = setup(() => { entered(); return new Promise((_, reject) => { rejectCapture = reject; }); });
  const d = await createDocxCleanupDiagnostic(s.options), first = d.sample("loaded");
  await ready; await assert.rejects(d.sample("before-large"), /No diagnostic queue/);
  rejectCapture(new Error("bounded capture unavailable")); await assert.rejects(first, /unavailable/);
  assert.equal(d.report().rows.length, 1); assert.match(d.report().rows[0].errors[0].message, /unavailable/);
  await d.close(); assert.equal(s.detached(), 1);
});
