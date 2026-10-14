// Actual failed full-original evidence, never a small-fixture acceptance stand-in.
import assert from "node:assert/strict";
import { access, readFile } from "node:fs/promises";
import path from "node:path";
import { gunzipSync } from "node:zlib";
import test from "node:test";
import { sha } from "../scripts/lib/stable-ui-headless-baseline-recipe.mjs";
import { materializeLayeredFullSourceArchive } from "../scripts/lib/packet-largest-idle-full-sources.mjs";
import { validateCompositeAllocationFailureRecord } from "../scripts/lib/packet-largest-idle-full-failure.mjs";
const root = path.resolve(import.meta.dirname, ".."), read = file => readFile(path.join(root, file));
const analysis = JSON.parse(await read("evidence/2026-10-13T01-28-09-516Z-packet-largest-idle-full-terminal-analysis.json"));
const terminalBytes = await read(analysis.terminal.path), terminal = JSON.parse(terminalBytes);
assert.equal(sha(terminalBytes), analysis.terminal.sha256);
async function restore(row, maximum) {
  const zipped = await read(row.path); assert.equal(zipped.length, row.bytes); assert.equal(sha(zipped), row.sha256);
  const raw = gunzipSync(zipped, { maxOutputLength: maximum }); assert.equal(raw.length, row.restoredBytes); assert.equal(sha(raw), row.restoredSha256);
  return JSON.parse(raw);
}
const raw = await restore(analysis.rawArchive, 33554432);
test("actual full source fails demux realloc after34348 frames, not packet path, invented request size or full fidelity acceptance", () => {
  assert.equal(terminal.candidate.status, "failed"); assert.equal(terminal.candidate.actualExitCode, 1);
  assert.equal(terminal.candidate.completedConversions, 0); assert.equal(raw.runs.length, 1);
  assert.equal(raw.runs[0].independentValidation, null); assert.equal(raw.runs[0].state.jobState, "error");
  assert.equal(raw.splitFinalSamples[0].frames, 34348); assert.equal(raw.splitFinalSamples[0].completedPackets, 34348);
  assert.equal(analysis.elapsedMs, 1446197.2850000039); assert.equal(analysis.partialOutputBytesDeleted, 626767162);
  const abort = raw.abortDiagnostic.records[0]; assert.deepEqual(abort, analysis.nativeFailure.abortRecord);
  validateCompositeAllocationFailureRecord(abort);
  for (const token of ["emscripten_builtin_realloc", "av_realloc", "av_buffer_realloc", "ebml_parse", "matroska_parse_cluster"]) assert.ok(abort.stack.includes(token), token);
  assert.equal(abort.qualifiedPacketCallPath, false); assert.equal(abort.qualifiedDirectBufferCallPath, false); assert.equal(abort.qualifiedPoolCallPath, false);
  assert.equal(abort.failedIndividualAllocationBytes, null); assert.equal(abort.wrapperRequestedBytes, null); assert.equal(abort.allocatorFreeBlocks, null);
  assert.equal(abort.validatedScalarWords, 0); assert.equal(analysis.nativeFailure.requestedHeapExtentBytes, 33759232);
  assert.deepEqual(raw.inputReadFailureSamples, []); assert.deepEqual(raw.forbiddenRequests, []);
  assert.equal(raw.asyncifyStorageFinalSamples[0].frees, 0); assert.equal(raw.asyncifyStorageFinalSamples[0].retainedBytes, 262156);
  assert.equal(raw.asyncifyStorageFinalSamples[0].acquisitions, 4746); assert.equal(raw.asyncifyStorageFinalSamples[0].abortedReleaseDeferredUntilWorkerTermination, true);
});
test("failed-window exact complete-tree230.824MiB is not acceptance; distinct sample cutoffs/null startup errors retained", async () => {
  const memory = analysis.failedWindowMemory;
  assert.equal(memory.incrementalPrivateMiB, (485535744 - 243499008) / 1048576); assert.equal(memory.incrementalPrivateMiB, 230.82421875);
  assert.equal(memory.acceptance, false); assert.equal(memory.validConversionPhaseSamples, 13249); assert.equal(memory.runNativePeakSnapshotSamples, 13254);
  assert.equal(memory.snapshotCutoffCountsKeptDistinct, true); assert.equal(memory.unavailableStartupSamples, 2);
  const checkpoint = await restore(analysis.durableCheckpoint, 2097152); assert.deepEqual(checkpoint.baseline, raw.blankBaseline);
  assert.equal(checkpoint.coverageThroughSequence, raw.nativeMemory.sequence);
  for (const row of raw.nativeMemory.phases) {
    const { unavailableExamples, ...persisted } = row;
    assert.deepEqual(checkpoint.native.phases.find(x => x.phase === row.phase), persisted);
    const joined = analysis.durableCheckpoint.phases.find(x => x.phase === row.phase);
    assert.deepEqual(joined.rawUnavailableExamples, unavailableExamples); assert.equal(joined.unavailableExamplesStoredInCheckpoint, false);
  }
  const startup = raw.nativeMemory.phases.find(x => x.phase === "blank-startup-settle"); assert.equal(startup.unavailableExamples.length, 2);
  for (const row of startup.unavailableExamples) { assert.equal(row[3], null); assert.equal(row[4], null); }
  assert.equal(raw.nativeMemory.receiptClockFence.samplesDropped, 0); assert.equal(raw.nativeMemory.receiptClockFence.timestampsRewritten, 0);
  for (const flag of ["fullOriginalAcceptance", "publicAcceptance", "completeChromiumMemoryAcceptance", "speedGainProven"]) assert.equal(analysis[flag], false);
});
test("actual439 pre/post/current executed preimages recover with unchanged380 legacy and59 supplemental sources", async () => {
  const archive = await materializeLayeredFullSourceArchive(root, analysis.sourceArchive);
  assert.equal(Object.keys(archive.sourcePreimages).length, 439); assert.deepEqual(archive.sourcePins, terminal.sourcePins);
  assert.deepEqual(terminal.sourcePins, terminal.postSourcePins); assert.deepEqual(raw.sourceHashes, terminal.sourcePins);
  assert.equal(archive.allPreimagesRecovered, true); assert.equal(archive.legacyBytesRewritten, false);
  assert.equal(analysis.ownSource.sha256, sha(await read(analysis.ownSource.path)));
  assert.equal(analysis.ownSource.sha256, sha(Buffer.from(analysis.ownSource.preimage, "base64")));
});
test("actual cleanup joins29 absent owned births, whole protected SHA, owned dirs gone; supervisor0 is not conversion success", async () => {
  const supervisorBytes = await read(analysis.supervisor.path); assert.equal(sha(supervisorBytes), analysis.supervisor.sha256);
  const supervisor = JSON.parse(supervisorBytes); assert.equal(supervisor.childExit.code, 0); assert.equal(supervisor.runtimeRemoved, true);
  assert.equal(supervisor.conversionAcceptance, false); assert.equal(analysis.ownedBirthExitChecks.length, 29);
  for (const row of analysis.ownedBirthExitChecks) assert.equal(row.ownedBirthAbsent, true);
  assert.deepEqual(terminal.protectedBefore, terminal.protectedAfter); assert.deepEqual(analysis.protectedOriginal, terminal.protectedAfter);
  assert.equal(analysis.protectedOriginal.sha256, "31f36695b5b44c62125a9e4264e84dc085accd21c02cc3487aae597f54b9db34");
  for (const directory of [terminal.wrapper, terminal.candidateDirectory, raw.runtimeDirectory, supervisor.runtimeDirectory]) await assert.rejects(access(directory), { code: "ENOENT" });
  await assert.rejects(access(raw.nativeMemory.durableCheckpoint.file), { code: "ENOENT" });
  for (const field of ["mediaProfileRuntimeRemoved", "generatedDistRestored", "protectedFixtureUnchanged", "observerStopped", "sampledChromeRootStopped"]) assert.equal(raw.cleanup[field], true);
});
