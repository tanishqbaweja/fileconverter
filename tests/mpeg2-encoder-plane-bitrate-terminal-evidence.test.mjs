import { readHistoricalUiOrArtifact as readFile } from "./helpers/historical-published-ui.mjs";
// Separate evidence check created after the independent audit; never rewrites its pins.
import assert from "node:assert/strict";
import { access } from "node:fs/promises";
import path from "node:path";
import test from "node:test";
import { gunzipSync } from "node:zlib";
import { sha } from "../scripts/lib/stable-ui-headless-baseline-recipe.mjs";
import { encoderPlaneBitrateTerminalFacts } from "../scripts/lib/encoder-plane-bitrate-terminal-facts.mjs";
const root = path.resolve(import.meta.dirname, ".."), read = file => readFile(path.join(root, file));
const reportPath = "evidence/2026-10-11T08-24-12-696Z-encoder-plane-bitrate-original-full-terminal-analysis.json";
const analysis = JSON.parse(await read(reportPath));
const receiptBytes = await read(analysis.receipt.path); assert.equal(sha(receiptBytes), analysis.receipt.sha256);
const receipt = JSON.parse(receiptBytes);
async function restore(record) {
  const zipped = await read(record.path); assert.equal(zipped.length, record.bytes); assert.equal(sha(zipped), record.sha256);
  const bytes = gunzipSync(zipped, { maxOutputLength: 33554432 });
  assert.equal(bytes.length, record.restoredBytes); assert.equal(sha(bytes), record.restoredSha256); return JSON.parse(bytes);
}
const raw = await restore(receipt.candidate.compressedReport), source = await restore(receipt.sourceArchive);
test("Historical actual independent partial-OOM audit matches strict recomputed window with no fidelity/public acceptance", () => {
  const facts = encoderPlaneBitrateTerminalFacts(raw);
  for (const [field, expected] of Object.entries(facts)) assert.deepEqual(analysis[field], expected, field);
  assert.equal(analysis.completedConversions, 0); assert.equal(analysis.fullOriginalSessionGatePassed, false);
  assert.equal(analysis.native.actualPeakPrivateBytes, 481656832); assert.equal(analysis.native.blankPrivateBytes, 238669824);
  assert.equal(analysis.native.observedIncrementalPrivateMiB, (481656832 - 238669824) / 1048576);
  assert.equal(analysis.native.completeChromiumMemoryAcceptance, false);
  assert.equal(analysis.observerClosedAndClockFenceValid, true); assert.equal(analysis.publicAcceptance, false);
  assert.equal(analysis.fullProtectedPostSha256Verified, true);
  assert.equal(analysis.actualRecordedIdentitiesRequeriedAndAbsent, true); assert.deepEqual(analysis.reusedPids, []);
});
test("Historical all256 executed source preimages and19 audit pins remain exact and cleanup archives are recoverable", async () => {
  assert.equal(Object.keys(receipt.sourcePins).length, 256); assert.deepEqual(receipt.sourcePins, receipt.postSourcePins);
  assert.equal(Object.keys(source.sourcePreimages).length, 256); assert.equal(analysis.sourcePreimagesVerified, 256);
  assert.equal(sha(source.generated), receipt.sourceArchive.driverSha256);
  assert.equal(sha(source.traceHelper), receipt.sourceArchive.traceHelperSha256);
  for (const [file, hash] of Object.entries(receipt.sourcePins)) {
    // Live-current equality is preserved separately in explicit qualification;
    // this archived run must keep its executed bytes, not today's changed UI.
    assert.equal(source.sourcePreimages[file].encoding, "base64"); assert.equal(sha(Buffer.from(source.sourcePreimages[file].data, "base64")), hash, file);
  }
  assert.equal(Object.keys(analysis.analysisSourcePins).length, 19);
  for (const [file, hash] of Object.entries(analysis.analysisSourcePins)) assert.equal(sha(await read(file)), hash, file);
  for (const field of ["normalProductionAndSixEnginesRestored", "ninePrivateAssetsAbsent", "ownedRuntimeAndWrapperAbsent", "noProcessesKilled"])
    assert.equal(analysis[field], true);
  for (const directory of [receipt.wrapper, raw.runtimeDirectory]) await assert.rejects(access(directory), { code: "ENOENT" });
  assert.equal(receipt.candidate.rawRemovedAfterLosslessArchive, true); assert.equal(receipt.candidate.actualExitCode, 1);
  assert.equal(receipt.failure, null); assert.equal(raw.runs[0].state.metrics.scratchBytes, 0);
});
