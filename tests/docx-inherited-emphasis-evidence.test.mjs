import assert from "node:assert/strict";
import test from "node:test";
import { readFile } from "node:fs/promises";
import { gunzipSync } from "node:zlib";
import { createHash } from "node:crypto";
import { assertInstalledChromePinsEqual } from "../scripts/lib/installed-chrome-pin.mjs";
const read = file => readFile(new URL("../" + file.replaceAll("\\", "/"), import.meta.url));
const sha = value => createHash("sha256").update(value).digest("hex");
const comparison = JSON.parse(await read("evidence/2026-11-07-docx-emphasis-repeatability.json"));
const records = [];
for (const receipt of comparison.receipts) {
  const raw = await read(receipt.path); assert.equal(sha(raw), receipt.sha256); records.push(JSON.parse(raw));
}
test("two fresh normal-service Chrome sessions validate supported inherited emphasis per segment and unchanged full scaling inputs", async () => {
  assert.equal(records.length, 2); assert.equal(comparison.freshSessionRepeatVerified, true);
  assertInstalledChromePinsEqual(records[0].browserBefore, records[1].browserBefore);
  assert.notDeepEqual(records[0].browserLaunchIdentity, records[1].browserLaunchIdentity);
  assert.notEqual(records[0].launchArguments.find(a => a.startsWith("--user-data-dir=")), records[1].launchArguments.find(a => a.startsWith("--user-data-dir=")));
  assert.deepEqual(records[0].sourcePins, records[1].sourcePins);
  for (const key of ["workers/docx-outline.ts", "workers/docx-html-conversion.ts", "workers/docx-conversion.ts", "workers/conversion.worker.ts", "lib/capability-registry.ts", "scripts/lib/docx-emphasis-fixtures.py"])
    assert.equal(sha(await read(key)), records[0].sourcePins[key]);
  for (const r of records) {
    assert.equal(r.inheritedEmphasisControlVerified, true); assert.equal(r.browserServicesDisabled, false); assert.equal(r.headed, false);
    assert.equal(r.emphasisControl.fixtureBytes, 37137); assert.equal(r.emphasisControl.generated.styleDefinitions, 169);
    assert.equal(r.emphasisControl.fixtureSha256, "66bbbb0154494a46b10ac9cecf8946a0e3e242adba74ba8ac9605f940097f2f7");
    assert.deepEqual(r.emphasisControl.validatorControls.map(c => c.exitCode), [0, 1, 1, 1, 1]);
    assert.equal(r.emphasisControl.cases.length, 3);
    for (const c of r.emphasisControl.cases) {
      assert.equal(c.outputBytes, 1264); assert.equal(c.validated.sha256, "defda80f12f8bd95450506bb8b19753b0c64f4a49c1c72c1d151e3dce15a01cc");
      assert.equal(c.validated.blocks, 13); assert.equal(c.validated.textSegments, 15); assert.equal(c.validated.supportedStyleEmphasisComparedPerTextSegment, true);
      assert.equal(c.validated.tableCells, 2); assert.equal(c.validated.csp, true);
    }
    const scaling = r.cases.filter(c => c.runMemory); assert.equal(scaling.length, 6);
    assert.deepEqual(scaling.map(c => c.sourceBytes), [8897390, 8897390, 8897390, 141871070, 141871070, 141871070]);
    assert.deepEqual(scaling.map(c => c.outputBytes), [8735249, 8735249, 8735249, 139756049, 139756049, 139756049]);
    for (const c of scaling) assert.equal(c.validated.allParagraphsComparedInOrder, true);
    assert.equal(r.outlineControl.cases.length, 3);
    for (const c of r.outlineControl.cases) { assert.equal(c.outputBytes, 921); assert.deepEqual(c.validated.headingLevels, [1, 2, 3, 9]); }
  }
  for (let n = 0; n < 6; n++) {
    const a = records[0].cases[n], b = records[1].cases[n];
    assert.equal(a.sourceSha256, b.sourceSha256); assert.equal(a.validated.sha256, b.validated.sha256);
  }
});
test("both complete native journals independently reproduce all peaks and original cleanup windows, never narrower JS/Wasm metrics", async () => {
  for (const r of records) {
    const packed = await read(r.nativeArchive.file); assert.equal(sha(packed), r.nativeArchive.sha256);
    const raw = gunzipSync(packed, { maxOutputLength: 16777216 }); assert.equal(sha(raw), r.nativeArchive.decodedSha256);
    const samples = JSON.parse(raw), window = m => samples.filter(s => Date.parse(s.timestamp) >= Date.parse(m.windowStart) && Date.parse(s.timestamp) <= Date.parse(m.windowEnd));
    for (const s of samples) if (s.privateBytes !== null) assert.equal(s.processes.reduce((n, p) => n + p.privateBytes, 0), s.privateBytes);
    const active = window(r.memory), valid = active.filter(s => s.privateBytes !== null);
    assert.equal(valid.length, r.memory.validSamples); assert.equal(active.length - valid.length, r.memory.unavailableSamples);
    assert.equal(Math.max(...valid.map(s => s.privateBytes)), r.memory.peak.privateBytes);
    assert.equal((r.memory.peak.privateBytes - r.blankBaseline.privateBytes) / 1048576, r.memory.incrementalPrivateMiB);
    assert.ok(r.memory.incrementalPrivateMiB <= 250);
    for (const c of [...r.cases.filter(c => c.runMemory), ...r.emphasisControl.cases]) {
      const m = c.runMemory ?? c.smallRunMemory, rows = window(m).filter(s => s.privateBytes !== null);
      assert.equal(rows.length, m.validSamples); assert.equal(Math.max(...rows.map(s => s.privateBytes)), m.peak.privateBytes);
      assert.ok(m.incrementalPrivateMiB <= 250);
      assert.equal((m.cleanupStable.privateBytes - r.loadedIdle.privateBytes) / 1048576, m.cleanupDeltaFromLoadedMiB);
      assert.ok(m.cleanupDeltaFromLoadedMiB <= 96);
    }
  }
});
test("real async file handles, bounded worker I/O, payload cancellation/error/recovery and complete owned cleanup do not imply public/full Word support", () => {
  for (const r of records) {
    assert.equal(r.destinationObservations.length, 15);
    for (const d of r.destinationObservations) { assert.equal(d.mode, "handle"); assert.equal(d.actualFileHandle, true); }
    for (const c of [...r.cases, ...r.emphasisControl.cases, ...r.outlineControl.cases]) if (c.metrics) {
      assert.equal(c.metrics.activeWorkerCount, 1); assert.equal(c.metrics.sharedArrayBufferBytes, 0);
      assert.ok(c.metrics.maxReadChunkBytes <= 262144 && c.metrics.maxWriteChunkBytes <= 65536 && c.metrics.peakQueuedBytes <= 65536);
      assert.equal(c.metrics.pendingOperations, 0); assert.equal(c.metrics.queuedBytes, 0); assert.ok(c.metrics.peakPendingOperations <= 1);
    }
    const cancel = r.cases.find(c => c.kind === "payload-cancel"), error = r.cases.find(c => c.kind === "write-error");
    assert.ok(cancel.armedMetrics.outputBytes >= 1048576); assert.deepEqual(cancel.leftovers, []);
    assert.match(error.message, /destination rejected a bounded write/); assert.deepEqual(error.leftovers, []);
    assert.equal(r.cases.at(-1).validated.sha256, "31bbd28016f7eaef9a9c2ef4fbf91221c7f34450710949302daacdcef5de0a55");
    assert.deepEqual(r.forbiddenRequests, []); assert.deepEqual(r.failures, []);
    assert.equal(r.browserCleanup.status, "owned-observed-pids-absent"); assert.deepEqual(r.browserCleanup.observations.at(-1).current, []);
    assert.equal(r.serverCleanup.ownedRootAbsent, true); assert.equal(r.ownedRuntimeRemoved, true);
    assert.deepEqual(r.protectedOriginalBefore, r.protectedOriginalAfter);
    assert.equal(r.protectedOriginalAfter.sha256, "31f36695b5b44c62125a9e4264e84dc085accd21c02cc3487aae597f54b9db34");
    assert.equal(r.publicPromotion, false); assert.equal(r.nativeExternalDestinationVerified, false); assert.equal(r.fullOoxmlLayoutFidelityVerified, false);
    assert.equal(r.nativeConversionUsed, false);
  }
  assert.equal(comparison.originalFailedReceiptRewritten, false); assert.equal(comparison.causalMemoryFixProven, false);
  assert.equal(comparison.publicPromotion, false); assert.equal(comparison.fullGoalComplete, false);
});
