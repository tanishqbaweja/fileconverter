import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";
import { gunzipSync } from "node:zlib";
import { compareMatchedHeadlessUi, sha } from "../scripts/lib/stable-ui-headless-baseline-recipe.mjs";
const read = file => readFile(new URL(`../${file}`, import.meta.url));
const proof = JSON.parse(await read("evidence/2026-10-08T21-50-57-923Z-stable-ui-headless-baseline-validation.json"));
test("Actual matching-mode baseline proves zero geometry delta with real candidate and baseline reports", async () => {
  assert.equal(sha(await read(proof.executionReceipt.path)), proof.executionReceipt.sha256);
  assert.equal(sha(await read(proof.verifier.path)), proof.verifier.sha256);
  const e = JSON.parse(await read(proof.executionReceipt.path));
  assert.equal(e.status, "matched-headless-geometry-and-five-goldens-passed"); assert.equal(e.failure, null);
  assert.equal(e.browserMode, "headless"); assert.equal(e.subprocessWindowsHidden, true);
  for (const [file, hash] of Object.entries(e.sourcePins)) assert.equal(sha(await read(file)), hash);
  assert.deepEqual(e.sourcePins, e.postSourcePins); assert.deepEqual(e.protectedPre, e.protectedPost);
  const archive = await read(e.generatedArchive.path); assert.equal(sha(archive), e.generatedArchive.sha256);
  const generated = JSON.parse(gunzipSync(archive));
  for (const [name, code] of Object.entries(generated)) assert.equal(sha(code), e.generatedArchive.hashes[name]);
  const compressed = await read(e.compressedReport.path); assert.equal(sha(compressed), e.compressedReport.sha256);
  const raw = gunzipSync(compressed); assert.equal(sha(raw), e.rawReport.sha256);
  const prior = JSON.parse(await read(e.candidateValidation.path));
  const candidate = gunzipSync(await read(prior.compressedReport.path)); assert.equal(sha(candidate), prior.rawReport.sha256);
  assert.deepEqual(compareMatchedHeadlessUi(JSON.parse(candidate), JSON.parse(raw)), e.analysis);
  assert.equal(e.analysis.maximumDeltaCssPixels, 0); assert.equal(e.analysis.matchingHeadlessGeometryAccepted, true);
  assert.equal(e.bytesSaved, 510838); assert.equal(e.rawRemovedAfterLosslessArchive, true);
  assert.equal(e.cleanup.ownedWrapperAbsent, true); assert.equal(e.cleanup.assetsRestored, true);
  assert.deepEqual(e.cleanup.numericProcessObservation.current, []); assert.equal(e.cleanup.numericProcessObservation.nativeBirthsUnavailable, true);
  for (const shot of e.screenshots) { const b = await read(shot.path); assert.equal(sha(b), shot.sha256); assert.equal(b.length, shot.bytes); }
  assert.equal(proof.visualReview.allSixHeadlessScreenshotsInspected, true); assert.equal(proof.visualReview.headedManualValidation, false);
  for (const field of ["completeChromiumMemoryAcceptance", "originalFullSourceAcceptance", "conversionSpeedAcceptance", "publicAcceptance"]) { assert.equal(proof[field], false); assert.equal(e[field], false); }
});
