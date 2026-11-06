import assert from "node:assert/strict";
import { test } from "node:test";
import { readFile } from "node:fs/promises";
import { createHash } from "node:crypto";
import { gunzipSync } from "node:zlib";
const sha = bytes => createHash("sha256").update(bytes).digest("hex");
const read = file => readFile(new URL("../" + file, import.meta.url));
const raw = await read("evidence/2026-11-06T21-07-40-560Z-docx-html-qualification.json");
assert.equal(sha(raw), "dd31294c6cea39b33a34a06422531412fe7b1b604772f52e3051a00ca6706f4f");
const r = JSON.parse(raw);
test("actual private DOCX HTML control verifies real input package and four genuine byte-exact outputs with independent native validators", () => {
  assert.equal(r.status, "passed-private-small-docx-html-production-control-not-public-qualification"); assert.deepEqual(r.failures, []);
  assert.equal(r.fixture.bytes, 979); assert.equal(r.fixture.cancelBytes, 9001106);
  assert.deepEqual(r.sourceValidation.map(x => x.kind), ["structure", "cancellation"]);
  for (const s of r.sourceValidation) {
    assert.equal(s.zipCrcVerified, true); assert.equal(s.packageNamespacesAndMainRelationshipVerified, true); assert.equal(s.wordXmlWellFormed, true);
    assert.match(s.sourceValidator, /not complete OOXML XSD\/layout validation/);
  }
  assert.equal(r.invalidPackageControlRejected, true);
  assert.deepEqual(r.validatorControls.map(x => [x.name, x.exitCode]), [["positive", 0], ["wrong-text", 1], ["active-markup", 1]]);
  assert.deepEqual(r.cases.map(x => x.kind), ["complete", "complete", "complete", "payload-cancel", "write-error", "complete"]);
  for (const c of r.cases.filter(x => x.kind === "complete")) {
    assert.equal(c.outputBytes, 720); assert.equal(c.validated.sha256, "31bbd28016f7eaef9a9c2ef4fbf91221c7f34450710949302daacdcef5de0a55");
    assert.equal(c.validated.paragraphs, 4); assert.equal(c.validated.tableCells, 2); assert.equal(c.validated.strong, 1); assert.equal(c.validated.italic, 1); assert.equal(c.validated.csp, true);
    assert.equal(c.binding.convertedCopyCreated, false); assert.equal(c.binding.allOutputBytesCompared, true);
    assert.equal(c.metrics.queuedBytes, 0); assert.equal(c.metrics.pendingOperations, 0); assert.equal(c.metrics.peakPendingOperations, 1);
  }
});
test("native local file selection, actual payload cancellation and cleanup recovery remain bounded with unchanged strict whole-tree formula", async () => {
  assert.equal(r.inputSelections.length, 4);
  for (const s of r.inputSelections) {
    assert.equal(s.method, "DOM.setFileInputFiles"); assert.equal(s.contentPayloadsSent, 0); assert.equal(s.nodeFileContentsRead, false);
    assert.equal(s.productionInputElementUsed, true); assert.equal(s.fileMetadataUnchanged, true);
  }
  const cancel = r.cases.find(x => x.kind === "payload-cancel"); assert.ok(cancel.armedMetrics.outputBytes >= 65536);
  assert.equal(cancel.metrics.maxReadChunkBytes, 262144); assert.equal(cancel.metrics.maxWriteChunkBytes, 65536);
  assert.equal(cancel.metrics.peakQueuedBytes, 65536); assert.equal(cancel.metrics.peakPendingOperations, 1); assert.deepEqual(cancel.leftovers, []);
  assert.deepEqual(r.cases.find(x => x.kind === "write-error").leftovers, []);
  assert.equal(r.memory.incrementalPrivateMiB, 72.2109375); assert.equal(r.memory.limitMiB, 250); assert.equal(r.memory.validSamples, 24); assert.equal(r.memory.unavailableSamples, 0);
  assert.equal((r.memory.peak.privateBytes - r.blankBaseline.privateBytes) / 1048576, r.memory.incrementalPrivateMiB);
  assert.equal(r.memory.peak.processes.reduce((n, p) => n + p.privateBytes, 0), r.memory.peak.privateBytes);
  const packed = await read(r.nativeArchive.file), bytes = gunzipSync(packed, { maxOutputLength: 8388608 });
  assert.equal(sha(packed), r.nativeArchive.sha256); assert.equal(sha(bytes), r.nativeArchive.decodedSha256);
  const rows = JSON.parse(bytes).filter(x => Date.parse(x.timestamp) >= Date.parse(r.memory.windowStart) && Date.parse(x.timestamp) <= Date.parse(r.memory.windowEnd));
  assert.equal(rows.length, 24); assert.equal(Math.max(...rows.map(x => x.privateBytes)), r.memory.peak.privateBytes);
  assert.equal(r.blankBaseline.stable, true); assert.equal(r.blankBaseline.minimumElapsedMs, 8000);
  assert.ok(r.blankBaseline.spreadBytes <= r.blankBaseline.privateBytes * .02);
});
test("old failures/limited fixture evidence stay limited, current route is not promoted and no media/original/owned data is left behind", async () => {
  for (const [file, digest] of [
    ["evidence/2026-11-06T20-47-18-976Z-docx-html-qualification.json", "71cd4087af27a09936923393d1a16b5a585437675fba836861e740bfd1f92001"],
    ["evidence/2026-11-06T20-50-33-200Z-docx-html-qualification.json", "6f640135acb04396d7fea251e2975cc5427d770e44a606fa8f107a590691e530"],
  ]) { const bytes = await read(file); assert.equal(sha(bytes), digest); assert.equal(JSON.parse(bytes).status, "failed-not-acceptance"); }
  const earlier = JSON.parse(await read("evidence/2026-11-06T20-57-15-361Z-docx-html-qualification.json"));
  assert.equal(earlier.sourceValidation, undefined, "Earlier weaker input metadata proof is not retroactively upgraded");
  assert.equal(r.publicPromotion, false); assert.equal(r.stressAcceptance, false); assert.equal(r.nativePickerVerified, false);
  assert.equal(r.largeFileScalingVerified, false); assert.equal(r.speedImprovementProven, false); assert.equal(r.browserServicesDisabled, false); assert.equal(r.headed, false);
  assert.deepEqual(r.forbiddenRequests, []); assert.equal(r.ownedRuntimeRemoved, true); assert.equal(r.browserCleanup.status, "owned-identity-absent");
  assert.equal(r.serverCleanup.ownedRootAbsent, true); assert.deepEqual(r.protectedOriginalBefore, r.protectedOriginalAfter);
  assert.equal(r.protectedOriginalAfter.bytes, 2958573265); assert.equal(r.protectedOriginalAfter.sha256, "31f36695b5b44c62125a9e4264e84dc085accd21c02cc3487aae597f54b9db34");
});
