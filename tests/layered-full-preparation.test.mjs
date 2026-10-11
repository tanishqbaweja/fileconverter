import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { access, readFile, unlink } from "node:fs/promises";
import path from "node:path";
import test from "node:test";
import { sha } from "../scripts/lib/stable-ui-headless-baseline-recipe.mjs";
import { loadHistoricalFullSourceBase, partitionFullSourceLayers, captureLayeredFullSourcePins,
  writeLayeredFullSourceArchive, materializeLayeredFullSourceArchive, FULL_SOURCE_LAYER_LIMITS } from "../scripts/lib/layered-full-source-archive.mjs";
import { loadQualifiedAttemptMediaSources, makeQualifiedAttemptFullStager } from "../scripts/lib/qualified-attempt-full-stager.mjs";
import { validateCompositeAllocationFailureRecord } from "../scripts/lib/composite-allocation-failure-record.mjs";
const root = path.resolve(import.meta.dirname, ".."), read = file => readFile(path.join(root, file)), json = async file => JSON.parse(await read(file));
const additions = ["scripts/lib/layered-full-source-archive.mjs", "scripts/lib/qualified-attempt-full-stager.mjs",
  "scripts/stage-allocation-attempt-full.mjs", "scripts/lib/composite-allocation-failure-record.mjs", "tests/layered-full-preparation.test.mjs"];
test("historical256 plus actual136 and new five files roundtrip all304 pins without touching original archive or weakening layer caps", async () => {
  const base = await loadHistoricalFullSourceBase(root), media = await json("evidence/2026-10-11T13-23-21-737Z-allocation-attempt-media.json");
  const baseBytesBefore = sha(await read(base.reference.archive.path));
  const snapshot = await captureLayeredFullSourcePins(root, [...Object.keys(media.sourcePins), ...additions]);
  assert.equal(snapshot.files.length, 304); assert.equal(snapshot.additiveFiles.length, 48); assert.equal(snapshot.omittedHistoricalFiles, 0);
  for (const [file, hash] of Object.entries(base.pins)) assert.equal(snapshot.pins[file], hash, file);
  for (const [file, hash] of Object.entries(media.sourcePins)) assert.equal(snapshot.pins[file], hash, file);
  assert.equal(snapshot.limits.additiveFiles, 128); assert.equal(snapshot.limits.runtimeArchiveBytes, 8388608);
  assert.ok(snapshot.additiveRestoredBytes <= 2097152 && snapshot.additiveCompressedBytes <= 2097152);
  const stamp = new Date().toISOString().replaceAll(/[:.]/g, "-"); let record;
  try {
    record = await writeLayeredFullSourceArchive(root, stamp, snapshot, { scope: "UNIT ROUNDTRIP ONLY, no launched full conversion",
      generated: base.archive.generated, traceHelper: base.archive.traceHelper, generatedCaller: base.archive.generatedCaller });
    const restored = await materializeLayeredFullSourceArchive(root, record);
    assert.equal(Object.keys(restored.sourcePreimages).length, 304); assert.equal(restored.historicalBytesRewritten, false);
    assert.equal(restored.allPreimagesRecovered, true); assert.equal(restored.publicAcceptance, false);
    assert.deepEqual(restored.sourcePins, snapshot.pins);
    for (const [file, hash] of Object.entries(snapshot.pins)) assert.equal(sha(Buffer.from(restored.sourcePreimages[file].data, "base64")), hash, file);
    await assert.rejects(materializeLayeredFullSourceArchive(root, { ...record, sha256: "0".repeat(64) }));
    const stale = structuredClone(snapshot); delete stale.pins[Object.keys(base.pins)[0]];
    await assert.rejects(writeLayeredFullSourceArchive(root, stamp, stale, { generated: "UNIT", traceHelper: "UNIT", generatedCaller: "UNIT" }));
  } finally {
    if (record) { assert.equal(path.dirname(path.join(root, record.path)), path.join(root, "outputs/reports")); await unlink(path.join(root, record.path)); await assert.rejects(access(path.join(root, record.path)), { code: "ENOENT" }); }
  }
  assert.equal(sha(await read(base.reference.archive.path)), baseBytesBefore);
});
test("layer union rejects excess additions, traversal, media filenames, incorrect base size and silent replacement", async () => {
  const base = await loadHistoricalFullSourceBase(root);
  const files = Array.from({ length: 129 }, (_, i) => `scripts/unit-does-not-exist-${i}.mjs`);
  assert.throws(() => partitionFullSourceLayers(base.pins, files));
  assert.equal(partitionFullSourceLayers(base.pins, files.slice(0, 128)).files.length, 384);
  for (const file of ["../app.js", "C:/private.js", "scripts/../app.js", "test.mkv", "work/output.mp4", "scripts\\x.mjs", "scripts//x.mjs"])
    assert.throws(() => partitionFullSourceLayers(base.pins, [file]), file);
  assert.throws(() => partitionFullSourceLayers({}, []));
  assert.deepEqual(FULL_SOURCE_LAYER_LIMITS, { historicalFiles: 256, additiveFiles: 128, combinedFiles: 384,
    perFileBytes: 2097152, additiveRestoredBytes: 2097152, additiveCompressedBytes: 2097152, runtimeArchiveBytes: 8388608 });
});
test("qualified full stager reverses to actual media-tested stage, keeping exact adapter/core/restore bytes", async () => {
  const qualified = await loadQualifiedAttemptMediaSources(root), recipe = await makeQualifiedAttemptFullStager(root, "allocation-attempt-media-UNITONLY");
  let reversed = recipe.generated; for (const [before, after] of recipe.edits.toReversed()) reversed = reversed.replace(after, before);
  assert.equal(reversed, qualified.archive.generated.stage); assert.equal(sha(recipe.generated), recipe.generatedSha256);
  const checked = spawnSync(process.execPath, ["--check", "--input-type=module"], { input: recipe.generated, encoding: "utf8", windowsHide: true, timeout: 5000 });
  assert.equal(checked.status, 0, checked.stderr); assert.equal(recipe.publicAcceptance, false); assert.equal(recipe.fullOriginalAcceptance, false);
  for (const token of ["verifyAttemptPlaneCandidate", "createCompositeAllocationAbortCapture", "decoderAbort.withPriorOnAbort(options.onAbort)", "mapped[9] = 4000000", 'process.argv[2] === "restore"'])
    assert.ok(recipe.generated.includes(token), token);
  const wrapper = (await read("scripts/stage-allocation-attempt-full.mjs")).toString();
  assert.ok(wrapper.includes('process.argv.length === 3 && ["stage", "restore"].includes(process.argv[2])'));
  await assert.rejects(makeQualifiedAttemptFullStager(root, "../../elsewhere"));
});
test("full collector boundary accepts genuine known request but rejects altered slot/root/phase/word/cause claims", async () => {
  const proof = await json("evidence/2026-10-11T13-10-58-221Z-composite-allocation-abort-control.json"), row = proof.result.terminal.emitted;
  assert.equal(validateCompositeAllocationFailureRecord(row), row);
  for (const key of ["failedIndividualAllocationBytes", "actualAllocatorRoot", "actualAttemptSlotAddress", "maximumScalarWords", "validatedScalarWords"]) {
    const invalid = structuredClone(row); invalid[key]++; assert.throws(() => validateCompositeAllocationFailureRecord(invalid), key);
  }
  for (const index of [0, 1, 2, 3, 4, 5, 6, 8, 11, 13, 15]) {
    const invalid = structuredClone(row); invalid.allocationAttempt.words[index]++; assert.throws(() => validateCompositeAllocationFailureRecord(invalid), `word${index}`);
  }
  const invented = structuredClone(row); invented.originalFailureCauseProven = true; assert.throws(() => validateCompositeAllocationFailureRecord(invented));
});
test("fallback and unavailable requests stay null; encoder fatal keeps old semantics (SYNTHETIC boundary unit only)", async () => {
  const proof = await json("evidence/2026-10-11T13-10-58-221Z-composite-allocation-abort-control.json"), row = structuredClone(proof.result.terminal.emitted);
  const attempt = row.allocationAttempt; attempt.phase = "upstream-alignment-pending"; attempt.words[3] = 4;
  attempt.words[7] = 2200008; attempt.words[9] = 8; attempt.words[10] = 1; attempt.freshUnexposedPointerFreed = true;
  attempt.failedIndividualAllocationBytes = null; row.failedIndividualAllocationBytes = null;
  assert.equal(validateCompositeAllocationFailureRecord(row).failedIndividualAllocationBytes, null);
  row.allocationAttempt = null; row.allocationAttemptUnavailable = "SYNTHETIC unavailable request";
  row.wrapperRequestedBytes = null; row.validatedScalarWords = 0; row.allocatorFreeBlocks = null; row.allocatorFreeBlocksUnavailable = "SYNTHETIC not read";
  assert.equal(validateCompositeAllocationFailureRecord(row).failedIndividualAllocationBytes, null);
  const encoder = { role: "encoder", reason: "SYNTHETIC encoder fatal", stack: "SYNTHETIC", failedIndividualAllocationBytes: null, heapLiveBytes: null, publicAcceptance: false };
  assert.equal(validateCompositeAllocationFailureRecord(encoder), encoder);
});
