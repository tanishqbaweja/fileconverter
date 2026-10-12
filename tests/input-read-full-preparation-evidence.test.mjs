import assert from "node:assert/strict";
import { access, readFile } from "node:fs/promises";
import path from "node:path";
import test from "node:test";
import { sha } from "../scripts/lib/stable-ui-headless-baseline-recipe.mjs";
import { materializeLayeredFullSourceArchive, FULL_SOURCE_LAYER_LIMITS } from "../scripts/lib/input-read-layered-source-archive.mjs";
const root = path.resolve(import.meta.dirname, ".."), read = file => readFile(path.join(root, file));
test("actual380-source preparation retains all365 prior sources and full gates, recovers every preimage inside unchanged caps", async () => {
  const proof = JSON.parse(await read("evidence/2026-10-12T19-44-46-839Z-input-read-original-full-preparation.json"));
  assert.equal(proof.status, "prepared-not-executed"); assert.equal(proof.failure, null); assert.deepEqual(proof.cleanupErrors, []);
  assert.equal(proof.executions, 0); assert.equal(proof.requestedRuns, 3); assert.equal(proof.maximumConversionMsPerRun, 21600000);
  assert.equal(proof.primaryLimitMiB, 250); assert.equal(proof.nativeBitRate, 4000000); assert.deepEqual(proof.sourcePins, proof.postSourcePins);
  assert.equal(Object.keys(proof.sourcePins).length, 380); assert.equal(proof.sourceLayers.historicalFilesRetained, 256);
  assert.equal(proof.sourceLayers.additiveFiles, 124); assert.deepEqual(proof.sourceLayers.limits, FULL_SOURCE_LAYER_LIMITS);
  const prior = JSON.parse(await read("evidence/2026-10-12T14-43-54-627Z-asyncify-storage-original-full-terminal.json"));
  for (const [file, hash] of Object.entries(prior.sourcePins)) assert.equal(proof.sourcePins[file], hash, file);
  const archive = await materializeLayeredFullSourceArchive(root, proof.sourceArchive); assert.equal(archive.allPreimagesRecovered, true);
  assert.deepEqual(archive.sourcePins, proof.sourcePins);
  for (const [file, hash] of Object.entries(proof.sourcePins)) {
    assert.equal(sha(await read(file)), hash, file); assert.equal(sha(Buffer.from(archive.sourcePreimages[file].data, "base64")), hash, file);
  }
  const addition = Buffer.from(JSON.stringify({ additivePins: archive.additivePins, additiveSourcePreimages: archive.additiveSourcePreimages }));
  assert.ok(addition.length <= 2097152); assert.equal(proof.sourceArchive.bytes, 651889);
  assert.equal(proof.sourceArchive.sha256, "c247ae68b7b9801fecbea4e36e8d3de9ae7a644acf4c71b495d09f80606cc380");
  for (const token of ["ssim >= 0.98", "WITHIN_INPUT_READ_FAILURE", "inputReadFailureSamples", "A completed conversion must have no input read failures", "asyncifyStorageFinalSamples", "native-checkpoint.json", "windowsHide: true"])
    assert.ok(archive.generated.includes(token), token);
  assert.deepEqual(proof.protectedBefore, proof.protectedAfter); assert.equal(proof.protectedAfter.bytes, 2958573265);
  assert.equal(proof.protectedAfter.sha256, "31f36695b5b44c62125a9e4264e84dc085accd21c02cc3487aae597f54b9db34");
  assert.equal(proof.productionRestored, true); assert.equal(proof.wrapperAbsent, true); assert.equal(proof.candidateAbsent, true);
  for (const directory of [proof.wrapper, proof.candidateDirectory]) await assert.rejects(access(directory), { code: "ENOENT" });
  assert.equal(proof.originalFullSourceAcceptance, false); assert.equal(proof.completeChromiumMemoryAcceptance, false);
});
test("actual hidden preparation supervisor exits0, preserves birth records and cleans runtime; no conversion claimed", async () => {
  const proof = JSON.parse(await read("evidence/2026-10-12T19-44-45-751Z-input-read-supervisor-prepare-only.json"));
  assert.equal(proof.childExit.code, 0); assert.equal(proof.runtimeRemoved, true); assert.equal(proof.failure, null);
  assert.equal(proof.conversionAcceptance, false); await assert.rejects(access(proof.runtimeDirectory), { code: "ENOENT" });
  assert.equal(proof.childIdentity.parentPid, proof.supervisorIdentity.pid);
  for (const [file, hash] of Object.entries(proof.sourcePins)) { assert.equal(sha(await read(file)), hash); assert.equal(sha(Buffer.from(proof.sourcePreimages[file], "base64")), hash); }
});
