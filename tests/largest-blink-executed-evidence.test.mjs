import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { readFile } from "node:fs/promises";
import test from "node:test";
const read = f => readFile(new URL(`../${f}`, import.meta.url));
const proof = async name => JSON.parse(await read(`evidence/${name}-2026-10-07.json`));
const sha = bytes => createHash("sha256").update(bytes).digest("hex");
async function verifyPins(p) {
  for (const [file, digest] of Object.entries(p.sourcePins)) assert.equal(sha(await read(file)), digest, file);
  for (const [name, digest] of Object.entries(p.generatedSourceHashes)) assert.equal(sha(p.generatedSources[name]), digest, name);
}
test("actual largest64 blank prerequisite retains bounded type data and honest omissions, not a full inventory", async () => {
  const p = await proof("largest-blink-type-control"); await verifyPins(p);
  assert.equal(p.status, "completed-largest-blink-type-control"); assert.equal(p.typeFieldsAvailable, true);
  assert.equal(p.trace.trace.dataLossOccurred, false); assert.equal(p.trace.trace.overflow, false);
  assert.equal(p.trace.trace.serializedBytes, 4093481); assert.equal(p.trace.dumps.length, 1); assert.equal(p.types.length, 256);
  const processes = p.trace.allocatorSummary[0].processes.filter(x => x.blinkTypeSelection?.inspectedRecords > 0);
  assert.equal(processes.length, 4);
  for (const process of processes) {
    assert.equal(process.blinkTypeStatistics.length, 64); assert.equal(process.blinkTypeSelection.partialInventory, true);
    assert.equal(process.blinkTypeSelection.knownRecordsNotRetained, process.blinkTypeSelection.knownEligibleRecords - 64);
    assert.equal(process.blinkTypeSelection.acceptanceMetric, false);
    for (const row of process.blinkTypeStatistics) assert.ok(row.name.length <= 1024 && row.type.length <= 1024);
  }
  assert.equal(p.originalRead, false); assert.equal(p.converterLoaded, false); assert.equal(p.syntheticAllocationBytes, 0);
  assert.equal(p.nativeObserverStarted, false); assert.equal(p.noForcedGc, true); assert.equal(p.generatedMediaCopies, 0);
  for (const value of Object.values(p.cleanup)) assert.equal(value, true);
  assert.equal(p.outerGeneratedRuntimeRemoved, true); assert.equal(p.completeChromiumMemoryAcceptance, false);
});
test("actual two-session real UI attribution has both complete GUID intervals and measured grid/text increases", async () => {
  const p = await proof("ui-largest-blink-types"); await verifyPins(p);
  assert.equal(p.status, "completed-diagnostic"); assert.equal(p.traces.length, 2); assert.equal(p.rows.length, 7);
  for (const t of p.traces) {
    assert.equal(t.dumps.length, 1); assert.equal(t.trace.dataLossOccurred, false); assert.equal(t.trace.overflow, false);
    assert.equal(t.trace.parseError, null); assert.equal(t.limits.chromiumBufferBytes, 4194304);
    assert.equal(t.limits.maximumSerializedBytes, 16777216);
  }
  assert.deepEqual(p.traces.map(t => t.trace.serializedBytes), [5934741, 5603290]);
  const renderer = p.joined.find(process => process.pid === 32860);
  assert.equal(renderer.nativeType, "renderer"); assert.equal(renderer.nativeBirthMatched, true); assert.equal(renderer.traceBirthAvailable, false);
  const grid = renderer.types.find(t => t.type.startsWith("blink::GridSizingTrackCollection "));
  assert.equal(grid.beforeAllocatedObjectsBytes, 4342560); assert.equal(grid.afterAllocatedObjectsBytes, 6749280);
  assert.equal(grid.deltaAllocatedObjectsBytes, 2406720); assert.equal(grid.deltaObjectCount, 1380);
  const text = renderer.types.find(t => t.type.startsWith("blink::PlainTextNode "));
  assert.equal(text.deltaAllocatedObjectsBytes, 2157600); assert.equal(text.deltaObjectCount, 1740);
  assert.equal(renderer.beforeSelection.knownRecordsNotRetained, 1239); assert.equal(renderer.beforeSelection.unavailableRecords, 7);
  assert.equal(renderer.absentTypesAreUnavailableNotZero, true); assert.equal(renderer.summedAllocatorDelta, null);
  assert.equal(p.allocationSourceOfOriginalFailure, null); assert.equal(p.conversionsPerformed, 0);
  assert.equal(p.completeChromiumMemoryAcceptance, false); assert.equal(p.publicAcceptance, false);
  assert.equal(p.originalSourceBytes, 2958573265); assert.equal(p.originalSourceSha256, "31f36695b5b44c62125a9e4264e84dc085accd21c02cc3487aae597f54b9db34");
  assert.ok(p.rows.filter(r => r.jobState != null).every(r => r.jobState === "idle")); assert.deepEqual(p.forbidden, []);
  for (const value of Object.values(p.cleanup)) assert.equal(value, true);
});
test("failed offscreen candidate retains its actual navigation failure and lower point metrics without being promoted", async () => {
  const p = await proof("ui-offscreen-matrix-experiment"); await verifyPins(p);
  assert.equal(p.status, "failed-diagnostic"); assert.match(p.failure, /locator\.click.*Timeout/s);
  assert.equal(p.cssCandidate.matrixCards, 405); assert.equal(p.cssCandidate.formatAnchorWorked, false);
  assert.equal(p.cssCandidate.allCardsAvailable, false); assert.equal(p.cssCandidate.publishedCssModified, false);
  assert.equal(p.cssCandidate.enginesModified, false); assert.equal(p.cssCandidate.publicAcceptance, false);
  assert.equal(p.rows.find(r => r.phase === "native-sampling-start").heap.embedderHeapUsedSize, 3728528);
  assert.equal(p.rows.at(-1).heap.embedderHeapUsedSize, 15049360);
  assert.equal(p.cssCandidate.staticAssets.length, 1); assert.equal(p.cssCandidate.staticAssets[0].beforeBytes, 26139);
  assert.equal(p.cssCandidate.staticAssets[0].afterBytes, 26223);
  for (const t of p.traces) { assert.equal(t.trace.dataLossOccurred, false); assert.equal(t.trace.parseError, null); }
  for (const value of Object.values(p.cleanup)) assert.equal(value, true);
  assert.equal(p.completeChromiumMemoryAcceptance, false); assert.equal(p.conversionSpeedAcceptance, false);
});
test("actual responsive fragment/rendering check restores high visible-matrix heap and leaves worst-case memory fix unproven", async () => {
  const p = await proof("ui-offscreen-rendered-matrix-experiment"); await verifyPins(p);
  assert.equal(p.status, "completed-diagnostic"); assert.equal(p.rows.length, 8);
  assert.equal(p.cssCandidate.navbarLinkVisible, false);
  assert.equal(p.cssCandidate.navigationMode, "native-fragment-navigation-responsive-link-hidden");
  assert.deepEqual(p.cssCandidate.viewport, { width: 758, height: 482 });
  assert.equal(p.cssCandidate.formatAnchorWorked, true); assert.equal(p.cssCandidate.allCardsAvailable, true);
  assert.equal(p.cssCandidate.matrixCards, 405);
  assert.equal(p.cssCandidate.matrixMarkupSha256, "4d2f0c1da04db1bbd47e2bee964503f510cc31c001b619bc454fe6780df8f7c1");
  assert.equal(p.cssCandidate.publishedCssModified, false); assert.equal(p.cssCandidate.enginesModified, false);
  const before = p.rows.find(r => r.phase === "native-sampling-start"), after = p.rows.find(r => r.phase === "ui-control-settled-3s"), rendered = p.rows.at(-1);
  assert.equal(before.heap.embedderHeapUsedSize, 3729008); assert.equal(after.heap.embedderHeapUsedSize, 15016008);
  assert.equal(rendered.phase, "offscreen-matrix-actually-rendered"); assert.equal(rendered.heap.embedderHeapUsedSize, 28100608);
  assert.equal(rendered.privateBytes, 406327296); // This is a sparse point, not a conversion peak or baseline.
  const renderer = p.joined.find(process => process.pid === 11508);
  const grid = renderer.types.find(t => t.type.startsWith("blink::GridSizingTrackCollection "));
  assert.equal(grid.beforeAllocatedObjectsBytes, 101152); assert.equal(grid.deltaAllocatedObjectsBytes, 2406720);
  assert.equal(grid.deltaObjectCount, 1380); assert.equal(renderer.nativeBirthMatched, true);
  for (const t of p.traces) { assert.equal(t.trace.dataLossOccurred, false); assert.equal(t.trace.parseError, null); }
  for (const value of Object.values(p.cleanup)) assert.equal(value, true);
  assert.equal(p.publicAcceptance, false); assert.equal(p.completeChromiumMemoryAcceptance, false);
  assert.equal(p.conversionSpeedAcceptance, false); assert.equal(p.allocationSourceOfOriginalFailure, null);
  assert.equal(p.originalSourceBytes, 2958573265); assert.equal(p.originalSourceSha256, "31f36695b5b44c62125a9e4264e84dc085accd21c02cc3487aae597f54b9db34");
  assert.equal(p.conversionsPerformed, 0); assert.equal(p.generatedMediaCopies, 0); assert.deepEqual(p.forbidden, []);
});
test("actual independent CSS runs reused a root PID, so a cross-run PID-only comparison would be invalid", async () => {
  const old = await proof("ui-offscreen-matrix-experiment"), fresh = await proof("ui-offscreen-rendered-matrix-experiment");
  const before = old.rows[0].processes.find(p => p.pid === 11420), after = fresh.rows[0].processes.find(p => p.pid === 11420);
  assert.equal(before.type, "browser"); assert.equal(after.type, "browser");
  assert.notEqual(before.createdAt, after.createdAt); assert.notEqual(before.parentPid, after.parentPid);
  assert.equal(before.createdAt, "2026-10-07T10:34:57.9964230Z");
  assert.equal(after.createdAt, "2026-10-07T10:38:53.1369460Z");
  assert.equal(old.cleanup.chromeStopped, true); assert.equal(fresh.cleanup.chromeStopped, true);
});
