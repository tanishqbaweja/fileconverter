import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { readFile } from "node:fs/promises";
import test from "node:test";
import { instrumentHevcPoolAttempts, reverseHevcPoolAttempts }
  from "../media/ffmpeg/mpeg2-hevc-pool-attempt-diagnostic.mjs";

const read = (file) => readFile(new URL(`../${file}`, import.meta.url), "utf8");
test("Source-only allocation observer has exact reversal and stays separate from compiled or browser evidence", async () => {
  const proof = JSON.parse(await read("evidence/mpeg2-hevc-pool-attempt-source-audit-2026-10-06.json"));
  for (const [file, hash] of Object.entries(proof.sources))
    assert.equal(createHash("sha256").update(await read(file)).digest("hex"), hash, file);
  assert.equal(proof.byteExactSourceReversal, true); assert.equal(proof.mutationNegativeControlsPassed, true);
  assert.equal(proof.exactPoolCallSites, 2); assert.equal(proof.originalGetterCallsPerAttempt, 1);
  assert.equal(proof.sharedHevcEventCap + proof.planeEventCap, proof.browserEventCap);
  assert.equal(proof.nativeInventoryBytes, 48); assert.equal(proof.inactiveLinkWalkCap, 128);
  assert.equal(proof.compiledObserverVerified, false); assert.equal(proof.actualFailedPool, null);
  assert.equal(proof.measuredRuntimeSavingsBytes, null); assert.equal(proof.speedGainClaim, null);
  assert.equal(proof.allocationPolicyChanged, false); assert.equal(proof.liveReferencesChanged, false);
  assert.equal(proof.publicAcceptance, false); assert.equal(proof.generatedSourceFilesCreated, 0);
  for (const value of [null, {}, "", "x".repeat(32769)]) {
    assert.throws(() => instrumentHevcPoolAttempts(value)); assert.throws(() => reverseHevcPoolAttempts(value));
  }
});
test("Actual allocation-time emitter labels class/phase and preserves unavailable counts rather than zero", async () => {
  const header = await read("media/ffmpeg/mpeg2-hevc-pool-attempt-diagnostic.h");
  const body = header.slice(header.indexOf("  const callback"), header.indexOf("\n});"));
  const emit = new Function("Module", "HEAPU32", "sequence", "layer", "phase", "which", "succeeded",
    "active", "short_refs", "long_refs", "output", "values", body);
  const heap = new Uint32Array([1, 1, 1024, 1040, 5, 0, 0, 0, 0, 0, 0, 0]), rows = [];
  const bridge = { withinBridge: { allocatorDiagnostic: (row) => rows.push(row) } };
  emit(bridge, heap, 1, 0, 1, 0, 0, 5, 5, 0, 2, 0);
  emit(bridge, heap, 2, 0, 2, 0, 1, 5, 5, 0, 2, 0);
  emit(bridge, heap, 3, 0, 0, 2, 0, 5, 5, 0, 2, 0);
  assert.equal(rows[0].kind, "hevc-pool-event"); assert.equal(rows[0].phase, "before-pool-get");
  assert.equal(rows[0].requestPool, "tab_mvf"); assert.equal(rows[0].succeeded, null);
  assert.equal(rows[1].succeeded, true); assert.equal(rows[2].requestPool, null);
  assert.equal(rows[2].phase, "before-encoder-send"); assert.equal(rows[0].pools[1].liveEntries, null);
  heap[1] = 0; emit(bridge, heap, 4, 0, 1, 1, 0, 5, 5, 0, 2, 0);
  assert.equal(rows[3].pools[0].backingBytesPerEntry, null); assert.equal(rows[3].pools[0].payloadBytes, 1024);
  assert.doesNotThrow(() => emit({}, heap, 5, 0, 1, 0, 0, 5, 5, 0, 2, 0));
  assert.ok(JSON.stringify(rows[0]).length < 2048);
  assert.doesNotMatch(JSON.stringify(rows), /address|filename|poolIdentity|frameBytes/);
  assert.match(header, /within_hevc_aux_emit_js\(sequence, layer, phase, which, succeeded, active/);
});
test("Native source uses one getter, shared48 cap and read-only inventory, with actual source/header/reader gates", async () => {
  const helper = await read("media/ffmpeg/mpeg2-hevc-pool-attempt-diagnostic.mjs");
  assert.match(helper, /sequence >= 48/); assert.match(helper, /size_t values\[12\]/);
  assert.match(helper, /void \*obj = av_refstruct_pool_get\(pool\);/);
  assert.match(helper, /return obj;/);
  assert.doesNotMatch(helper, /av_refstruct_unref\(|av_free\(|av_buffer_unref\(|pool_uninit\(|av_malloc\(/);
  const recipe = await read("media/ffmpeg/build-mpeg2-candidate.sh");
  assert.match(recipe, /mpeg2-hevc-pool-attempt-diagnostic.mjs" \\\n/);
  assert.match(recipe, /mpeg2-hevc-pool-attempt-diagnostic.h" \\\n/);
  assert.match(recipe, /ALLOCATOR_DIAGNOSTIC\}" == 1 \|\| "\$\{FRAME_ALLOCATION_DIAGNOSTIC\}" == 1/);
  const manifest = await read("media/ffmpeg/mpeg2-candidate-manifest.mjs");
  assert.match(manifest, /reverseHevcPoolAttempts\(actualHevcRefs\)/);
  assert.match(manifest, /generatedWrapper.split\(attemptHeader \+ "\\n"\).length !== 2/);
  assert.match(manifest, /hevcPoolAttemptDiagnostic: frameDiagnostic === "1"/);
  assert.match(manifest, /entry.name === "within_hevc_aux_emit_js"/);
});
