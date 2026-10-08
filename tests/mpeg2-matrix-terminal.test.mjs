import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { access, readFile } from "node:fs/promises";
import test from "node:test";
import { gunzipSync } from "node:zlib";
import { summarizeMemoryInfraTrace } from "../scripts/lib/partial-largest-blink-type-summary.mjs";
const read = file => readFile(new URL("../" + file, import.meta.url));
const json = async file => JSON.parse(await read(file));
const sha = bytes => createHash("sha256").update(bytes).digest("hex");

test("matrix original attempt is actually terminal251.484MiB failure, not stale running snapshot or accepted output", async () => {
  const p = await json("evidence/mpeg2-matrix-original-2026-10-08.json"), a = await json("evidence/mpeg2-matrix-terminal-analysis-2026-10-08.json");
  assert.equal(p.rawStatus, "failed"); assert.match(p.failure.message, /251\.484375MiB exceeds 250MiB/);
  assert.equal(p.blankBaseline.privateBytes, 241549312); assert.equal(p.nativePeak.privateBytes, 505249792);
  assert.equal((p.nativePeak.privateBytes - p.blankBaseline.privateBytes) / 1048576, 251.484375);
  assert.equal(p.nativePeak.processes.reduce((sum, r) => sum + r.privateBytes, 0), p.nativePeak.privateBytes);
  assert.equal(p.completeOriginalConversions, 0); assert.equal(a.frames, 1721);
  assert.equal(a.metrics.inputBytes, 33777217); assert.equal(a.metrics.outputBytes, 23214284);
  assert.equal(a.metrics.wasmMemoryBytes, 50331648); assert.equal(a.metrics.peakPendingOperations, 1);
  assert.equal(p.runs[0].state.jobState, "running"); assert.equal(p.quiescedBudgetCapture.stateAfter.jobState, "cancelled");
  assert.equal(a.lastSavedRunJobState, "running"); assert.equal(a.actualPostCancelJobState, "cancelled");
  assert.equal(a.actualDecoderAbortRecords, 0); assert.equal(a.originalFailureFreeHeaders, null); assert.equal(a.allocationCauseProven, false);
  assert.equal(a.nativeUnavailableSamples, 1); assert.ok(p.nativePhaseCoverage.every(r => r.unavailableSamples === 0));
  assert.equal(p.publicAcceptance, false); assert.equal(p.originalFullSourceMemoryAcceptance, false);
  assert.equal(a.cleanup.nativeBirths, 22); assert.equal(a.cleanup.allFourOwnedRuntimeDirectoriesAbsent, true);
  assert.equal(a.cleanup.protectedFullPostHashVerified, true);
  for (const [file, hash] of Object.entries(p.sourcePins)) assert.equal(sha(await read(file)), hash, file);
  for (const [file, hash] of Object.entries(a.sourcePins)) assert.equal(sha(await read(file)), hash, file);
});

test("matrix failure preserves successful delayed dump and renderer jump, not peak-time allocation or live heap proof", async () => {
  const p = await json("evidence/mpeg2-matrix-original-2026-10-08.json"), a = await json("evidence/mpeg2-matrix-terminal-analysis-2026-10-08.json");
  const archive = await read(a.rawTraceArchive.path); assert.equal(archive.length, 303780); assert.equal(sha(archive), a.rawTraceArchive.sha256);
  const trace = gunzipSync(archive, { maxOutputLength: 16 * 1048576 });
  assert.equal(trace.length, 4674185); assert.equal(sha(trace), a.serializedTrace.sha256);
  const session = p.rendererAttributionResult.sessions[0].trace;
  assert.deepEqual(summarizeMemoryInfraTrace(JSON.parse(trace), session.dumps), session.allocatorSummary);
  assert.equal(a.globalDumpSucceeded, true); assert.equal(a.actualWorkerClosedBeforeDump, true);
  assert.equal(a.adjacentNativeDelta.elapsedMs, 111); assert.equal(a.adjacentNativeDelta.treeDeltaPrivateBytes, 57626624);
  assert.equal(a.adjacentNativeDelta.processDeltas.find(r => r.pid === 37936).deltaPrivateBytes, 57622528);
  assert.equal(a.delayedTarget.heaps[0].residentBytes, 65405008); assert.equal(a.delayedTarget.heaps[0].pooledBytes, 49545216);
  assert.equal(a.delayedTarget.largestSixTypes[0].allocatedObjectsBytes, 1757952); assert.equal(a.delayedTarget.largestSixTypes[0].objectCount, 1008);
  assert.equal(a.delayedTarget.selection.partialInventory, true); assert.equal(a.liveHeapBytes, null);
});

test("matrix terminal raw report removed only after exact lossless archive/identity verification, companions retained", async () => {
  const c = await json("evidence/mpeg2-matrix-terminal-compaction-2026-10-08.json");
  const archive = await read(c.archive.path); assert.equal(archive.length, c.archive.bytes); assert.equal(sha(archive), c.archive.sha256);
  const raw = gunzipSync(archive, { maxOutputLength: c.bounds.maximumRawBytes });
  assert.equal(raw.length, 2684761); assert.equal(sha(raw), c.raw.sha256); assert.equal(JSON.parse(raw).status, "failed");
  assert.equal(c.reconstructedRawSizeAndSha256Verified, true); assert.equal(c.rawIdentityRevalidatedBeforeRemoval, true);
  assert.equal(c.uncompressedRawRemoved, true); assert.equal(c.protectedSourceRead, false); assert.equal(c.browserConversionsPerformed, 0);
  await assert.rejects(access(new URL("../" + c.raw.path, import.meta.url)), { code: "ENOENT" });
  for (const r of c.companions) { const bytes = await read(r.path); assert.equal(bytes.length, r.bytes); assert.equal(sha(bytes), r.sha256); }
  for (const [file, hash] of Object.entries(c.sourcePins)) assert.equal(sha(await read(file)), hash, file);
});
