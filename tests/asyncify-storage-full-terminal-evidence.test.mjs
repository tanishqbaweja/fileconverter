import assert from "node:assert/strict";
import { access, readFile } from "node:fs/promises";
import path from "node:path";
import { gunzipSync } from "node:zlib";
import test from "node:test";
import { sha } from "../scripts/lib/stable-ui-headless-baseline-recipe.mjs";
import { materializeLayeredFullSourceArchive } from "../scripts/lib/asyncify-storage-layered-source-archive.mjs";
const root = path.resolve(import.meta.dirname, ".."), read = file => readFile(path.join(root, file)), stamp = "2026-10-12T14-43-54-627Z";
async function records() {
  const proof = JSON.parse(await read(`evidence/${stamp}-asyncify-storage-full-terminal-analysis.json`));
  const bytes = await read(proof.terminal.path); assert.equal(sha(bytes), proof.terminal.sha256);
  const terminal = JSON.parse(bytes), zipped = await read(proof.rawArchive.path); assert.equal(sha(zipped), proof.rawArchive.sha256);
  const raw = gunzipSync(zipped, { maxOutputLength: 33554432 }); assert.equal(raw.length, proof.rawArchive.restoredBytes); assert.equal(sha(raw), proof.rawArchive.restoredSha256);
  return { proof, terminal, raw: JSON.parse(raw) };
}
test("actual full failed input I/O at218892 frames;30199 reused leases cleanly freed, no recorded heap abort or invented read-error cause", async () => {
  const { proof, terminal, raw } = await records(); assert.equal(terminal.candidate.actualExitCode, 1); assert.equal(terminal.candidate.completedConversions, 0);
  assert.equal(proof.completedValidatedConversions, 0); assert.equal(proof.independentFullFidelityValidation, null);
  assert.equal(proof.elapsedMs, 10609542.385000002); assert.equal(proof.partialOutputBytesDeleted, 4106849675);
  assert.equal(proof.lastBridge.frames, 218892); assert.equal(proof.lastBridge.completedPackets, 218892);
  assert.equal(proof.suspensionLifecycle.acquisitions, 30199); assert.equal(proof.suspensionLifecycle.allocations, 1); assert.equal(proof.suspensionLifecycle.frees, 1);
  assert.equal(proof.suspensionLifecycle.retainedBytes, 0); assert.equal(proof.suspensionLifecycle.activeLeases, 0);
  assert.deepEqual(raw.abortDiagnostic.records, []); assert.match(proof.inputFailure.retainedMessage, /network error/);
  for (const field of ["exceptionName", "exceptionCode", "exceptionStack", "exactFailedReadOffset", "underlyingChromiumOrFilesystemCause"]) assert.equal(proof.inputFailure[field], null);
  assert.equal(proof.inputFailure.originalAsyncifyFailureBoundaryReached, false); assert.deepEqual(raw.forbiddenRequests, []);
});
test("actual failed-window231MiB retains22 unavailable samples and exact durable peaks, never acceptance or supervisor0 conversion success", async () => {
  const { proof, raw } = await records(), m = proof.failedWindowMemory;
  assert.equal(m.baselinePrivateBytes, 242892800); assert.equal(m.peakPrivateBytes, 485113856);
  assert.equal((m.peakPrivateBytes - m.baselinePrivateBytes) / 1048576, 231); assert.equal(m.incrementalPrivateMiB, 231);
  assert.equal(m.validConversionSamples, 95714); assert.equal(m.unavailableConversionSamples, 22); assert.equal(m.acceptance, false);
  const compressed = await read(proof.durableCheckpoint.path); assert.equal(sha(compressed), proof.durableCheckpoint.sha256);
  const restored = gunzipSync(compressed, { maxOutputLength: 2097152 }); assert.equal(sha(restored), proof.durableCheckpoint.restoredSha256);
  const checkpoint = JSON.parse(restored); assert.deepEqual(checkpoint.baseline, raw.blankBaseline); assert.equal(checkpoint.coverageThroughSequence, 98703);
  for (const phase of raw.nativeMemory.phases) { const actual = checkpoint.native.phases.find(row => row.phase === phase.phase); assert.deepEqual(actual.peak, phase.peak); assert.equal(actual.unavailableSamples, phase.unavailableSamples); }
  const supervisor = JSON.parse(await read(proof.supervisor.path)); assert.equal(supervisor.childExit.code, 0); assert.equal(supervisor.conversionAcceptance, false);
  for (const field of ["fullOriginalAcceptance", "completeChromiumMemoryAcceptance", "speedGainProven", "publicAcceptance"]) assert.equal(proof[field], false);
});
test("365 current/executed pre/post sources join, independent protected whole SHA retained,26 owned birth identities absent and scratch removed", async () => {
  const { proof, terminal } = await records(), archive = await materializeLayeredFullSourceArchive(root, proof.sourceArchive);
  assert.equal(Object.keys(archive.sourcePins).length, 365); assert.deepEqual(archive.sourcePins, terminal.sourcePins); assert.deepEqual(terminal.sourcePins, terminal.postSourcePins);
  assert.equal(proof.ownedBirthExitChecks.length, 26); assert.ok(proof.ownedBirthExitChecks.every(row => row.ownedBirthAbsent));
  assert.equal(proof.protectedOriginal.bytes, 2958573265); assert.equal(proof.protectedOriginal.sha256, "31f36695b5b44c62125a9e4264e84dc085accd21c02cc3487aae597f54b9db34");
  for (const field of ["mediaProfileRuntimeRemoved", "generatedDistRestored", "protectedFixtureUnchanged", "observerStopped", "sampledChromeRootStopped"]) assert.equal(proof.cleanup[field], true);
  for (const file of [terminal.wrapper, terminal.candidateDirectory, terminal.candidate.runtimeDirectory]) await assert.rejects(access(file), { code: "ENOENT" });
  assert.equal(sha(await read(proof.ownSource.path)), proof.ownSource.sha256); assert.equal(sha(Buffer.from(proof.ownSource.preimage, "base64")), proof.ownSource.sha256);
});
