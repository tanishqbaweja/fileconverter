import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { readFile, unlink } from "node:fs/promises";
import path from "node:path";
import test from "node:test";
import { createDurableNativeMemoryJournal } from "../scripts/lib/durable-native-memory-journal.mjs";

const root = path.resolve(import.meta.dirname, ".."), rootPid = 90001;
export const sample = (sequence, privateBytes = 1000000) => ({ sequence,
  timestamp: new Date(1700000000000 + sequence * 1000).toISOString(), completedAt: new Date(1700000000001 + sequence * 1000).toISOString(),
  nativeElapsedMs: sequence * 1000, sampleError: null, privateBytes: privateBytes + 500000, rssBytes: privateBytes + 600000,
  processes: [
    { pid: rootPid, parentPid: 1, creationFileTime: "133444444444444444", createdAt: "2023-01-01T00:00:00.000Z", privateBytes, rssBytes: privateBytes, executableName: "synthetic-control.exe" },
    { pid: 90002, parentPid: rootPid, creationFileTime: "133444444444444445", createdAt: "2023-01-01T00:00:00.001Z", privateBytes: 500000, rssBytes: 600000, executableName: "synthetic-child.exe" },
  ] });
const batch = samples => ({ samples, overflow: false, observerCpuMs: 10 });
const fresh = () => path.join(root, "outputs/reports", `durable-unit-${randomUUID()}-native-checkpoint.json`);
const remove = async file => { for (const target of [file, file + ".next"]) await unlink(target).catch(error => { if (error.code !== "ENOENT") throw error; }); };

test("6000 synthetic snapshots retain every phase peak, count unknown descendants, and bound recent graph to16 with missing samples null", async () => {
  const file = fresh(); let clock = 1700000000000;
  const baseline = { stable: true, privateBytes: 1000000, rssBytes: 2000000, filename: "must-not-be-recorded" };
  const journal = await createDurableNativeMemoryJournal(rootPid, file, { now: () => clock, getBlankBaseline: () => baseline });
  try {
    journal.setPhase("synthetic-coverage", clock);
    for (let first = 1; first <= 6000; first += 250) {
      const rows = Array.from({ length: 250 }, (_, offset) => sample(first + offset, first + offset === 2 ? 900000000 : 1000000));
      journal.consume(batch(rows));
    }
    const missing = { ...sample(6001), sampleError: "synthetic-unavailable", privateBytes: null, rssBytes: null, processes: null };
    journal.consume(batch([missing])); clock += 6001000;
    await journal.flush(); await Promise.all([journal.close(), journal.close()]);
    const bytes = await readFile(file), proof = JSON.parse(bytes);
    assert.ok(bytes.length <= 2097152); assert.equal(proof.coverageThroughSequence, 6001);
    assert.equal(proof.native.graphBuckets.length, 16); assert.ok(proof.native.graphBucketsEvicted > 0);
    const phase = proof.native.phases.find(row => row.phase === "synthetic-coverage");
    assert.equal(phase.validSamples, 6000); assert.equal(phase.unavailableSamples, 1);
    assert.equal(phase.peak[0], 2); assert.equal(phase.peak[3], 900500000);
    assert.equal(phase.last[3], null); assert.equal(phase.last[7], null);
    assert.equal(proof.native.identities.find(row => row.pid === 90002).type, "unknown");
    assert.deepEqual(proof.baseline, { stable: true, privateBytes: 1000000, rssBytes: 2000000 });
    assert.ok(!bytes.toString().includes("must-not-be-recorded")); assert.equal(proof.conversionAcceptance, false);
    assert.equal(proof.completeRunCoverageProven, false); assert.equal(proof.status, "observer-closed-not-conversion-acceptance");
    assert.equal(journal.report().maximumPendingWrites, 1); assert.ok(journal.report().coalesced > 0);
  } finally { await remove(file); }
});

test("one slow disk write coalesces requests instead of blocking native batch acquisition or queuing snapshots", async () => {
  const file = fresh(); let release, writes = 0, active = 0, peakActive = 0;
  const journal = await createDurableNativeMemoryJournal(rootPid, file, { writeOverride: async () => {
    writes++; active++; peakActive = Math.max(active, peakActive);
    if (writes === 1) await new Promise(resolve => { release = resolve; }); active--;
  } });
  try {
    journal.consume(batch([sample(1)])); journal.consume(batch([sample(2)])); journal.consume(batch([sample(3)]));
    assert.equal(writes, 1); assert.equal(peakActive, 1); release(); await journal.flush(); await journal.close();
    assert.equal(journal.report().writtenSequence, 3); assert.equal(peakActive, 1);
  } finally { await remove(file); }
});

test("disk failure remains an error, never healthy or a zero-memory success", async () => {
  const file = fresh(), journal = await createDurableNativeMemoryJournal(rootPid, file, { writeOverride: async () => { throw new Error("synthetic disk full"); } });
  journal.consume(batch([sample(1)]));
  await assert.rejects(journal.flush(), /synthetic disk full/); assert.throws(() => journal.healthy(), /synthetic disk full/);
  await assert.rejects(journal.close(), /synthetic disk full/); assert.equal(journal.report().writtenSequence, null);
});

test("null baseline remains null and denominator replacement is rejected", async () => {
  const file = fresh(); let baseline = null;
  const journal = await createDurableNativeMemoryJournal(rootPid, file, { getBlankBaseline: () => baseline });
  try {
    journal.consume(batch([sample(1)])); await journal.flush(); assert.equal(JSON.parse(await readFile(file)).baseline, null);
    baseline = { stable: true, privateBytes: 100 }; await journal.flush();
    baseline = { stable: true, privateBytes: 101 }; await assert.rejects(journal.flush(), /Never change the real blank denominator/);
    await assert.rejects(journal.close(), /Never change the real blank denominator/);
  } finally { await remove(file); }
});

test("journal rejects external/scratch paths, traversal, invalid identity and reuse", async () => {
  await assert.rejects(createDurableNativeMemoryJournal(rootPid, path.join(root, "work/bad-native-checkpoint.json")));
  await assert.rejects(createDurableNativeMemoryJournal(rootPid, path.join(root, "outputs/reports/bad.json")));
  const file = fresh(), journal = await createDurableNativeMemoryJournal(rootPid, file);
  try {
    await journal.flush(); await assert.rejects(createDurableNativeMemoryJournal(rootPid, file));
    assert.throws(() => journal.setIdentities({ pid: 1, parentPid: 2, createdAt: new Date().toISOString() }, { pid: 3, parentPid: 2, createdAt: new Date().toISOString() }));
    await journal.close();
  } finally { await remove(file); }
});
