import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { readFile } from "node:fs/promises";
import test from "node:test";
const read = file => readFile(new URL(`../${file}`, import.meta.url));
const proof = async file => JSON.parse(await read(`evidence/${file}-2026-10-07.json`));
const sha = bytes => createHash("sha256").update(bytes).digest("hex");
async function verifyPins(p) {
  for (const [file, digest] of Object.entries(p.sourcePins)) assert.equal(sha(await read(file)), digest, file);
  for (const [name, digest] of Object.entries(p.generatedSourceHashes)) assert.equal(sha(p.generatedSources[name]), digest, name);
}
test("actual production UI complete heap measurement joins the same post-navigation renderer identity, not another realm", async () => {
  const p = await proof("ui-complete-blink-heap"); await verifyPins(p);
  assert.equal(p.status, "completed-diagnostic"); assert.equal(p.browserVersion, "154.0.8037.98");
  assert.equal(p.rows.length, 7); assert.equal(p.trace.dumps.length, 7);
  assert.equal(p.trace.trace.dataLossOccurred, false); assert.equal(p.trace.trace.overflow, false);
  assert.equal(p.trace.realmRows, 236); assert.equal(p.trace.realmRowsEvicted, 0);
  const initial = p.rows.find(r => r.phase === "native-sampling-start"), final = p.rows.at(-1);
  const before = p.heaps.find(h => h.phase === initial.phase && h.pid === 12452 && h.name === "blink_gc/main/heap");
  const after = p.heaps.find(h => h.phase === final.phase && h.pid === before.pid && h.name === before.name);
  const identity = row => row.processes.find(process => process.pid === before.pid);
  assert.equal(identity(initial).createdAt, identity(final).createdAt);
  assert.equal(before.residentBytes, 17039440); assert.equal(before.allocatedObjectsBytes, 16634664);
  assert.equal(after.residentBytes, 29491200); assert.equal(after.allocatedObjectsBytes, 28237344);
  assert.equal(after.allocatedObjectsBytes - before.allocatedObjectsBytes, 11602680);
  assert.equal(after.allocatedObjectsBytes, final.heap.embedderHeapUsedSize);
  assert.equal(final.dom.nodes - initial.dom.nodes, 1620); assert.equal(final.dom.jsEventListeners - initial.dom.jsEventListeners, 180);
  assert.equal(final.jobState, "idle"); assert.deepEqual(p.forbidden, []);
  for (const value of Object.values(p.cleanup)) assert.equal(value, true);
  assert.equal(p.outerGeneratedRuntimeRemoved, true); assert.equal(p.originalSourceBytes, 2958573265);
  assert.equal(p.originalSourceSha256, "31f36695b5b44c62125a9e4264e84dc085accd21c02cc3487aae597f54b9db34");
  for (const flag of ["publicAcceptance", "completeChromiumMemoryAcceptance", "conversionSpeedAcceptance"]) assert.equal(p[flag], false);
  assert.equal(p.allocationSourceOfOriginalFailure, null); assert.equal(p.conversionsPerformed, 0);
});
test("actual detailed prerequisite failures remain failed: trace loss, long names and genuine record overflow are not erased", async () => {
  const multi = await proof("detailed-blink-type-control"), single = await proof("single-detailed-blink-type-control"), bounded = await proof("bounded-detailed-blink-type-control");
  for (const p of [multi, single, bounded]) {
    await verifyPins(p); assert.match(p.status, /^failed-/); assert.equal(p.typeFieldsAvailable, false);
    assert.equal(p.types.length, 0); assert.equal(p.publicAcceptance, false); assert.equal(p.originalRead, false);
    assert.equal(p.converterLoaded, false); assert.equal(p.noForcedGc, true); assert.equal(p.generatedMediaCopies, 0);
    for (const value of Object.values(p.cleanup)) assert.equal(value, true);
    assert.equal(p.outerGeneratedRuntimeRemoved, true); assert.equal(p.trace.limits.chromiumBufferBytes, 4194304);
    assert.equal(p.trace.limits.maximumSerializedBytes, 16777216); assert.equal(p.trace.trace.overflow, false);
  }
  assert.equal(multi.trace.trace.dataLossOccurred, true); assert.match(multi.trace.trace.parseError, /Unique global interval/);
  assert.equal(single.trace.trace.dataLossOccurred, false); assert.match(single.trace.trace.parseError, /Type name cap/);
  assert.equal(bounded.trace.trace.dataLossOccurred, false); assert.match(bounded.trace.trace.parseError, /Nonzero\/unavailable type record cap/);
  assert.equal(single.trace.dumps.length, 1); assert.equal(bounded.trace.dumps.length, 1);
  assert.equal(single.syntheticAllocationBytes, 0); assert.equal(bounded.nativeObserverStarted, false);
});
test("actual bounded schema check proves field availability and over-512 cardinality without claiming a retained type inventory", async () => {
  const p = await proof("detailed-blink-type-schema"); await verifyPins(p);
  assert.equal(p.status, "completed-detailed-blink-type-schema-control"); assert.equal(p.schemaFieldsInspected, true);
  assert.equal(p.trace.trace.dataLossOccurred, false); assert.equal(p.trace.trace.overflow, false);
  assert.equal(p.trace.trace.parseError, null); assert.equal(p.trace.dumps.length, 1); assert.equal(p.types.length, 0);
  assert.equal(p.syntheticAllocationBytes, 0); assert.equal(p.nativeObserverStarted, false);
  const schemas = p.trace.allocatorSummary.flatMap(d => d.processes.map(process => process.detailedTypeSchema));
  assert.ok(schemas.some(s => s.records === 1019)); assert.ok(schemas.some(s => s.records === 607));
  for (const s of schemas.filter(s => s.records > 0)) {
    assert.equal(s.byteFieldsAvailable, s.records); assert.equal(s.countFieldsAvailable, s.records);
    assert.equal(s.nonzeroByteFields, s.records); assert.equal(s.nonzeroCountFields, s.records);
    assert.ok(s.layouts.length <= 8); assert.equal(s.schemaOnly, true); assert.equal(s.acceptanceMetric, false);
    assert.equal(s.summedAllocatorTotal, null);
  }
  for (const value of Object.values(p.cleanup)) assert.equal(value, true);
  assert.equal(p.originalRead, false); assert.equal(p.converterLoaded, false); assert.equal(p.noForcedGc, true);
  assert.equal(p.allocationSourceOfOriginalFailure, null); assert.equal(p.completeChromiumMemoryAcceptance, false);
  assert.equal(p.generatedMediaCopies, 0);
});
