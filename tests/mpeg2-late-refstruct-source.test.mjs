import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { readFile } from "node:fs/promises";
import test from "node:test";
import { instrumentLateRefstruct, reverseLateRefstruct, PRIVATE_REFSTRUCT_SHA256 } from "../media/ffmpeg/mpeg2-late-refstruct-source.mjs";
import { makeLateRefstructRecipe } from "../media/ffmpeg/mpeg2-late-refstruct-recipe.mjs";
import { makeAlignedReuseRecipe } from "../media/ffmpeg/mpeg2-aligned-reuse-recipe.mjs";
const root = new URL("../", import.meta.url), read = file => readFile(new URL(file, root), "utf8");
const sha = text => createHash("sha256").update(text).digest("hex");
const preflight = JSON.parse(await read("evidence/mpeg2-late-refstruct-source-preflight-2026-10-08.json"));

test("actual pinned refstruct source reverses exactly and original allocation executes exactly once", () => {
  const source = preflight.privateSource, changed = instrumentLateRefstruct(source);
  assert.equal(sha(source), PRIVATE_REFSTRUCT_SHA256); assert.equal(reverseLateRefstruct(changed), source);
  assert.equal(sha(changed), preflight.instrumentedSourceSha256);
  assert.equal(changed.match(/ret = av_refstruct_alloc_ext\(/g).length, 1);
  assert.ok(changed.includes("within_refstruct_before_fresh_allocation(pool);\n        ret = av_refstruct_alloc_ext"));
  assert.ok(changed.includes("within_refstruct_abort_words[3] = ret ? 2 : 3"));
  assert.throws(() => instrumentLateRefstruct(source + "\n"));
  assert.throws(() => reverseLateRefstruct(changed.replace("ret ? 2 : 3", "ret ? 3 : 2")));
  assert.equal(preflight.snapshotsRetained, 1); assert.equal(preflight.fixedNativeSlotBytes, 64);
  assert.equal(preflight.actualCompiledUnitVerified, false); assert.equal(preflight.actualLateFailedRequestBytes, null);
});

test("all codec/heap/stack/thread/AVIO gates remain in exact additive build derivative", async () => {
  const base = await read("media/ffmpeg/build-mpeg2-split-pipeline.sh"), recipe = makeLateRefstructRecipe(base);
  const aligned = makeAlignedReuseRecipe(base);
  assert.equal(sha(recipe), preflight.generatedRecipeSha256);
  for (const line of aligned.split("\n").filter(line => /-s(?:INITIAL_MEMORY|MAXIMUM_MEMORY|ALLOW_MEMORY_GROWTH|STACK_SIZE|ASYNCIFY_STACK_SIZE|PTHREAD_POOL_SIZE)=|--enable-decoder=/.test(line)))
    assert.ok(recipe.includes(line), line);
  assert.equal(recipe.match(/node "\$\{SCRIPT_DIR\}\/patch-late-refstruct\.mjs"/g).length, 1);
  assert.ok(recipe.includes('-Wl,-Map,${OUTPUT_ROOT}/decoder-link.map'));
  assert.ok(recipe.includes('node "${BUILD_ROOT}/late-refstruct-smoke.js"'));
  assert.throws(() => makeLateRefstructRecipe(base + "\n"), /Frozen baseline/);
});

test("diagnostic slot has no event history, native allocations, per-request JS or codec ownership changes", async () => {
  const changed = instrumentLateRefstruct(preflight.privateSource), added = changed.slice(changed.indexOf("/* Diagnostic fixed64-byte"), changed.indexOf("static void pool_free"));
  assert.doesNotMatch(added, /\b(?:malloc|free|realloc|memcpy|av_frame|av_buffer_unref|EM_JS|console)\b/);
  assert.ok(added.includes("atomic_load_explicit")); assert.ok(added.includes("pool->size + REFCOUNT_OFFSET"));
  assert.doesNotMatch(added, /sequence\s*>=\s*48|within_refstruct_abort_words\[16\]\s*=/);
  const slot = await read("media/ffmpeg/mpeg2-late-refstruct-slot.c");
  assert.ok(slot.includes("volatile uint32_t within_refstruct_abort_words[16]"));
  assert.ok(slot.includes("__attribute__((constructor))"));
  assert.doesNotMatch(slot, /\b(?:malloc|free|calloc|memcpy|av_frame|readFile|writeFile)\(/);
});

test("isolated workflow is no-Docker, source/tool-only, finally-cleaned and historically separate", async () => {
  const workflow = await read(".github/workflows/mpeg2-late-allocation-nondocker.yml");
  assert.ok(workflow.includes("cancel-in-progress: false")); assert.ok(workflow.includes("if: always()"));
  assert.ok(workflow.includes("work/emsdk/emsdk install 6.0.4"));
  assert.ok(workflow.includes("retention-days: 1"));
  assert.doesNotMatch(workflow, /test\.mkv|ffmpeg -i|docker (?:run|build)|npm run build|public\/engines/);
  const historical = await read(".github/workflows/reproduce-ffmpeg-nondocker.yml");
  assert.equal(sha(historical), "cda0b434adc7dd36109b4a2cc63fe726a507889cf6d1c0f5862d5d78dbf5c965");
  for (const [file, hash] of Object.entries(preflight.sourcePins)) assert.equal(sha(await read(file)), hash, file);
});
