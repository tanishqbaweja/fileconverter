import assert from "node:assert/strict";
import { access, readFile } from "node:fs/promises";
import path from "node:path";
import test from "node:test";
import { materializeLayeredFullSourceArchive } from "../scripts/lib/duration-drain-full-sources.mjs";
const root = path.resolve(import.meta.dirname, "..");
test("actual preparation recovers every656 preimage and unchanged full-file acceptance gates", async () => {
  const proof = JSON.parse(await readFile(path.join(root, "evidence/2026-10-15T11-14-20-754Z-duration-drain-original-full-preparation.json")));
  assert.equal(proof.status, "prepared-not-executed"); assert.equal(proof.failure, null); assert.equal(proof.executions, 0);
  assert.equal(proof.wrapperAbsent, true); assert.equal(proof.candidateAbsent, true); assert.equal(proof.productionRestored, true);
  assert.deepEqual(proof.cleanupErrors, []); assert.deepEqual(proof.protectedBefore, proof.protectedAfter);
  assert.equal(proof.protectedAfter.bytes, 2958573265);
  assert.equal(proof.protectedAfter.sha256, "31f36695b5b44c62125a9e4264e84dc085accd21c02cc3487aae597f54b9db34");
  assert.equal(proof.hostPreflight.safeToStart, true); assert.ok(proof.diskPreflightBytes >= 32 * 1024 ** 3);
  assert.equal(proof.requestedRuns, 3); assert.equal(proof.maximumConversionMsPerRun, 21600000);
  assert.equal(proof.primaryLimitMiB, 250); assert.equal(proof.nativeBitRate, 4000000);
  assert.equal(proof.browserMode, "headless"); assert.equal(proof.subprocessWindowsHidden, true);
  for (const field of ["originalFullSourceAcceptance", "publicAcceptance", "conversionSpeedAcceptance", "completeChromiumMemoryAcceptance"]) assert.equal(proof[field], false);
  const archive = await materializeLayeredFullSourceArchive(root, proof.sourceArchive);
  assert.deepEqual(archive.sourcePins, proof.sourcePins); assert.deepEqual(proof.sourcePins, proof.postSourcePins);
  assert.equal(Object.keys(archive.sourcePreimages).length, 656);
  assert.equal(proof.sourceArchive.parentPreimages, 588); assert.equal(proof.sourceArchive.extensionPreimages, 68);
  for (const token of ["minimumMs: 300000", "blankBaseline = await stable(\"blank-baseline\")",
    "blankBaseline.privateBytes <= startupSettlement.earlyWindow.privateBytes",
    "run.incrementalPrivateMiB = (run.peakPrivateBytes - blankBaseline.privateBytes) / MiB",
    "run.incrementalPrivateMiB <= 250", "ssim >= 0.98", "validateFullBitrateAudit", "native-100ms", "duration-drain-full-failure.mjs"])
    assert.ok(archive.generated.includes(token), token);
  assert.equal(archive.generated.includes("withPacketOrderProbe"), false);
  for (const directory of [proof.wrapper, proof.candidateDirectory]) await assert.rejects(access(directory), { code: "ENOENT" });
});
