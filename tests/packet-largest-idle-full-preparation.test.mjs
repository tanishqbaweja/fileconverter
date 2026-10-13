// Actual preparation evidence, not a simulated full-file conversion result.
import assert from "node:assert/strict";
import { access, readFile } from "node:fs/promises";
import path from "node:path";
import test from "node:test";
import { sha } from "../scripts/lib/stable-ui-headless-baseline-recipe.mjs";
import { materializeLayeredFullSourceArchive } from "../scripts/lib/packet-largest-idle-full-sources.mjs";
const root = path.resolve(import.meta.dirname, "..");
const proof = JSON.parse(await readFile(path.join(root, "evidence/2026-10-13T01-25-07-570Z-packet-largest-idle-original-full-preparation.json")));
test("actual preparation recovers all439 current/pre/post preimages in untouched380 plus bounded59 supplemental sources", async () => {
  assert.equal(proof.status, "prepared-not-executed"); assert.equal(proof.executions, 0); assert.equal(proof.failure, null);
  assert.deepEqual(proof.cleanupErrors, []); assert.deepEqual(proof.sourcePins, proof.postSourcePins);
  assert.equal(Object.keys(proof.sourcePins).length, 439); assert.equal(proof.sourceLayers.legacyFilesRetained, 380);
  assert.equal(proof.sourceLayers.supplementalFiles, 59); assert.equal(proof.sourceLayers.omittedLegacyFiles, 0);
  const archive = await materializeLayeredFullSourceArchive(root, proof.sourceArchive);
  assert.equal(archive.allPreimagesRecovered, true); assert.equal(archive.legacyBytesRewritten, false);
  assert.equal(archive.adapter.bytes, 33536); assert.equal(archive.adapter.sha256, "511ee27cce5156f76319305b05f29ec7c4f36429bdb24ae558e27dd77e2ff1f9");
  for (const [file, hash] of Object.entries(proof.sourcePins)) {
    assert.equal(sha(await readFile(path.join(root, file))), hash, file);
    assert.equal(sha(Buffer.from(archive.sourcePreimages[file].data, "base64")), hash, file);
  }
});
test("actual zero-conversion preflight preserves source/quality/heaps/memory gates and removes owned runtime", async () => {
  assert.equal(proof.hostPreflight.safeToStart, true); assert.ok(proof.diskPreflightBytes >= 32 * 1024 ** 3);
  assert.deepEqual(proof.protectedBefore, proof.protectedAfter);
  assert.equal(proof.protectedBefore.bytes, 2958573265);
  assert.equal(proof.protectedBefore.sha256, "31f36695b5b44c62125a9e4264e84dc085accd21c02cc3487aae597f54b9db34");
  assert.equal(proof.requestedRuns, 3); assert.equal(proof.primaryLimitMiB, 250); assert.equal(proof.nativeBitRate, 4000000);
  assert.equal(proof.maximumConversionMsPerRun, 21600000); assert.equal(proof.composition.manifest.aggregateWasmMemoryBytes, 50331648);
  assert.equal(proof.composition.manifest.allowMemoryGrowth, false);
  assert.equal(proof.composition.manifest.artifacts["within-mpeg2-split.wasm"], "7bb58a363d81030d38a8dc3187dc0adf541b77385f06bc0c576225ba29f78439");
  assert.equal(proof.composition.manifest.artifacts["split-encoder.wasm"], "a4ba6225414ca7a658d349ae81926e5ed040fa73be4540fe8a7adf7656fe1cee");
  for (const flag of ["wrapperAbsent", "candidateAbsent", "productionRestored", "subprocessWindowsHidden"]) assert.equal(proof[flag], true);
  for (const flag of ["originalFullSourceAcceptance", "publicAcceptance", "conversionSpeedAcceptance", "completeChromiumMemoryAcceptance"]) assert.equal(proof[flag], false);
  await assert.rejects(access(proof.wrapper), { code: "ENOENT" }); await assert.rejects(access(proof.candidateDirectory), { code: "ENOENT" });
});
