import assert from "node:assert/strict";
import { access, readFile } from "node:fs/promises";
import path from "node:path";
import test from "node:test";
import { sha, baselineBinding } from "../scripts/lib/stable-ui-headless-baseline-recipe.mjs";
import { materializeLayeredFullSourceArchive, loadHistoricalFullSourceBase } from "../scripts/lib/layered-full-source-archive.mjs";
const root = path.resolve(import.meta.dirname, ".."), read = file => readFile(path.join(root, file));
const receipt = "evidence/2026-10-11T13-55-32-334Z-allocation-attempt-original-full-preparation.json";
test("actual PREPARATION ONLY retains312 exact current/pre/post/preimage pins and all historical256, without inventing a full conversion", async () => {
  const proof = JSON.parse(await read(receipt));
  assert.equal(proof.status, "prepared-not-executed"); assert.equal(proof.executions, 0); assert.equal(proof.failure, null); assert.deepEqual(proof.cleanupErrors, []);
  assert.equal(proof.driverIdentity, null); assert.equal(proof.candidate, null); assert.equal(proof.buildProof, null);
  assert.equal(Object.keys(proof.sourcePins).length, 312); assert.deepEqual(proof.sourcePins, proof.postSourcePins);
  assert.equal(proof.sourceLayers.historicalFilesRetained, 256); assert.equal(proof.sourceLayers.additiveFiles, 56);
  const restored = await materializeLayeredFullSourceArchive(root, proof.sourceArchive), base = await loadHistoricalFullSourceBase(root);
  assert.equal(proof.sourceArchive.bytes, 840603); assert.equal(proof.sourceArchive.restoredBytes, 2023140);
  assert.equal(proof.sourceArchive.sha256, "92b926a64841c730a2230d191f27b9f4eec4f4a070b7fc62cff381d3e5601bb0");
  assert.equal(proof.sourceArchive.generatedCallerSha256, "2ab2d83f597c66b8594d720ae8f2da0325aff7e8a14e6d605ffb1d6146a793c8");
  assert.deepEqual(restored.sourcePins, proof.sourcePins); assert.equal(Object.keys(restored.sourcePreimages).length, 312);
  for (const [file, hash] of Object.entries(proof.sourcePins)) {
    assert.equal(sha(await read(file)), hash, file); assert.equal(sha(Buffer.from(restored.sourcePreimages[file].data, "base64")), hash, file);
  }
  assert.equal(restored.generatedCaller, (await read("scripts/run-allocation-attempt-original-full.mjs")).toString());
  let reversed = restored.generated; for (const { before, after } of restored.edits.toReversed()) reversed = reversed.replaceAll(after, before);
  assert.equal(reversed, base.archive.generated); assert.equal(restored.historicalBytesRewritten, false);
  assert.equal(restored.originalAcceptanceGatesByteExact, true);
  assert.equal(restored.adapter.bytes, 29544); assert.equal(restored.adapter.sha256, "0060b16249ae9e15c490d8a274303d4b57db700561e6a35eee81ec1f95dcab5f");
  assert.deepEqual(restored.manifest, proof.composition.manifest);
  assert.equal(proof.composition.manifest.artifacts["within-mpeg2-split.wasm"], "9ce862602f8db5e61f5047e4ecdccea1d8f7e8c98452fb486a95befeeb558039");
  assert.equal(proof.composition.manifest.artifacts["split-encoder.wasm"], "a4ba6225414ca7a658d349ae81926e5ed040fa73be4540fe8a7adf7656fe1cee");
});
test("actual preparation cleanup and original whole-file checks passed; no full/browser/speed/memory acceptance inferred", async () => {
  const proof = JSON.parse(await read(receipt));
  assert.deepEqual(proof.protectedBefore, { bytes: 2958573265, sha256: "31f36695b5b44c62125a9e4264e84dc085accd21c02cc3487aae597f54b9db34", wholeFileReadOnly: true });
  assert.deepEqual(proof.protectedAfter, proof.protectedBefore); assert.equal(proof.productionRestored, true);
  for (const key of ["wrapperAbsent", "candidateAbsent"]) assert.equal(proof[key], true);
  for (const directory of [proof.wrapper, proof.candidateDirectory]) {
    assert.equal(path.dirname(directory), path.join(root, "work")); await assert.rejects(access(directory), { code: "ENOENT" });
  }
  assert.equal(proof.hostPreflight.safeToStart, true); assert.equal(proof.hostPreflight.primaryMemoryFormulaChanged, false);
  assert.ok(proof.diskPreflightBytes >= 32 * 1024 ** 3); assert.equal(proof.launchHostPreflight, null);
  assert.equal(proof.primaryLimitMiB, 250); assert.equal(proof.requestedRuns, 3); assert.equal(proof.maximumConversionMsPerRun, 21600000);
  for (const key of ["originalFullSourceAcceptance", "publicAcceptance", "conversionSpeedAcceptance", "completeChromiumMemoryAcceptance"]) assert.equal(proof[key], false);
  assert.equal(sha(await read("dist/client" + baselineBinding.url)), baselineBinding.sha256);
});
