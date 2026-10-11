// Post-audit witness; never edit the two source-frozen audit files.
import assert from "node:assert/strict";
import { access, readFile } from "node:fs/promises";
import path from "node:path";
import test from "node:test";
import { sha } from "../scripts/lib/stable-ui-headless-baseline-recipe.mjs";
import { materializeLayeredFullSourceArchive } from "../scripts/lib/layered-full-source-archive.mjs";
const root = path.resolve(import.meta.dirname, ".."), read = file => readFile(path.join(root, file));
const bytes = await read("evidence/2026-10-11T18-50-12-867Z-alignment16-original-full-terminal-analysis.json"), proof = JSON.parse(bytes);
test("actual terminal audit joins326 current/pre/post/preimages and both byte-exact audit sources", async () => {
  assert.equal(sha(bytes), "b84b2b9cbb63fd201c7faf07d71c53f681387a1ac7f049ff6a37d6110a4cf775");
  assert.equal(proof.failure, null); assert.equal(proof.all326CurrentPrePostPreimageJoins, true);
  const terminalBytes = await read(proof.terminal.path); assert.equal(sha(terminalBytes), proof.terminal.sha256);
  const terminal = JSON.parse(terminalBytes), archive = await materializeLayeredFullSourceArchive(root, proof.sourceArchive);
  assert.deepEqual(archive.sourcePins, terminal.sourcePins); assert.deepEqual(terminal.postSourcePins, terminal.sourcePins);
  assert.equal(Object.keys(archive.sourcePreimages).length, 326);
  assert.equal(Object.keys(proof.sourcePins).length, 2); assert.deepEqual(proof.sourcePins, proof.postSourcePins);
  for (const [file, hash] of Object.entries(proof.sourcePins)) {
    assert.equal(sha(await read(file)), hash); assert.equal(sha(Buffer.from(proof.sourcePreimages[file].data, "base64")), hash);
  }
});
test("actual399383B first-malloc OOM and full native peak are retained but partial output proves neither quality nor acceptance", () => {
  const result = proof.result;
  assert.equal(result.elapsedMs, 11292672.679999977); assert.equal(result.frames, 250047); assert.equal(result.generatedPartialOutputBytes, 4943266688);
  assert.equal(result.failedAllocation.wrapperRequestedBytes, 399383); assert.equal(result.failedAllocation.phase, "fast-malloc-pending");
  assert.equal(result.failedAllocation.allocatorFreeBlocks.totalFreeChunkBytes, 2591184);
  assert.equal(result.failedAllocation.allocatorFreeBlocks.largestFreeChunkBytes, 213728);
  assert.equal(result.failedAllocation.heapLiveBytes, null); assert.equal(result.failedAllocation.fragmentationCauseProven, false);
  assert.equal(result.native.observedIncrementalPrivateMiB, (480133120 - 241111040) / 1024 ** 2);
  assert.equal(result.native.observedIncrementalPrivateMiB, 227.94921875); assert.equal(result.rowsCountedWithoutDropping, 106311);
  assert.equal(result.completedConversions, 0); assert.equal(result.numericSsim, null); assert.equal(result.acceptedOutputBytes, 0);
  for (const field of ["fullOriginalAcceptance", "completeChromiumMemoryAcceptance", "conversionSpeedAcceptance", "publicAcceptance"]) assert.equal(result[field], false);
  assert.equal(result.sameFailedConfigurationShouldBeRepeated, false);
});
test("historical10-second browser-exit failure is not rewritten; later23 birth identities absent and owned data gone", async () => {
  assert.equal(proof.historicalCleanupTimeoutNotRewritten, true);
  assert.equal(proof.historicalCleanup.sampledChromeRootStopped, false); assert.equal(proof.historicalCleanup.errors.length, 1);
  assert.equal(proof.lateIndependentlyObservedOwnedAbsence.length, 23);
  for (const row of proof.lateIndependentlyObservedOwnedAbsence) {
    assert.equal(row.status, "owned-identity-absent"); assert.equal(row.noProcessesKilled, true); assert.equal(row.unavailableIsNotZero, true);
  }
  assert.deepEqual(proof.protectedBefore, proof.protectedAfter); assert.equal(proof.ownedScratchAbsentNow, true); assert.equal(proof.stockUiRestored, true);
  assert.equal(proof.redundantRawDeletedAfterByteExactArchive, true);
  const terminal = JSON.parse(await read(proof.terminal.path));
  for (const directory of [terminal.wrapper, terminal.candidateDirectory]) await assert.rejects(access(directory), { code: "ENOENT" });
});
