// Actual preparation only: no full conversion or memory acceptance is inferred.
import assert from "node:assert/strict";
import { access, readFile } from "node:fs/promises";
import path from "node:path";
import test from "node:test";
import { sha } from "../scripts/lib/stable-ui-headless-baseline-recipe.mjs";
import { materializeLayeredFullSourceArchive } from "../scripts/lib/layered-full-source-archive.mjs";
const root = path.resolve(import.meta.dirname, "..");
const bytes = await readFile(path.join(root, "evidence/2026-10-11T18-47-14-549Z-alignment16-original-full-preparation.json"));
const proof = JSON.parse(bytes);
test("actual preparation retains all326 current/pre/post/preimages, exact changed candidate and unchanged evidence caps", async () => {
  assert.equal(sha(bytes), "5ac435941983b26028be4f38d60c2732252c9b7fc6471cc314441e27b5a61ebf");
  assert.equal(proof.status, "prepared-not-executed"); assert.equal(proof.failure, null); assert.deepEqual(proof.cleanupErrors, []);
  assert.equal(Object.keys(proof.sourcePins).length, 326); assert.deepEqual(proof.sourcePins, proof.postSourcePins);
  const archive = await materializeLayeredFullSourceArchive(root, proof.sourceArchive);
  assert.deepEqual(archive.sourcePins, proof.sourcePins); assert.equal(Object.keys(archive.sourcePreimages).length, 326);
  assert.equal(archive.allPreimagesRecovered, true); assert.equal(archive.historicalBytesRewritten, false);
  assert.equal(proof.sourceLayers.historicalFilesRetained, 256); assert.equal(proof.sourceLayers.additiveFiles, 70);
  assert.equal(proof.sourceLayers.limits.combinedFiles, 384); assert.equal(proof.sourceLayers.limits.additiveRestoredBytes, 2097152);
  assert.equal(proof.composition.manifest.artifacts["within-mpeg2-split.wasm"], "417182a9ed0f5e19e77c5248545c80265b87abd477984872d9ccf4094d8b1014");
  assert.equal(proof.composition.manifest.artifacts["split-encoder.wasm"], "a4ba6225414ca7a658d349ae81926e5ed040fa73be4540fe8a7adf7656fe1cee");
  assert.equal(archive.qualifiedMedia.path, "evidence/2026-10-11T18-21-53-018Z-alignment16-media.json");
  assert.ok(archive.adapter.bytes < 32768);
});
test("whole protected hash/host/disk/owned cleanup pass but browser/full/primary/speed/public acceptance remain unexecuted", async () => {
  assert.deepEqual(proof.protectedBefore, { bytes: 2958573265, sha256: "31f36695b5b44c62125a9e4264e84dc085accd21c02cc3487aae597f54b9db34", wholeFileReadOnly: true });
  assert.deepEqual(proof.protectedAfter, proof.protectedBefore);
  assert.equal(proof.hostPreflight.safeToStart, true); assert.ok(proof.diskPreflightBytes >= 32 * 1024 ** 3);
  assert.equal(proof.executions, 0); assert.equal(proof.driverIdentity, null); assert.equal(proof.candidate, null); assert.equal(proof.buildProof, null);
  assert.equal(proof.productionRestored, true); assert.equal(proof.wrapperAbsent, true); assert.equal(proof.candidateAbsent, true);
  for (const directory of [proof.wrapper, proof.candidateDirectory]) await assert.rejects(access(directory), { code: "ENOENT" });
  for (const field of ["originalFullSourceAcceptance", "publicAcceptance", "conversionSpeedAcceptance", "completeChromiumMemoryAcceptance"]) assert.equal(proof[field], false);
});
