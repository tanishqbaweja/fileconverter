import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { readFile } from "node:fs/promises";
import test from "node:test";
import { instrumentHevcAuxiliarySource, reverseHevcAuxiliarySource,
  instrumentHevcEncoderBoundary, reverseHevcEncoderBoundary } from "../media/ffmpeg/mpeg2-hevc-auxiliary-diagnostic.mjs";

const source = (file) => readFile(new URL(`../${file}`, import.meta.url), "utf8");
test("HEVC observer rejects unpinned sources and exactly reverses its only encoder-boundary call", async () => {
  for (const value of [null, 1, {}, "", "x".repeat(32769)]) {
    assert.throws(() => instrumentHevcAuxiliarySource(value));
    assert.throws(() => reverseHevcAuxiliarySource(value));
  }
  const kernel = await source("media/ffmpeg/mpeg2-candidate.c");
  const changed = instrumentHevcEncoderBoundary(kernel);
  assert.equal(reverseHevcEncoderBoundary(changed), kernel);
  assert.throws(() => instrumentHevcEncoderBoundary(changed));
  assert.throws(() => reverseHevcEncoderBoundary(changed.replace("p->decoder", "p->encoder")));
});
test("HEVC emitter exposes two bounded scalar pools and preserves absent/incomplete statistics as null", async () => {
  const header = await source("media/ffmpeg/mpeg2-hevc-auxiliary-diagnostic.h");
  const body = header.slice(header.indexOf("  const callback"), header.indexOf("\n});"));
  const emit = new Function("Module", "HEAPU32", "sequence", "layer", "active", "short_refs", "long_refs", "output", "values", body);
  const heap = new Uint32Array([1, 1, 1024, 1040, 5, 1, 0, 0, 0, 0, 0, 0]), rows = [];
  const bridge = { withinBridge: { allocatorDiagnostic: (row) => rows.push(row) } };
  emit(bridge, heap, 1, 0, 6, 5, 0, 2, 0);
  assert.equal(rows[0].kind, "hevc-auxiliary-pools");
  assert.equal(rows[0].pools[0].liveEntries, 5); assert.equal(rows[0].pools[0].cachedEntries, 1);
  assert.equal(rows[0].pools[1].payloadBytes, null); assert.equal(rows[0].pools[1].liveEntries, null);
  heap[1] = 0; emit(bridge, heap, 2, 0, 6, 5, 0, 2, 0);
  assert.equal(rows[1].pools[0].payloadBytes, 1024);
  assert.equal(rows[1].pools[0].backingBytesPerEntry, null); assert.equal(rows[1].pools[0].cachedEntries, null);
  assert.doesNotThrow(() => emit({}, heap, 3, 0, 6, 5, 0, 2, 0));
  assert.ok(JSON.stringify(rows[0]).length < 2048);
  for (const row of rows) assert.doesNotMatch(JSON.stringify(row), /poolIdentity|filename|frameBytes|address/);
});
test("HEVC inventory is read-only, private, budgeted and coupled to actual compiled source and reader evidence", async () => {
  const helper = await source("media/ffmpeg/mpeg2-hevc-auxiliary-diagnostic.mjs");
  assert.match(helper, /sequence >= 48/); assert.match(helper, /size_t values\[12\] = \{ 0 \}/);
  assert.match(helper, /context->thread_count != 1/);
  assert.doesNotMatch(helper, /av_refstruct_unref\(|av_buffer_unref\(|avcodec_flush_buffers\(|av_refstruct_pool_uninit\(|av_malloc\(/);
  const recipe = await source("media/ffmpeg/build-mpeg2-candidate.sh");
  assert.match(recipe, /mpeg2-hevc-auxiliary-diagnostic.mjs" \\\n/);
  assert.match(recipe, /ALLOCATOR_DIAGNOSTIC\}" == 1 \|\| "\$\{FRAME_ALLOCATION_DIAGNOSTIC\}" == 1/);
  const manifest = await source("media/ffmpeg/mpeg2-candidate-manifest.mjs");
  assert.match(manifest, /reverseHevcAuxiliarySource\(actualHevcRefs\)/);
  assert.match(manifest, /reverseHevcEncoderBoundary\(generatedWrapper.slice/);
  assert.match(manifest, /entry.name === "within_hevc_aux_emit"/);
  assert.match(manifest, /hevcAuxiliaryDiagnosticLimit: 48/);
  assert.match(manifest, /allocatorDiagnostic === "1" \|\| frameDiagnostic === "1"/);
});
test("Frozen HEVC boundary source audit never becomes actual cache, speed or conversion acceptance", async () => {
  const proof = JSON.parse(await source("evidence/mpeg2-hevc-auxiliary-source-audit-2026-10-06.json"));
  for (const [file, hash] of Object.entries(proof.sources))
    assert.equal(createHash("sha256").update(await source(file)).digest("hex"), hash);
  assert.equal(proof.byteExactNativeSourceReversal, true); assert.equal(proof.byteExactKernelReversal, true);
  assert.equal(proof.mutationNegativeControlsPassed, true);
  assert.equal(proof.auxiliaryEventCap + proof.planeEventCap, proof.browserEventCap);
  assert.equal(proof.inactiveLinkWalkCap, 128); assert.equal(proof.nativeSnapshotBytes, 48);
  assert.equal(proof.compiledObserverVerified, false); assert.equal(proof.actualInactiveHevcBytesAtFailure, null);
  assert.equal(proof.contiguousFreeBlockCapacity, null); assert.equal(proof.speedGainClaim, null);
  assert.equal(proof.publicAcceptance, false); assert.equal(proof.primaryMemoryAcceptance, false);
  assert.equal(proof.generatedSourceFilesCreated, 0); assert.equal(proof.scratchFilesCreated, 0);
});
