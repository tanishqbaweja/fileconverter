import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { access, readFile } from "node:fs/promises";
import path from "node:path";
import test from "node:test";
import { gunzipSync } from "node:zlib";
const root = path.resolve(import.meta.dirname, ".."), sha = b => createHash("sha256").update(b).digest("hex");
const read = async stem => JSON.parse(await readFile(path.join(root, `evidence/mpeg2-hero-width-${stem}-2026-10-08.json`)));

test("actual hero original remains failed256.43359375MiB with all96 executed sources unchanged", async () => {
  const p = await read("original"), a = await read("terminal-analysis");
  assert.equal(p.rawStatus, "failed"); assert.equal(p.completeOriginalConversions, 0);
  assert.equal(a.executedSourcesVerified, 96); assert.equal(a.completedFullOutputs, 0);
  for (const [file, hash] of Object.entries(p.sourcePins)) assert.equal(sha(await readFile(path.join(root, file))), hash, file);
  assert.equal(sha(p.generatedSource), p.generatedSourceSha256); assert.equal(sha(p.generatedTraceHelper), p.generatedTraceHelperSha256);
  assert.equal(p.nativePeak.processes.reduce((n, r) => n + r.privateBytes, 0), 511279104);
  assert.equal(p.blankBaseline.privateBytes, 242388992);
  assert.equal((p.nativePeak.privateBytes - p.blankBaseline.privateBytes) / 1048576, 256.43359375);
  assert.equal(p.limitMiB, 250); assert.equal(p.requestedRuns, 3);
  assert.equal(a.frames, 1631); assert.equal(a.metrics.inputBytes, 33711681); assert.equal(a.metrics.outputBytes, 22959384);
  assert.equal(a.metrics.peakWasmMemoryBytes, 50331648); assert.equal(a.metrics.peakPendingOperations, 1);
  for (const key of ["maxReadChunkBytes", "maxWriteChunkBytes", "peakQueuedBytes"]) assert.equal(a.metrics[key], 65536);
  assert.equal(a.metrics.queuedBytes, 0); assert.equal(a.metrics.pendingOperations, 0);
  assert.equal(p.runs[0].state.jobState, "cancelled"); assert.equal(p.quiescedBudgetCapture.stateAfter.jobState, "cancelled");
  assert.equal(p.runs[0].independentValidation, null); assert.equal(a.actualDecoderAbortRecords, 0);
  assert.equal(a.publicAcceptance, false); assert.equal(a.originalFullSourceAcceptance, false); assert.equal(a.conversionSpeedAcceptance, false);
});

test("actual renderer jump/delayed types cannot certify peak allocation cause; all five runtimes gone", async () => {
  const a = await read("terminal-analysis"), launch = await read("original-launch");
  assert.equal(launch.sessionId, 49484); assert.equal(a.adjacentNativeDelta.elapsedMs, 109);
  assert.equal(a.adjacentNativeDelta.treeDeltaPrivateBytes, 40828928);
  const largest = a.adjacentNativeDelta.processDeltas.toSorted((x, y) => y.deltaPrivateBytes - x.deltaPrivateBytes)[0];
  assert.equal(largest.pid, 20320); assert.equal(largest.deltaPrivateBytes, 40828928);
  assert.deepEqual(a.adjacentNativeDelta.addedIdentities, []); assert.deepEqual(a.adjacentNativeDelta.removedIdentities, []);
  assert.equal(a.delayedTarget.privateBytes, 116854784); assert.equal(a.delayedTarget.heaps[0].allocatedObjectsBytes, 7781760);
  assert.equal(a.delayedTarget.heaps[0].pooledBytes, 51380224); assert.match(a.delayedTarget.largestSixTypes[0].type, /LayoutResult/);
  assert.equal(a.allocationCauseProven, false); assert.equal(a.liveHeapBytes, null);
  assert.equal(a.actualWorkerClosedBeforeDump, true); assert.equal(a.globalTraceReconstructionAndReparseVerified, true);
  assert.equal(a.cleanup.nativeBirths, 21); assert.equal(a.cleanup.allSampledNativeBirthsAbsent, true);
  assert.equal(a.cleanup.helperPidsAbsent, true); assert.equal(a.cleanup.allFiveOwnedRuntimeDirectoriesAbsent, true);
  assert.equal(a.cleanup.protectedFullPostHashVerified, true); assert.equal(a.cleanup.ninePrivateAdditionsAbsent, true);
  for (const directory of launch.observedRepositoryRuntimeDirectories) await assert.rejects(access(path.join(root, directory)), { code: "ENOENT" });
  for (const [file, hash] of Object.entries(a.sourcePins)) assert.equal(sha(await readFile(path.join(root, file))), hash, file);
  const failed = await read("terminal-verifier-preparation-failure");
  assert.equal(failed.independentAnalysisWritten, false); assert.equal(failed.conversionRepeated, false);
  for (const [file, hash] of Object.entries(failed.sourcePins)) assert.equal(sha(await readFile(path.join(root, file))), hash, file);
});

test("terminal compact archive reconstructs exact failed diagnostic, trace and companions remain", async () => {
  const p = await read("original"), a = await read("terminal-analysis"), c = await read("terminal-compaction");
  assert.equal(c.status, "verified-lossless-diagnostic-compaction"); assert.equal(c.uncompressedRawRemoved, true);
  await assert.rejects(access(path.join(root, c.raw.path)), { code: "ENOENT" });
  const archive = await readFile(path.join(root, c.archive.path));
  assert.equal(archive.length, c.archive.bytes); assert.equal(sha(archive), c.archive.sha256);
  const bytes = gunzipSync(archive, { maxOutputLength: 32 * 1048576 });
  assert.equal(bytes.length, p.rawReport.bytes); assert.equal(sha(bytes), p.rawReport.sha256);
  const raw = JSON.parse(bytes); assert.equal(raw.status, "failed"); assert.equal(raw.runs[0].incrementalPrivateMiB, 256.43359375);
  const trace = await readFile(path.join(root, a.rawTraceArchive.path));
  assert.equal(trace.length, a.rawTraceArchive.bytes); assert.equal(sha(trace), a.rawTraceArchive.sha256);
  const serialized = gunzipSync(trace, { maxOutputLength: 16 * 1048576 });
  assert.equal(serialized.length, a.serializedTrace.bytes); assert.equal(sha(serialized), a.serializedTrace.sha256);
  for (const r of c.companions) { const b = await readFile(path.join(root, r.path)); assert.equal(b.length, r.bytes); assert.equal(sha(b), r.sha256); }
  for (const [file, hash] of Object.entries(c.sourcePins)) assert.equal(sha(await readFile(path.join(root, file))), hash, file);
});
