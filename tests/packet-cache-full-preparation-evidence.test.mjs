// Actual preparation only: no full conversion or memory acceptance is inferred.
import assert from "node:assert/strict";
import { access, readFile } from "node:fs/promises";
import path from "node:path";
import test from "node:test";
import { sha } from "../scripts/lib/stable-ui-headless-baseline-recipe.mjs";
import { materializeLayeredFullSourceArchive } from "../scripts/lib/packet-cache-layered-source-archive.mjs";
const root = path.resolve(import.meta.dirname, "..");
const bytes = await readFile(path.join(root, "evidence/2026-10-12T05-48-04-956Z-packet-cache-original-full-preparation.json"));
const proof = JSON.parse(bytes);
test("actual preparation retains all333 current/pre/post/preimages, exact changed candidate and unchanged evidence caps", async () => {
  assert.equal(sha(bytes), "6980bfe01e725259d193bb88fa6c2f4f74823a741d5c4fc1ba08628484ab21a3");
  assert.equal(proof.status, "prepared-not-executed"); assert.equal(proof.failure, null); assert.deepEqual(proof.cleanupErrors, []);
  assert.equal(Object.keys(proof.sourcePins).length, 333); assert.deepEqual(proof.sourcePins, proof.postSourcePins);
  const archive = await materializeLayeredFullSourceArchive(root, proof.sourceArchive);
  assert.deepEqual(archive.sourcePins, proof.sourcePins); assert.equal(Object.keys(archive.sourcePreimages).length, 333);
  assert.equal(archive.allPreimagesRecovered, true); assert.equal(archive.historicalBytesRewritten, false);
  assert.equal(proof.sourceLayers.historicalFilesRetained, 256); assert.equal(proof.sourceLayers.additiveFiles, 77);
  assert.equal(proof.sourceLayers.limits.combinedFiles, 384); assert.equal(proof.sourceLayers.limits.additiveRestoredBytes, 2097152);
  assert.equal(proof.composition.manifest.artifacts["within-mpeg2-split.wasm"], "4421339c802d2031c27c6c62ee948174b454797a7176d338cfe451b19c2945cb");
  assert.equal(proof.composition.manifest.artifacts["split-encoder.wasm"], "a4ba6225414ca7a658d349ae81926e5ed040fa73be4540fe8a7adf7656fe1cee");
  assert.equal(archive.qualifiedMedia.path, "evidence/2026-10-12T05-33-59-279Z-packet-cache-media.json");
  assert.ok(archive.adapter.bytes < 32768);
  assert.equal(Object.values(archive.additiveSourcePreimages).filter(row => row.encoding === "qualified-external-gzip").length, 2);
  for (const [file, hash] of Object.entries(proof.sourcePins)) {
    const row = archive.sourcePreimages[file]; assert.equal(row.encoding, "base64");
    assert.equal(sha(Buffer.from(row.data, "base64")), hash, file);
    assert.equal(sha(await readFile(path.join(root, file))), hash, file);
  }
  assert.equal(proof.composition.manifest.componentProofs.nativeExecutedSources.sourceCount, 72);
  assert.equal(proof.composition.manifest.packetCache.actualWasmLifecycle.reuseIterations, 200000);
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
