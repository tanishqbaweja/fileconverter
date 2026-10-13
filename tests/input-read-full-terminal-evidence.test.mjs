import assert from "node:assert/strict";
import { access, readFile } from "node:fs/promises";
import path from "node:path";
import { gunzipSync } from "node:zlib";
import test from "node:test";
import { sha } from "../scripts/lib/stable-ui-headless-baseline-recipe.mjs";
import { materializeLayeredFullSourceArchive } from "../scripts/lib/input-read-layered-source-archive.mjs";
const root = path.resolve(import.meta.dirname, ".."), read = file => readFile(path.join(root, file));
const stamp = "2026-10-12T19-50-01-210Z";
async function records() {
  const proof = JSON.parse(await read(`evidence/${stamp}-input-read-full-terminal-analysis.json`));
  const terminalBytes = await read(proof.terminal.path); assert.equal(sha(terminalBytes), proof.terminal.sha256);
  const zipped = await read(proof.rawArchive.path); assert.equal(sha(zipped), proof.rawArchive.sha256);
  const bytes = gunzipSync(zipped, { maxOutputLength: 33554432 });
  assert.equal(bytes.length, proof.rawArchive.restoredBytes); assert.equal(sha(bytes), proof.rawArchive.restoredSha256);
  return { proof, terminal: JSON.parse(terminalBytes), raw: JSON.parse(bytes) };
}
test("full original reached250053 frames then packet malloc failed, no input-read failure or invented malloc size", async () => {
  const { proof, terminal, raw } = await records();
  assert.equal(terminal.candidate.actualExitCode, 1); assert.equal(proof.completedValidatedConversions, 0);
  assert.equal(proof.requestedRuns, 3); assert.equal(proof.independentFullFidelityValidation, null);
  assert.equal(proof.elapsedMs, 10430703.055); assert.equal(proof.partialOutputBytesDeleted, 4943266688);
  assert.equal(proof.lastBridge.frames, 250053); assert.equal(proof.lastBridge.completedPackets, 250052);
  const failure = proof.nativeFailure;
  assert.match(failure.abortRecord.stack, /mpeg2_packets/); assert.match(failure.abortRecord.stack, /__wrap_posix_memalign/);
  assert.equal(failure.requestedHeapExtentBytes, 33615872);
  for (const key of ["failedIndividualAllocationBytes", "failedRequestOwner", "allocationLifetimeOrFragmentationCause"]) assert.equal(failure[key], null);
  assert.equal(failure.previous244859FrameSuspensionBoundaryExceeded, true);
  assert.deepEqual(raw.inputReadFailureSamples, []); assert.deepEqual(raw.forbiddenRequests, []);
  assert.equal(proof.suspensionLifecycle.allocations, 1); assert.equal(proof.suspensionLifecycle.frees, 0);
  assert.equal(proof.suspensionLifecycle.acquisitions, 36134); assert.equal(proof.suspensionLifecycle.retainedBytes, 262156);
  assert.equal(proof.suspensionLifecycle.abortedReleaseDeferredUntilWorkerTermination, true);
  assert.equal(failure.suspensionStorageFreedByNativeCall, false);
});
test("failed-window234.996MiB preserves null samples and durable peaks; supervisor exit0 is not acceptance", async () => {
  const { proof, raw } = await records(), memory = proof.failedWindowMemory;
  assert.equal(memory.baselinePrivateBytes, 238272512); assert.equal(memory.peakPrivateBytes, 484683776);
  assert.equal((memory.peakPrivateBytes - memory.baselinePrivateBytes) / 1048576, 234.99609375);
  assert.equal(memory.validConversionSamples, 95383); assert.equal(memory.unavailableConversionSamples, 2); assert.equal(memory.acceptance, false);
  const compressed = await read(proof.durableCheckpoint.path); assert.equal(sha(compressed), proof.durableCheckpoint.sha256);
  const bytes = gunzipSync(compressed, { maxOutputLength: 2097152 }); assert.equal(sha(bytes), proof.durableCheckpoint.restoredSha256);
  const checkpoint = JSON.parse(bytes); assert.deepEqual(checkpoint.baseline, raw.blankBaseline); assert.equal(checkpoint.coverageThroughSequence, 98399);
  for (const phase of raw.nativeMemory.phases) {
    const actual = checkpoint.native.phases.find(row => row.phase === phase.phase);
    assert.deepEqual(actual.peak, phase.peak); assert.equal(actual.unavailableSamples, phase.unavailableSamples);
  }
  const bytesSupervisor = await read(proof.supervisor.path); assert.equal(sha(bytesSupervisor), proof.supervisor.sha256);
  const supervisor = JSON.parse(bytesSupervisor); assert.equal(supervisor.childExit.code, 0); assert.equal(supervisor.conversionAcceptance, false);
  for (const key of ["fullOriginalAcceptance", "completeChromiumMemoryAcceptance", "speedGainProven", "publicAcceptance"]) assert.equal(proof[key], false);
});
test("380 executed/current source pins, protected whole hash,25 absent owned births and finally cleanup join", async () => {
  const { proof, terminal } = await records(), archive = await materializeLayeredFullSourceArchive(root, proof.sourceArchive);
  assert.equal(Object.keys(archive.sourcePins).length, 380); assert.deepEqual(archive.sourcePins, terminal.sourcePins);
  assert.deepEqual(terminal.postSourcePins, terminal.sourcePins);
  assert.equal(proof.ownedBirthExitChecks.length, 25); assert.ok(proof.ownedBirthExitChecks.every(row => row.ownedBirthAbsent));
  assert.equal(proof.protectedOriginal.bytes, 2958573265);
  assert.equal(proof.protectedOriginal.sha256, "31f36695b5b44c62125a9e4264e84dc085accd21c02cc3487aae597f54b9db34");
  for (const key of ["mediaProfileRuntimeRemoved", "generatedDistRestored", "protectedFixtureUnchanged", "observerStopped", "sampledChromeRootStopped"]) assert.equal(proof.cleanup[key], true);
  for (const file of [terminal.wrapper, terminal.candidateDirectory, terminal.candidate.runtimeDirectory]) await assert.rejects(access(file), { code: "ENOENT" });
  assert.equal(sha(await read(proof.ownSource.path)), proof.ownSource.sha256);
  assert.equal(sha(Buffer.from(proof.ownSource.preimage, "base64")), proof.ownSource.sha256);
});
