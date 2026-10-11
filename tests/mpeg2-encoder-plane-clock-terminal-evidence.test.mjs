// Actual independent audit output, not synthetic completion evidence.
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import path from "node:path";
import test from "node:test";
import { gunzipSync } from "node:zlib";
import { sha } from "../scripts/lib/stable-ui-headless-baseline-recipe.mjs";
import { encoderPlaneClockTerminalFacts } from "../scripts/lib/encoder-plane-clock-terminal-facts.mjs";
const root = path.resolve(import.meta.dirname, ".."), read = file => readFile(path.join(root, file));
const analysis = JSON.parse(await read("evidence/2026-10-11T03-53-11-041Z-encoder-plane-clock-original-full-terminal-analysis.json"));
test("actual strict clock audit binds archives, recomputed whole-tree memory, unknown quality and no acceptance", async () => {
  const bytes = await read(analysis.receipt.path); assert.equal(sha(bytes), analysis.receipt.sha256);
  const receipt = JSON.parse(bytes), archive = receipt.candidate.compressedReport, zipped = await read(archive.path);
  assert.equal(zipped.length, archive.bytes); assert.equal(sha(zipped), archive.sha256);
  const restored = gunzipSync(zipped, { maxOutputLength: 33554432 }); assert.equal(restored.length, archive.restoredBytes);
  assert.equal(sha(restored), archive.restoredSha256);
  const facts = encoderPlaneClockTerminalFacts(JSON.parse(restored));
  for (const [key, value] of Object.entries(facts)) assert.deepEqual(analysis[key], value, key);
  assert.equal(analysis.native.observedIncrementalPrivateMiB, 221.73828125);
  assert.equal(analysis.completedConversions, 0); assert.equal(analysis.historicalDeletedOutputNumericSsimKnown, false);
  assert.equal(analysis.savedButNotValidated[0].numericSsim, null); assert.equal(analysis.fullOriginalSessionGatePassed, false);
  for (const field of ["publicAcceptance", "goalComplete", "conversionSpeedAcceptance", "scalingAcceptance"]) assert.equal(analysis[field], false);
  for (const field of ["exactExecutedCallerAndDriverReconstructed", "actualRecordedIdentitiesRequeriedAndAbsent", "noProcessesKilled",
    "fullProtectedPostSha256Verified", "normalProductionAndSixEnginesRestored", "ninePrivateAssetsAbsent", "ownedRuntimeAndWrapperAbsent"])
    assert.equal(analysis[field], true, field);
});
test("actual249 measured source pins and independent audit source pins remain current, without rewriting historical evidence", async () => {
  const receipt = JSON.parse(await read(analysis.receipt.path)); assert.deepEqual(receipt.sourcePins, receipt.postSourcePins);
  assert.equal(analysis.sourcePreimagesVerified, 249); assert.equal(Object.keys(receipt.sourcePins).length, 249);
  for (const [file, expected] of Object.entries(receipt.sourcePins)) assert.equal(sha(await read(file)), expected, file);
  for (const [file, expected] of Object.entries(analysis.analysisSourcePins)) assert.equal(sha(await read(file)), expected, file);
  assert.equal(Object.hasOwn(receipt.sourcePins, "scripts/lib/encoder-plane-clock-terminal-recipe.mjs"), false);
});
