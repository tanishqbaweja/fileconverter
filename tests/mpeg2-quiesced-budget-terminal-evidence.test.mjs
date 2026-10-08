import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { createReadStream } from "node:fs";
import { access, readFile } from "node:fs/promises";
import { Writable } from "node:stream";
import { pipeline } from "node:stream/promises";
import { createGunzip } from "node:zlib";
import test from "node:test";
import { readWasmFunctionNames, symbolizeWasmStack } from "../scripts/lib/wasm-stack-symbols.mjs";

const root = new URL("../", import.meta.url), MiB = 1048576;
const sha = bytes => createHash("sha256").update(bytes).digest("hex");
const proofBytes = await readFile(new URL("evidence/mpeg2-quiesced-budget-original-2026-10-08.json", root));
const proof = JSON.parse(proofBytes);
const analysis = JSON.parse(await readFile(new URL("evidence/mpeg2-quiesced-budget-terminal-analysis-2026-10-08.json", root)));
const compact = JSON.parse(await readFile(new URL("evidence/mpeg2-quiesced-budget-terminal-compaction-2026-10-08.json", root)));
const audit = JSON.parse(await readFile(new URL("evidence/mpeg2-late-refstruct-source-audit-2026-10-08.json", root)));

test("terminal full original aborts decoder heap despite observed full-tree peak below ceiling", () => {
  assert.equal(proof.rawStatus, "failed"); assert.equal(proof.completeOriginalConversions, 0);
  assert.equal(proof.requestedRuns, 3); assert.equal(proof.runs.length, 1);
  assert.equal(proof.runs[0].state.jobState, "error");
  assert.equal(proof.runs[0].independentValidation, null); assert.equal(proof.runs[0].recovery, null);
  assert.equal(proof.blankBaseline.privateBytes, 244510720);
  assert.equal(proof.nativePeak.processes.reduce((sum, p) => sum + p.privateBytes, 0), 498024448);
  assert.equal((proof.nativePeak.privateBytes - proof.blankBaseline.privateBytes) / MiB, 241.76953125);
  assert.equal(proof.nativePeakIncrementalMiB, 241.76953125);
  assert.equal(analysis.input.sha256, sha(proofBytes));
  assert.equal(proof.originalFullSourceMemoryAcceptance, false); assert.equal(proof.conversionSpeedAcceptance, false);
  assert.equal(analysis.publicAcceptance, false); assert.equal(analysis.fullIndependentValidationPerformed, false);
});

test("actual abort frames identify refstruct allocation path without guessing the request size", async () => {
  assert.equal(proof.abortDiagnostic.records.length, 1);
  const abort = proof.abortDiagnostic.records[0], symbols = proof.actualStackSymbols[0];
  const binary = await readFile(new URL("work/mpeg2-split-pipeline-37479749443/within-mpeg2-split.wasm", root));
  assert.equal(sha(binary), symbols.binarySha256);
  assert.deepEqual(symbolizeWasmStack(abort.stack, readWasmFunctionNames(binary)), symbols.frames);
  assert.equal(symbols.frames.length, 12); assert.equal(symbols.omittedWasmFrames, 0);
  assert.deepEqual(symbols.frames.slice(3, 7).map(f => f.functionNameFromActualBinary),
    ["av_malloc", "av_refstruct_pool_get", "alloc_frame", "hevc_receive_frame"]);
  assert.equal(abort.role, "decoder"); assert.equal(abort.failedIndividualAllocationBytes, null);
  assert.equal(abort.heapLiveBytes, null); assert.equal(symbols.causalOriginalAllocationSizeClaim, null);
  assert.equal(analysis.heapExtentIsNotAllocationSize, true); assert.equal(analysis.actualFailedPool, null);
  assert.equal(analysis.fragmentationProven, false); assert.equal(analysis.fixedDecoderHeapBytes, 32 * MiB);
});

test("absent budget failure does not become an invented post-cancel heap dump", () => {
  assert.equal(proof.nativeFailureCapture.firstFailure, null); assert.equal(proof.nativeFailureCapture.callback, null);
  assert.equal(proof.nativeFailureCapture.unavailableSamples, 2);
  assert.equal(analysis.unavailableIsNotZero, true);
  for (const key of ["startedAt", "workerClosedAt", "cancellation", "stateAfter"])
    assert.equal(proof.quiescedBudgetCapture[key], null);
  assert.equal(proof.rendererAttributionResult, null);
  assert.equal(analysis.quiescedCancellationOrDumpExecuted, false);
});

test("partial frames retain bounded pipeline and independently checked terminal cleanup", () => {
  const final = proof.splitFinalSamples[0], metrics = analysis.partialMetrics;
  assert.equal(final.frames, 106112); assert.equal(final.completedPackets, 106112);
  assert.equal(final.decoderMemoryBytes, 32 * MiB); assert.equal(final.encoderMemoryBytes, 16 * MiB);
  for (const key of ["activePackets", "queuedPackets", "queuedFrames", "additionalPixelBufferBytes", "additionalJsPacketBufferBytes"])
    assert.equal(final[key], 0);
  for (const key of ["maxReadChunkBytes", "maxWriteChunkBytes", "peakQueuedBytes"]) assert.equal(metrics[key], 65536);
  assert.equal(metrics.peakPendingOperations, 1); assert.equal(metrics.inputBytes, 1060017306);
  assert.equal(metrics.outputBytes, 1206298852); assert.equal(proof.cleanup.conversionQuiescence.terminalState, "error");
  assert.equal(analysis.cleanup.checkedPids, 24); assert.equal(analysis.cleanup.nativeIdentities, 20);
  assert.deepEqual(analysis.cleanup.observedCurrentProcesses, []);
  for (const key of ["allSampledNativeBirthsAbsent", "helperBirthsAbsent", "bothRuntimeDirectoriesAbsent",
    "ninePrivateAssetsAbsent", "protectedFullPostHashVerified", "noProcessesKilled"])
    assert.equal(analysis.cleanup[key], true);
});

test("executed source pins and exact failed raw report remain recoverable after compaction", async () => {
  assert.equal(sha(proof.generatedSource), proof.generatedSourceSha256);
  assert.equal(sha(proof.generatedTraceHelper), proof.generatedTraceHelperSha256);
  for (const report of [proof, analysis, compact, audit]) for (const [file, hash] of Object.entries(report.sourcePins))
    assert.equal(sha(await readFile(new URL(file, root))), hash, file);
  assert.deepEqual(compact.raw, proof.rawReport); assert.equal(compact.archive.bytes, 569328);
  assert.equal(compact.uncompressedRawRemoved, true); assert.equal(compact.ownedScratchRemoved, true);
  await assert.rejects(access(new URL(compact.raw.path, root)), { code: "ENOENT" });
  const archive = await readFile(new URL(compact.archive.path, root));
  assert.equal(archive.length, compact.archive.bytes); assert.equal(sha(archive), compact.archive.sha256);
  let bytes = 0; const hash = createHash("sha256");
  await pipeline(createReadStream(new URL(compact.archive.path, root), { highWaterMark: 65536 }),
    createGunzip({ chunkSize: 65536 }), new Writable({ highWaterMark: 65536, write(chunk, encoding, done) {
      bytes += chunk.length; if (bytes > 32 * MiB) return done(new Error("Raw bound exceeded"));
      hash.update(chunk); done();
    } }));
  assert.equal(bytes, 18558177); assert.equal(hash.digest("hex"), proof.rawReport.sha256);
  for (const companion of compact.companions) {
    const data = await readFile(new URL(companion.path, root));
    assert.equal(data.length, companion.bytes); assert.equal(sha(data), companion.sha256);
  }
});

test("pinned static-source audit distinguishes both pools from unknown late runtime state", () => {
  assert.equal(audit.upstream.length, 3); assert.equal(audit.allActualCandidateSourcePinsVerified, true);
  assert.equal(audit.verifiedStaticFacts.allocFrameHasExactlyTwoPoolGetSites, true);
  assert.deepEqual(audit.verifiedStaticFacts.poolNamesInSourceOrder, ["tab_mvf", "rpl_tab"]);
  assert.equal(audit.runtimeUnknowns.actualFailedPool, null);
  assert.equal(audit.runtimeUnknowns.failedIndividualAllocationBytes, null);
  assert.equal(audit.runtimeUnknowns.fragmentationProven, false);
  assert.equal(audit.rejectedInspection.callsiteMappingVerified, false);
  assert.equal(audit.browserConversionsPerformed, 0); assert.equal(audit.originalRead, false);
  assert.equal(audit.runtimeFixImplemented, false); assert.equal(audit.primaryMemoryAcceptance, false);
});

test("initial lint warning is retained separately and its exact executed source is reconstructible", async () => {
  const prior = JSON.parse(await readFile(new URL("evidence/mpeg2-late-refstruct-source-audit-prelint-2026-10-08.json", root)));
  const file = "scripts/audit-mpeg2-late-refstruct-source.mjs";
  const current = await readFile(new URL(file, root), "utf8");
  const corrected = "  upstream: upstream.map(record => ({ file: record.file, url: record.url, bytes: record.bytes, sha256: record.sha256 })),";
  const original = "  upstream: upstream.map(({ text: _text, ...record }) => record),";
  assert.equal(current.split(corrected).length, 2);
  assert.equal(sha(current.replace(corrected, original)), prior.sourcePins[file]);
  assert.deepEqual(prior.upstream, audit.upstream);
  assert.deepEqual(prior.runtimeUnknowns, audit.runtimeUnknowns);
  assert.equal(prior.runtimeFixImplemented, false);
});
