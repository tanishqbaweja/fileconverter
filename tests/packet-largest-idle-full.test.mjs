import assert from "node:assert/strict";
import { access, readFile, unlink, lstat } from "node:fs/promises";
import path from "node:path";
import { spawnSync } from "node:child_process";
import test from "node:test";
import { createOwnedRuntimeScratch } from "../scripts/lib/owned-runtime-scratch.mjs";
import { sha } from "../scripts/lib/stable-ui-headless-baseline-recipe.mjs";
import { loadQualifiedLargestIdleMedia, makeLargestIdleFullCaller, makeLargestIdleFullDriver, makeLargestIdleFullStager,
  createAttemptPlaneCandidate, verifyAttemptPlaneCandidate } from "../scripts/lib/packet-largest-idle-full-recipe.mjs";
import { loadLegacyFullSources, captureLayeredFullSourcePins, writeLayeredFullSourceArchive,
  materializeLayeredFullSourceArchive, SUPPLEMENTAL_LIMITS } from "../scripts/lib/packet-largest-idle-full-sources.mjs";
import { makeInputReadFullCaller } from "../scripts/lib/input-read-full-recipe.mjs";
import { FULL_SOURCE_LAYER_LIMITS } from "../scripts/lib/input-read-layered-source-archive.mjs";
import { createCompositeAllocationAbortCapture } from "../scripts/lib/packet-largest-idle-composite-abort-capture.mjs";
import { ALLOCATION_ATTEMPT_DECODER_SHA256, ALLOCATION_ATTEMPT_SLOT, ALLOCATION_ATTEMPT_ROOT } from "../scripts/lib/packet-largest-idle-attempt-abort-capture.mjs";
import { validateCompositeAllocationFailureRecord } from "../scripts/lib/packet-largest-idle-full-failure.mjs";
const root = path.resolve(import.meta.dirname, ".."), read = file => readFile(path.join(root, file));
function reverse(recipe) { let text = recipe.generated; for (const [before, after] of recipe.largestIdleEdits.toReversed()) text = text.replaceAll(after, before); return text; }
function syntax(text) { const r = spawnSync(process.execPath, ["--check", "--input-type=module"], { input: text, encoding: "utf8", windowsHide: true, timeout: 5000 }); assert.equal(r.status, 0, r.stderr); }
test("fresh caller preserves full conversion gates and every previous executed source without raising old evidence caps", async () => {
  const parent = await makeInputReadFullCaller(root), caller = await makeLargestIdleFullCaller(root), legacy = await loadLegacyFullSources(root);
  assert.equal(reverse(caller), parent.generated); syntax(caller.generated);
  for (const file of Object.keys(legacy.proof.sourcePins)) assert.ok(caller.extraFiles.includes(file), file);
  assert.equal(FULL_SOURCE_LAYER_LIMITS.combinedFiles, 384); assert.equal(FULL_SOURCE_LAYER_LIMITS.additiveFiles, 128);
  assert.equal(SUPPLEMENTAL_LIMITS.supplementalFiles, 128); assert.equal(SUPPLEMENTAL_LIMITS.supplementalRestoredBytes, 2097152);
  for (const token of ["requestedRuns: 3", "21600000", "primaryLimitMiB: 250", "nativeBitRate: 4000000", "32 * 1024 ** 3", "protectedSource()",
    "finishOwnedCleanup(actions)", "raw.forbiddenRequests, []", "inputReadFailureSamples.length <= 6", "packet-largest-idle)-full-live"])
    assert.ok(caller.generated.includes(token), token);
});
test("actual qualified210 adapter/native, full driver, and separate bounded source envelope round-trip with finally cleanup", async () => {
  const runtime = await createOwnedRuntimeScratch("allocation-attempt-full-wrapper-"), candidate = await createOwnedRuntimeScratch("allocation-attempt-media-");
  let archiveRecord;
  try {
    const qualified = await loadQualifiedLargestIdleMedia(root), legacy = await loadLegacyFullSources(root);
    const composition = await createAttemptPlaneCandidate(root, candidate.directory);
    assert.deepEqual(composition.manifest, qualified.report.manifest);
    assert.equal(composition.manifest.artifacts["within-mpeg2-split.wasm"], ALLOCATION_ATTEMPT_DECODER_SHA256);
    assert.deepEqual(await verifyAttemptPlaneCandidate(root, candidate.directory), qualified.report.manifest);
    const caller = await makeLargestIdleFullCaller(root);
    const files = [...new Set([...caller.extraFiles, ...Object.keys(qualified.proof.sourcePins), qualified.reference.path,
      qualified.proof.generatedArchive.path, qualified.proof.report.archive.path])];
    const snapshot = await captureLayeredFullSourcePins(root, files);
    assert.equal(snapshot.legacyFilesRetained, 380); assert.equal(snapshot.omittedLegacyFiles, 0);
    assert.ok(snapshot.supplementalFiles.length <= 128); assert.ok(snapshot.supplementalRestoredBytes <= 2097152);
    const name = path.basename(candidate.directory), driver = await makeLargestIdleFullDriver(root, runtime.directory, name, snapshot.files);
    assert.equal(reverse(driver), legacy.archive.generated); syntax(driver.generated);
    assert.deepEqual(driver.adapter, qualified.adapter);
    for (const token of ["inputReadFailureSamples", "WITHIN_INPUT_READ_FAILURE", "suspension.frees,1", "ssim >= 0.98", "blankBaseline", "native-checkpoint.json",
      "windowsHide: true", "packet-largest-idle-full-failure.mjs", "supplementalSourceFiles", "limitMiB: 250"])
      assert.ok(driver.generated.includes(token), token);
    assert.ok(!driver.generated.includes("__WITHIN_INPUT_READ_CONTROL__"));
    const stager = await makeLargestIdleFullStager(root, name); syntax(stager.generated);
    assert.equal(reverse(stager), qualified.archive.generated.stage);
    // Exercise the real retained-report writer, then remove only this wx-owned
    // test archive in finally. Units must not accumulate redundant archives.
    const stamp = new Date().toISOString().replaceAll(/[:.]/g, "-");
    const record = await writeLayeredFullSourceArchive(root, stamp, snapshot, { ...driver, traceHelper: legacy.archive.traceHelper, generatedCaller: caller.generated });
    archiveRecord = record;
    const restored = await materializeLayeredFullSourceArchive(root, record);
    assert.deepEqual(restored.sourcePins, snapshot.pins); assert.equal(restored.generated, driver.generated);
    assert.equal(restored.allPreimagesRecovered, true); assert.equal(restored.legacyBytesRewritten, false);
    for (const [file, hash] of Object.entries(snapshot.pins)) assert.equal(sha(Buffer.from(restored.sourcePreimages[file].data, "base64")), hash, file);
    await assert.rejects(materializeLayeredFullSourceArchive(root, { ...record, sha256: "0".repeat(64) }));
    console.log(JSON.stringify({ sources: snapshot.files.length, supplementalFiles: snapshot.supplementalFiles.length, supplementalRestoredBytes: snapshot.supplementalRestoredBytes }));
  } finally {
    if (archiveRecord) {
      const target = path.join(root, archiveRecord.path); assert.equal(path.dirname(target), path.join(root, "outputs/reports"));
      const identity = await lstat(target); assert.ok(identity.isFile() && !identity.isSymbolicLink());
      assert.equal(sha(await readFile(target)), archiveRecord.sha256); await unlink(target);
      await assert.rejects(access(target), { code: "ENOENT" });
    }
    await candidate.close(); await runtime.close(); await assert.rejects(access(candidate.directory), { code: "ENOENT" }); await assert.rejects(access(runtime.directory), { code: "ENOENT" });
  }
});
test("hidden supervisor preserves exact launcher behavior apart from identity/target/prefix", async () => {
  const old = (await read("scripts/launch-input-read-supervisor.mjs")).toString(), next = (await read("scripts/launch-packet-largest-idle-supervisor.mjs")).toString();
  assert.equal(next.replaceAll("scripts/launch-packet-largest-idle-supervisor.mjs", "scripts/launch-input-read-supervisor.mjs")
    .replaceAll("scripts/run-packet-largest-idle-original-full.mjs", "scripts/run-input-read-original-full.mjs")
    .replaceAll("packet-largest-idle-supervisor", "input-read-supervisor").trimEnd(), old.trimEnd());
  for (const token of ["windowsHide: true", "detached: true", "heartbeatSeconds: 60", "runtime.close()", "noAutomaticRestart: true"]) assert.ok(next.includes(token), token);
});
test("offline validator accepts packet-qualified synthetic pending slot without falsifying direct qualification", () => {
  const heap = new Uint8Array(33554432), view = new DataView(heap.buffer), set = (at, value) => view.setUint32(at, value, true);
  set(ALLOCATION_ATTEMPT_ROOT + 12, 1048568); set(ALLOCATION_ATTEMPT_ROOT + 16, 2097152); set(ALLOCATION_ATTEMPT_ROOT + 24, 3145728); set(3145732, 1048569);
  for (const offset of [432,472,476]) set(ALLOCATION_ATTEMPT_ROOT + offset, 2097152);
  [1095519281,1,23,1,16,314088].forEach((value, index) => set(ALLOCATION_ATTEMPT_SLOT + index * 4, value));
  const original = globalThis.Error;
  class SyntheticError extends original { constructor(message) { super(message); this.stack = "SYNTHETIC UNIT ONLY wasm-function[4471] wasm-function[4313] wasm-function[4473] wasm-function[4442]"; } }
  let row;
  globalThis.Error = SyntheticError;
  try {
    const observer = createCompositeAllocationAbortCapture({ getCore: () => ({ HEAPU8: heap, withinAllocatorAttemptAddress: ALLOCATION_ATTEMPT_SLOT, withinAllocatorAttemptWords: 16 }), emit: () => {}, qualifiedBinarySha256: ALLOCATION_ATTEMPT_DECODER_SHA256 });
    observer.onAbort("synthetic unit only"); row = observer.report().first;
  } finally { globalThis.Error = original; }
  assert.equal(validateCompositeAllocationFailureRecord(row), row);
  assert.equal(row.qualifiedDirectBufferCallPath, false); assert.equal(row.qualifiedPacketCallPath, true);
  assert.throws(() => validateCompositeAllocationFailureRecord({ ...row, qualifiedPacketCallPath: false }));
  assert.throws(() => validateCompositeAllocationFailureRecord({ ...row, failedIndividualAllocationBytes: 33554432 }));
});
