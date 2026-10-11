// Held preparation is never relabelled as an actual browser/OOM control.
import assert from "node:assert/strict";
import { access, readFile } from "node:fs/promises";
import path from "node:path";
import test from "node:test";
import { gunzipSync } from "node:zlib";
import { sha } from "../scripts/lib/stable-ui-headless-baseline-recipe.mjs";
const root = path.resolve(import.meta.dirname, ".."), read = file => readFile(path.join(root, file));
const held = JSON.parse(await read("evidence/2026-10-11T11-39-18-203Z-direct-buffer-abort-control-executed-sources.json"));
async function restore(record) {
  const zipped = await read(record.path); assert.equal(zipped.length, record.bytes); assert.equal(sha(zipped), record.sha256);
  const bytes = gunzipSync(zipped, { maxOutputLength: 2097152 });
  assert.equal(bytes.length, record.restoredBytes); assert.equal(sha(bytes), record.restoredSha256); return JSON.parse(bytes);
}
test("held source preparation preserves actual38 current/preimages and reports zero browsers with unchanged safety gate", async () => {
  assert.equal(held.status, "held-before-browser-import-insufficient-host-memory");
  assert.equal(held.browserDriverImported, false); assert.equal(held.browsersLaunched, 0);
  assert.equal(held.proof, null); assert.equal(held.failure, null); assert.equal(held.publicAcceptance, false);
  assert.equal(held.browserConversionsPerformed, 0); assert.equal(held.protectedSourceRead, false);
  assert.equal(held.launchHostPreflight.freeVirtualBytes, 2004074496);
  assert.equal(held.launchHostPreflight.requiredVirtualBytes, 2147483648);
  assert.equal(held.launchHostPreflight.safeToStart, false);
  assert.equal(held.launchHostPreflight.primaryMemoryFormulaChanged, false);
  assert.deepEqual(held.sourcePins, held.postSourcePins); assert.equal(Object.keys(held.sourcePins).length, 38);
  const sources = await restore(held.archive); assert.deepEqual(sources.sourcePins, held.sourcePins);
  for (const [file, hash] of Object.entries(held.sourcePins)) {
    assert.equal(sha(await read(file)), hash, file); assert.equal(sha(Buffer.from(sources.preimages[file], "base64")), hash, file);
  }
  assert.equal(sha(sources.generated), sources.generatedSha256); assert.equal(sha(sources.worker), sources.workerSha256);
  assert.equal(sources.exportOnlyControl.originalSha256, "86704920f30ed243240614df92d05deba9f76c33e739a927903677b677f8a8ec");
  assert.equal(sources.exportOnlyControl.onlyExportSectionChanged, true);
  assert.ok(sources.exportOnlyControl.sections.filter(section => section.id !== 7).every(section => section.originalSha256 === section.outputSha256));
  assert.equal(held.syntheticExportOnlyBinaryRemovedWithCallerScratch, true);
  await assert.rejects(access(held.ownedCaller), { code: "ENOENT" });
});
test("initial preflight failure preserves old exact source rather than claiming missing dynamic metrics", async () => {
  const failed = JSON.parse(await read("evidence/2026-10-11T11-37-14-140Z-direct-buffer-abort-control-preflight-failure.json"));
  assert.equal(failed.browsersLaunched, 0); assert.equal(failed.browserConversionsPerformed, 0);
  assert.equal(failed.actualFailingHostValuesRetained, false); assert.equal(failed.publicAcceptance, false);
  assert.equal(failed.subsequentReadOnlyHostRecheck.safeToStart, false);
  const source = await restore(failed.archive);
  for (const [file, hash] of Object.entries(failed.sourcePins)) assert.equal(sha(Buffer.from(source.preimages[file], "base64")), hash, file);
  const caller = "scripts/check-direct-buffer-abort-control.mjs";
  assert.notEqual(failed.sourcePins[caller], held.sourcePins[caller], "Changed preflight retention is separately archived, not rewritten");
  assert.equal(failed.ownedCallerAbsent, true); await assert.rejects(access(failed.ownedCaller), { code: "ENOENT" });
});
