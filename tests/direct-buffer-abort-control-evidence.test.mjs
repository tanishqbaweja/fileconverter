// Held preparation is never relabelled as an actual browser/OOM control.
import assert from "node:assert/strict";
import { access, readFile } from "node:fs/promises";
import path from "node:path";
import test from "node:test";
import { gunzipSync } from "node:zlib";
import { sha } from "../scripts/lib/stable-ui-headless-baseline-recipe.mjs";
const root = path.resolve(import.meta.dirname, ".."), read = file => readFile(path.join(root, file));
const held = JSON.parse(await read("evidence/2026-10-11T11-39-18-203Z-direct-buffer-abort-control-executed-sources.json"));
const executed = JSON.parse(await read("evidence/2026-10-11T11-43-59-302Z-direct-buffer-abort-control-executed-sources.json"));
const proofBytes = await read(executed.proof.path), proof = JSON.parse(proofBytes);
async function restore(record) {
  const zipped = await read(record.path); assert.equal(zipped.length, record.bytes); assert.equal(sha(zipped), record.sha256);
  const bytes = gunzipSync(zipped, { maxOutputLength: 2097152 });
  assert.equal(bytes.length, record.restoredBytes); assert.equal(sha(bytes), record.restoredSha256); return JSON.parse(bytes);
}
test("held source preparation preserves actual38 current/preimages and reports zero browsers with unchanged safety gate", async () => {
  assert.equal(held.status, "held-before-browser-import-insufficient-host-memory");
  assert.equal(held.browserDriverImported, false); assert.equal(held.browsersLaunched, 0);
  assert.equal(held.proof, null); assert.equal(held.failure, null); assert.equal(held.publicAcceptance, false);
  assert.equal(held.browserConversionsPerformed, 0); assert.equal(held.protectedSourceRead, false);
  assert.equal(held.launchHostPreflight.freeVirtualBytes, 2004074496);
  assert.equal(held.launchHostPreflight.requiredVirtualBytes, 2147483648);
  assert.equal(held.launchHostPreflight.safeToStart, false);
  assert.equal(held.launchHostPreflight.primaryMemoryFormulaChanged, false);
  assert.deepEqual(held.sourcePins, held.postSourcePins); assert.equal(Object.keys(held.sourcePins).length, 38);
  const sources = await restore(held.archive); assert.deepEqual(sources.sourcePins, held.sourcePins);
  for (const [file, hash] of Object.entries(held.sourcePins)) {
    assert.equal(sha(await read(file)), hash, file); assert.equal(sha(Buffer.from(sources.preimages[file], "base64")), hash, file);
  }
  assert.equal(sha(sources.generated), sources.generatedSha256); assert.equal(sha(sources.worker), sources.workerSha256);
  assert.equal(sources.exportOnlyControl.originalSha256, "86704920f30ed243240614df92d05deba9f76c33e739a927903677b677f8a8ec");
  assert.equal(sources.exportOnlyControl.onlyExportSectionChanged, true);
  assert.ok(sources.exportOnlyControl.sections.filter(section => section.id !== 7).every(section => section.originalSha256 === section.outputSha256));
  assert.equal(held.syntheticExportOnlyBinaryRemovedWithCallerScratch, true);
  await assert.rejects(access(held.ownedCaller), { code: "ENOENT" });
});
test("initial preflight failure preserves old exact source rather than claiming missing dynamic metrics", async () => {
  const failed = JSON.parse(await read("evidence/2026-10-11T11-37-14-140Z-direct-buffer-abort-control-preflight-failure.json"));
  assert.equal(failed.browsersLaunched, 0); assert.equal(failed.browserConversionsPerformed, 0);
  assert.equal(failed.actualFailingHostValuesRetained, false); assert.equal(failed.publicAcceptance, false);
  assert.equal(failed.subsequentReadOnlyHostRecheck.safeToStart, false);
  const source = await restore(failed.archive);
  for (const [file, hash] of Object.entries(failed.sourcePins)) assert.equal(sha(Buffer.from(source.preimages[file], "base64")), hash, file);
  const caller = "scripts/check-direct-buffer-abort-control.mjs";
  assert.notEqual(failed.sourcePins[caller], held.sourcePins[caller], "Changed preflight retention is separately archived, not rewritten");
  assert.equal(failed.ownedCallerAbsent, true); await assert.rejects(access(failed.ownedCaller), { code: "ENOENT" });
});
test("actual browser control joins proof, all38 executed preimages and unchanged non-export Wasm sections", async () => {
  assert.equal(sha(proofBytes), executed.proof.sha256);
  assert.equal(executed.status, "actual-synthetic-direct-buffer-control-executed-sources-not-media-acceptance");
  assert.equal(executed.browserDriverImported, true); assert.equal(executed.launchHostPreflight.safeToStart, true);
  assert.equal(executed.launchHostPreflight.requiredVirtualBytes, 2147483648);
  assert.equal(executed.failure, null); assert.equal(proof.status, "passed-synthetic-abort-control");
  assert.deepEqual(executed.sourcePins, executed.postSourcePins);
  assert.deepEqual(executed.sourcePins, held.sourcePins, "Safe launch uses the same sources as the held preparation");
  assert.equal(Object.keys(executed.sourcePins).length, 38);
  const sources = await restore(executed.archive);
  assert.deepEqual(sources.sourcePins, executed.sourcePins);
  for (const [file, hash] of Object.entries(executed.sourcePins)) {
    assert.equal(sha(await read(file)), hash, file);
    assert.equal(sha(Buffer.from(sources.preimages[file], "base64")), hash, file);
  }
  for (const [file, hash] of Object.entries(proof.sourcePins)) assert.equal(executed.sourcePins[file], hash, file);
  // Artifact build provenance is historical, separate from actual38 runtime pins.
  const buildBytes = await read("evidence/mpeg2-single-idle-build-37986418102.json");
  assert.equal(sha(buildBytes), "de35c69f291584d1c0e8f1f5bae44a53edfc5031a208d47ea3edde54024062b1");
  const build = JSON.parse(buildBytes);
  assert.deepEqual(proof.decoderArtifactSources, build.manifest.sources);
  assert.equal(build.manifest.artifacts["within-mpeg2-split.wasm"], proof.exportOnlyControl.originalSha256);
  const manifestRecord = build.files.find(row => row.file === "build-manifest.json");
  const manifestBytes = await read("work/mpeg2-single-idle-37986418102/build-manifest.json");
  assert.equal(manifestBytes.length, manifestRecord.bytes); assert.equal(sha(manifestBytes), manifestRecord.sha256);
  assert.deepEqual(JSON.parse(manifestBytes), build.manifest);
  const historicalWorkflow = ".github/workflows/reproduce-ffmpeg-nondocker.yml";
  for (const [file, hash] of Object.entries(proof.decoderArtifactSources)) {
    if (file === historicalWorkflow) {
      assert.equal(hash, "2710248aa1eb4d9778cfb8b56c69ddf9e616512e67889aec0fce9cfbf8d885ef");
      assert.equal(sha(await read(file)), "cda0b434adc7dd36109b4a2cc63fe726a507889cf6d1c0f5862d5d78dbf5c965");
    } else assert.equal(sha(await read(file)), hash, file);
  }
  assert.equal(sha(sources.generated), sources.generatedSha256);
  assert.equal(sha(sources.worker), sources.workerSha256);
  assert.equal(sources.worker, proof.workerSource); assert.equal(sources.workerSha256, proof.workerSourceSha256);
  assert.deepEqual(sources.exportOnlyControl, proof.exportOnlyControl);
  const control = proof.exportOnlyControl;
  assert.equal(control.originalSha256, "86704920f30ed243240614df92d05deba9f76c33e739a927903677b677f8a8ec");
  assert.equal(control.controlSha256, proof.result.actualBinarySha256);
  assert.equal(control.onlyExportSectionChanged, true); assert.equal(control.allCodeDataTypesImportsTablesMemoryExact, true);
  assert.equal(control.originalCompiledCoreChanged, false); assert.equal(control.usableForMediaOrAcceptance, false);
  assert.equal(control.additions.length, 1);
  assert.deepEqual(control.additions[0], { originalName: "av_buffer_allocz", exportName: "control_buffer_allocz",
    params: ["i32"], functionIndex: 4187,
    originalBodySha256: "283b95afe8ff659052651684fde252e76752b74684931c744af2f64beccfceee" });
  for (const section of control.sections) if (section.id !== 7) {
    assert.equal(section.unchanged, true); assert.equal(section.originalSha256, section.outputSha256);
    assert.equal(section.originalBytes, section.outputBytes);
  }
});
test("real native fatal captures bounded header-only inventory, preserves previous callback and leaves original cause unknown", () => {
  const { loaded, terminal, symbolizedAbortFrames } = proof.result, row = terminal.emitted;
  assert.equal(loaded.heapBytes, 33554432); assert.equal(terminal.heapBytes, loaded.heapBytes);
  assert.equal(loaded.shared, true); assert.equal(loaded.originIsolated, true);
  assert.equal(loaded.capture.captureStarted, false); assert.equal(loaded.capture.first, null);
  assert.equal(terminal.syntheticRequestedAllocationBytes, 33554432); assert.equal(terminal.converterInvoked, false);
  assert.equal(terminal.originalCalls, 1); assert.equal(terminal.beforeLimit, terminal.afterLimit);
  assert.match(terminal.failure.message, /^Aborted\(/);
  assert.equal(terminal.capture.nativeErrorSuppressed, false); assert.equal(terminal.capture.emitFailure, null);
  assert.equal(terminal.capture.maximumRecords, 1); assert.equal(terminal.capture.queuedRecords, 0);
  assert.deepEqual(terminal.capture.first, row);
  assert.equal(row.qualifiedDirectBufferCallPath, true); assert.equal(row.stackTruncated, false);
  assert.equal(row.stackLimitRestored, true); assert.equal(row.unavailable, null);
  assert.equal(row.actualAllocatorRoot, 1786520); assert.equal(row.allocatorFreeBlocksUnavailable, null);
  assert.deepEqual(symbolizedAbortFrames.map(frame => [frame.functionIndex, frame.functionNameFromActualBinary]),
    [[4440, "sbrk"], [4435, "emscripten_builtin_malloc"], [4470, "__wrap_posix_memalign"],
      [4311, "av_malloc"], [4187, "av_buffer_allocz"]]);
  const inventory = row.allocatorFreeBlocks;
  assert.equal(inventory.complete, true); assert.equal(inventory.headerWordsRead, 44);
  assert.equal(inventory.maximumHeaderWords, 32768); assert.equal(inventory.maximumChunks, 4096);
  assert.equal(inventory.totalFreeChunkBytes, 3136); assert.equal(inventory.largestFreeChunkBytes, 3136);
  assert.equal(inventory.freeChunks, 1); assert.equal(inventory.unclaimedMemoryAboveSegmentBytes, 31367168);
  for (const key of ["heapCopied", "payloadRead", "nativeFunctionsCalled", "allocatorMutated", "fragmentationCauseProven"])
    assert.equal(inventory[key], false, key);
  for (const key of ["failedIndividualAllocationBytes", "heapLiveBytes", "poolRequest"]) assert.equal(row[key], null, key);
  assert.equal(inventory.liveFrameCount, null); assert.equal(row.originalFailureCauseProven, false);
  assert.equal(row.fragmentationCauseProven, false);
});
test("actual control cleanup and privacy do not become conversion, stable baseline or public acceptance", async () => {
  for (const key of ["failure", "closeRequestError", "serverError", "chromeError"]) assert.equal(proof[key], null, key);
  assert.deepEqual(proof.forbiddenRequests, []); assert.equal(proof.browserConversionsPerformed, 0);
  for (const key of ["protectedSourceRead", "nativeConverterUsed", "primaryMemoryAcceptance", "publicAcceptance", "heapGrowthAllowed"])
    assert.equal(proof[key], false, key);
  assert.equal(proof.primaryIncrementalPrivateMiB, null);
  assert.ok(proof.flags.includes("--headless=new"));
  assert.deepEqual(proof.snapshots.map(row => row.phase),
    ["blank-control-snapshot-NOT-stable-baseline", "loaded-control-snapshot-NOT-peak-acceptance"]);
  assert.deepEqual(proof.cleanup.errors, []);
  for (const key of ["workerTerminated", "normalBrowserCloseRequested", "serverClosed", "allSampledNativeBirthsAbsent", "runtimeProfileRemoved"])
    assert.equal(proof.cleanup[key], true, key);
  assert.equal(proof.cleanup.checkedNativeIdentities, 11); assert.deepEqual(proof.cleanup.observedProcesses, []);
  assert.equal(proof.cleanup.rootExit.status, "owned-identity-absent"); assert.equal(proof.cleanup.rootExit.noProcessesKilled, true);
  assert.equal(executed.syntheticExportOnlyBinaryRemovedWithCallerScratch, true);
  await assert.rejects(access(executed.ownedCaller), { code: "ENOENT" });
  await assert.rejects(access(proof.runtimeDirectory), { code: "ENOENT" });
});
