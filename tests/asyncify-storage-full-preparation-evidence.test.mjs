import assert from "node:assert/strict";
import { access, readFile } from "node:fs/promises";
import path from "node:path";
import test from "node:test";
import { sha } from "../scripts/lib/stable-ui-headless-baseline-recipe.mjs";
import { materializeLayeredFullSourceArchive, FULL_SOURCE_LAYER_LIMITS } from "../scripts/lib/asyncify-storage-layered-source-archive.mjs";
const root = path.resolve(import.meta.dirname, ".."), read = file => readFile(path.join(root, file));
test("actual365-source full preparation retains every346 previous source, exact candidate and original stress gates within unchanged caps", async () => {
  const proof = JSON.parse(await read("evidence/2026-10-12T14-40-42-917Z-asyncify-storage-original-full-preparation.json"));
  assert.equal(proof.status, "prepared-not-executed"); assert.equal(proof.failure, null); assert.deepEqual(proof.cleanupErrors, []);
  assert.equal(proof.executions, 0); assert.equal(proof.requestedRuns, 3); assert.equal(proof.maximumConversionMsPerRun, 21600000);
  assert.equal(proof.primaryLimitMiB, 250); assert.equal(proof.nativeBitRate, 4000000); assert.deepEqual(proof.sourcePins, proof.postSourcePins);
  assert.equal(Object.keys(proof.sourcePins).length, 365); assert.equal(proof.sourceLayers.historicalFilesRetained, 256);
  assert.equal(proof.sourceLayers.additiveFiles, 109); assert.deepEqual(proof.sourceLayers.limits, FULL_SOURCE_LAYER_LIMITS);
  const previous = JSON.parse(await read("evidence/2026-10-12T10-18-33-321Z-packet-cache-original-full-terminal.json"));
  for (const [file, hash] of Object.entries(previous.sourcePins)) assert.equal(proof.sourcePins[file], hash, file);
  const archive = await materializeLayeredFullSourceArchive(root, proof.sourceArchive);
  assert.deepEqual(archive.sourcePins, proof.sourcePins); assert.equal(archive.allPreimagesRecovered, true);
  for (const [file, hash] of Object.entries(proof.sourcePins)) {
    assert.equal(sha(await read(file)), hash, file); assert.equal(sha(Buffer.from(archive.sourcePreimages[file].data, "base64")), hash, file);
  }
  assert.equal(proof.qualifiedMedia.sourceCount, 157); assert.equal(proof.composition.manifest.asyncifyStorage.reservationBytes, 262156);
  assert.equal(proof.composition.manifest.aggregateWasmMemoryBytes, 50331648); assert.equal(proof.composition.manifest.allowMemoryGrowth, false);
  for (const token of ["ssim >= 0.98", "asyncifyStorageFinalSamples", "suspension.frees,1", "native-checkpoint.json", "windowsHide: true"])
    assert.ok(archive.generated.includes(token), token);
  assert.deepEqual(proof.protectedBefore, proof.protectedAfter); assert.equal(proof.protectedAfter.bytes, 2958573265);
  assert.equal(proof.protectedAfter.sha256, "31f36695b5b44c62125a9e4264e84dc085accd21c02cc3487aae597f54b9db34");
  assert.equal(proof.productionRestored, true); assert.equal(proof.wrapperAbsent, true); assert.equal(proof.candidateAbsent, true);
  for (const directory of [proof.wrapper, proof.candidateDirectory]) await assert.rejects(access(directory), { code: "ENOENT" });
  assert.equal(proof.originalFullSourceAcceptance, false); assert.equal(proof.completeChromiumMemoryAcceptance, false);
});
test("hidden preparation supervisor exits0 and removes own runtime; initial duplicate-reference preparation remains failed/no conversion", async () => {
  const passed = JSON.parse(await read("evidence/2026-10-12T14-40-42-133Z-asyncify-storage-supervisor-prepare-only.json"));
  assert.equal(passed.childExit.code, 0); assert.equal(passed.runtimeRemoved, true); assert.equal(passed.failure, null);
  assert.equal(passed.conversionAcceptance, false); await assert.rejects(access(passed.runtimeDirectory), { code: "ENOENT" });
  for (const [file, hash] of Object.entries(passed.sourcePins)) { assert.equal(sha(await read(file)), hash); assert.equal(sha(Buffer.from(passed.sourcePreimages[file], "base64")), hash); }
  const failed = JSON.parse(await read("evidence/2026-10-12T14-39-28-356Z-asyncify-storage-supervisor-prepare-only.json"));
  assert.equal(failed.childExit.code, 1); assert.equal(failed.runtimeRemoved, true); assert.equal(failed.conversionAcceptance, false);
  assert.equal(failed.stdout.totalBytes, 0); assert.match(Buffer.from(failed.stderr.tailBase64, "base64").toString(), /requestedFiles.length <= 384/);
  await assert.rejects(access(failed.runtimeDirectory), { code: "ENOENT" });
});
