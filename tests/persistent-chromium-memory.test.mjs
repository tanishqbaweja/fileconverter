import assert from "node:assert/strict";
import test from "node:test";
import { validateNativeBatch } from "../scripts/lib/persistent-chromium-memory.mjs";

const batch = () => ({ overflow: false, observerCpuMs: 2, samples: [{ sequence: 1,
  timestamp: "2026-10-04T17:00:00.000Z", completedAt: "2026-10-04T17:00:00.002Z", nativeElapsedMs: 2,
  sampleError: null, privateBytes: 90, rssBytes: 120, processes: [
    { pid: 1, parentPid: 0, createdAt: "2026-10-04T16:00:00Z", creationFileTime: "134040000000000000", privateBytes: 10, rssBytes: 20 },
    { pid: 2, parentPid: 1, createdAt: "2026-10-04T16:00:01Z", creationFileTime: "134040000010000000", privateBytes: 30, rssBytes: 40 },
    { pid: 3, parentPid: 1, createdAt: "2026-10-04T16:00:02Z", creationFileTime: "134040000020000000", privateBytes: 50, rssBytes: 60 },
  ] }] });
test("native snapshots include unknown descendants rather than drop utility or GPU bytes", () => {
  const b = batch(); assert.equal(validateNativeBatch(b, 1), 1);
  assert.equal(b.samples[0].privateBytes, 90);
  assert.deepEqual(b.samples[0].processes.map((p) => p.type), ["browser", "unknown", "unknown"]);
});
test("unavailable native snapshots are retained as null, never fabricated zero or partial totals", () => {
  const b = batch(); Object.assign(b.samples[0], { sampleError: "Access unavailable", privateBytes: null, rssBytes: null, processes: null });
  assert.equal(validateNativeBatch(b, 1), 1);
  b.samples[0].privateBytes = 0; assert.throws(() => validateNativeBatch(b, 1));
});
test("native observer refuses silent ring loss, sequence gaps, missing root and inconsistent totals", () => {
  let b = batch(); b.overflow = true; assert.throws(() => validateNativeBatch(b, 1));
  b = batch(); b.samples[0].sequence = 2; assert.throws(() => validateNativeBatch(b, 1));
  b = batch(); b.samples[0].privateBytes = 40; assert.throws(() => validateNativeBatch(b, 1));
  b = batch(); assert.throws(() => validateNativeBatch(b, 4));
  b = batch(); b.samples[0].processes[1].pid = 1; assert.throws(() => validateNativeBatch(b, 1));
});
