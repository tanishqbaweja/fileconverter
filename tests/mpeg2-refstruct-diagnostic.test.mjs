import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

const read = (file) => readFile(new URL(`../${file}`, import.meta.url), "utf8");

test("Refstruct source getter is read-only, mutex protected, bounded and explicitly source pinned", async () => {
  const patch = await read("media/ffmpeg/patches/refstruct-readonly-pool-diagnostic.patch");
  const added = patch.split("\n").filter((l) => l.startsWith("+") && !l.startsWith("+++")).map((l) => l.slice(1)).join("\n");
  assert.match(added, /ff_mutex_lock\(&pool->mutex\)/);
  assert.match(added, /ff_mutex_unlock\(&pool->mutex\)/);
  assert.match(added, /atomic_load_explicit\(&pool->refcount, memory_order_acquire\)/);
  assert.match(added, /cached < 128/);
  assert.match(added, /complete \? references - 1 : 0/);
  assert.match(added, /pool->size \+ REFCOUNT_OFFSET/);
  assert.doesNotMatch(added, /pool->\w+\s*=(?!=)|av_malloc|av_free\(|atomic_(?:fetch|store)|memset\(/);
  assert.equal(patch.split("\n").filter((l) => l.startsWith("-") && !l.startsWith("---")).length, 0);
  const checker = await read("scripts/verify-mpeg2-refstruct-diagnostic.mjs");
  assert.match(checker, /715cba26d3c68d65db8edf584f2dc3daae555de92f1003b5cfe3f32d6ddbb0b2/);
  assert.match(checker, /after.replace\(added, ""\), before/);
  assert.match(checker, /runtime.close\(\)/);
});

test("Pool diagnostics have a separate finite budget, delegate original get and expose unknown as null", async () => {
  const header = await read("media/ffmpeg/mpeg2-allocator-diagnostic.h");
  assert.match(header, /sequence >= 96/);
  assert.match(header, /sequence >= 128/);
  assert.match(header, /size_t stats\[4\] = \{0\}/);
  for (const field of ["entryPayloadBytes", "entryRequestedAllocationBytes", "checkedOutEntries", "cachedEntries"])
    assert.match(header, new RegExp(`${field}: complete \\? values\\[[0-3]\\] : null`));
  assert.match(header, /void \*result = __real_av_refstruct_pool_get\(pool\)/);
  assert.match(header, /mpeg2_refstruct_snapshot\(19, pool\)/);
  assert.match(header, /mpeg2_refstruct_snapshot\(20, pool\)/);
  assert.doesNotMatch(header, /av_refstruct_unref|av_refstruct_pool_uninit|qmin|qmax|width\s*=|height\s*=/);
  const harness = await read("scripts/mpeg2-protected-memory.mjs");
  assert.match(harness, /allocatorSamples.length === 240/);
  assert.match(harness, /stackDiagnostic \|\| manifest.allocatorDiagnostic === true/);
});

test("Pool reader only compiles in diagnostic mode; fixed32, original kernel and public artifacts remain unchanged", async () => {
  const recipe = await read("media/ffmpeg/build-mpeg2-candidate.sh");
  assert.match(recipe, /if \[\[ "\$\{ALLOCATOR_DIAGNOSTIC\}" == 1 \|\| "\$\{FRAME_ALLOCATION_DIAGNOSTIC\}" == 1 \]\]; then\s*# Read-only private pool telemetry/);
  assert.match(recipe, /--wrap=av_refstruct_pool_get/);
  assert.match(recipe, /refstruct-readonly-pool-diagnostic.patch" source-bundle\//);
  assert.match(recipe, /-sALLOW_MEMORY_GROWTH=0 "-sINITIAL_MEMORY=33554432" "-sMAXIMUM_MEMORY=33554432"/);
  const manifest = await read("media/ffmpeg/mpeg2-candidate-manifest.mjs");
  assert.match(manifest, /refstructSourceSha256 !== \(allocatorDiagnostic === "1"/);
  assert.match(manifest, /encoderReleaseSnapshots: 16/);
  assert.match(manifest, /browserEvents: 240/);
  const kernel = await read("media/ffmpeg/mpeg2-candidate.c");
  assert.doesNotMatch(kernel, /within_refstruct_pool_diagnostic|refstruct_snapshot/);
  const smoke = await read("media/ffmpeg/refstruct-diagnostic-smoke.c");
  assert.match(smoke, /References are not separate checked-out entries/);
  assert.match(smoke, /entries\[129\]/);
  assert.match(smoke, /within_refstruct_pool_diagnostic\(pool, capped\) == 0/);
  assert.match(smoke, /av_refstruct_pool_uninit/);
  assert.doesNotMatch(smoke, /avcodec_|avformat_|avio_|File|Blob|test\.mkv/);
  assert.match(recipe, /refstruct-diagnostic-smoke.js" > "\$\{OUTPUT_ROOT\}\/refstruct-diagnostic-smoke.json/);
  assert.match(recipe, /-sMODULARIZE=0 -sEXPORT_ES6=0/);
  assert.match(recipe, /-UNDEBUG/);
  assert.match(recipe, /test -s "\$\{OUTPUT_ROOT\}\/refstruct-diagnostic-smoke.json"/);
  assert.match(manifest, /Compiled diagnostic reader did not produce the exact required smoke proof/);
  const workflow = await read(".github/workflows/reproduce-ffmpeg-nondocker.yml");
  assert.match(workflow, /work\/mpeg2-candidate-output\/refstruct-diagnostic-smoke.json/);
});
