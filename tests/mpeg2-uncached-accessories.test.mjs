import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { readFile } from "node:fs/promises";
import test from "node:test";

const read = (file) => readFile(new URL(`../${file}`, import.meta.url), "utf8");
test("Measured inactive encoder accessories justify only a scoped final-reference cache policy", async () => {
  const proof = JSON.parse(await read("evidence/mpeg2-encoder-release-measured-2026-10-05.json"));
  assert.equal(proof.encoderRelease.lastRequestedCachedBytes, 278222);
  assert.equal(proof.encoderRelease.lastRequestedLiveBytes, 556444);
  assert.equal(proof.encoderRelease.liveObjectsSafeToRelease, false);
  const patch = await read("media/ffmpeg/patches/mpeg2-encoder-uncached-accessories.patch");
  assert.equal(createHash("sha256").update(patch).digest("hex"), "095c43cf7f636209be78d32cbedec1beacfa30c0d50978954d70bcf5abf9f645");
  const removed = patch.split("\n").filter((x) => x.startsWith("-") && !x.startsWith("---"));
  assert.deepEqual(removed, ["-    if (!pool->uninited) {",
    "-    pools->name ##_pool = av_refstruct_pool_alloc((size), (flags)); \\"]);
  assert.match(patch, /if \(!pool->uninited && !\(pool->pool_flags & WITHIN_MPEG2_POOL_UNCACHED\)\)/);
  assert.match(patch, /s->encoding && s->codec_id == AV_CODEC_ID_MPEG2VIDEO && \\\n\+\s*s->avctx->thread_count == 1/);
  const added = patch.split("\n").filter((x) => x.startsWith("+") && !x.startsWith("+++")).join("\n");
  assert.doesNotMatch(added, /av_refstruct_unref|pool_uninit|pool->refcount|reset_cb|free_entry_cb|memset|av_free|width|height|qmin|qmax/);
  const checker = await read("scripts/verify-mpeg2-uncached-accessories.mjs");
  for (const pin of ["8e7be80109d14fce52e3de7a30932efea283abe963ccdd755787e219a4699b19",
    "80e1e8455035bd95de6fd051d54a4814db5c791811757cfaaaba16f422595ca4",
    "d8936c56db57fe53d9836e950563483104670c2fc98687f87fb497e078ba742f"])
    assert.ok(checker.includes(pin));
  assert.match(checker, /Number\(x\[1\]\) !== 30/); assert.match(checker, /patch --fuzz=0/);
  assert.match(checker, /await apply\(readerPatch, true\); await apply\(patchName, true\)/);
  assert.match(checker, /runtime.close\(\)/);
});
test("Both private modes require actual compiled lifecycle smoke and exact policy source hashes", async () => {
  const recipe = await read("media/ffmpeg/build-mpeg2-candidate.sh");
  assert.match(recipe, /Mandatory compiled allocation-lifecycle gate in BOTH candidate modes/);
  assert.match(recipe, /-UNDEBUG/); assert.match(recipe, /-sMODULARIZE=0 -sEXPORT_ES6=0/);
  assert.match(recipe, /node "\$\{BUILD_ROOT\}\/mpeg2-accessory-smoke.js" > "\$\{OUTPUT_ROOT\}\/mpeg2-accessory-smoke.json"/);
  assert.match(recipe, /test -s "\$\{OUTPUT_ROOT\}\/mpeg2-accessory-smoke.json"/);
  assert.match(recipe, /"\$\{SCRIPT_DIR\}\/mpeg2-accessory-smoke.c" source-bundle\//);
  const manifest = await read("media/ffmpeg/mpeg2-candidate-manifest.mjs");
  assert.match(manifest, /Compiled uncached accessory lifecycle proof missing or changed/);
  for (const pin of ["e31af1df1e6e7b60b9112e2fcd22917664bc365d65db6c1d2b7038f5d532e084",
    "616af42245394f1db14d872554545d83759c6d5889292fdf8e4223ee244633f1",
    "4a2b2d1db11b794c3b8f4963e31cfb23124d09cdf8f0d6998037cbf344b45d9f"])
    assert.ok(recipe.includes(pin) && manifest.includes(pin));
  const smoke = await read("media/ffmpeg/mpeg2-accessory-smoke.c");
  assert.match(smoke, /cached.init == 1.*bytes_equal\(first, 0x52\)/);
  assert.match(smoke, /uncached.init == 2/);
  assert.match(smoke, /uncached.reset == 0 && uncached.entry_free == 0 && uncached.pool_free == 0/);
  assert.match(smoke, /Normal reset precedes the free callback/);
  assert.match(smoke, /av_refstruct_pool_uninit\(&pool\);\s*assert\(!pool && uncached.pool_free == 0/);
  assert.match(smoke, /AV_REFSTRUCT_POOL_FLAG_ZERO_EVERY_TIME/);
  assert.match(smoke, /AV_REFSTRUCT_POOL_FLAG_RESET_ON_INIT_ERROR \| AV_REFSTRUCT_POOL_FLAG_FREE_ON_INIT_ERROR/);
  assert.match(smoke, /SIZE_MAX/);
  assert.doesNotMatch(smoke, /avcodec_|avformat_|avio_|test\.mkv/);
  const workflow = await read(".github/workflows/reproduce-ffmpeg-nondocker.yml");
  assert.match(workflow, /work\/mpeg2-candidate-output\/mpeg2-accessory-smoke.json/);
  assert.equal(proofUncertified(manifest), true);
});
function proofUncertified(manifest) {
  return manifest.includes("fit/speed unproven") && manifest.includes("private-feasibility-candidate-not-certified-not-public")
    && manifest.includes("initialWasmMemoryBytes: 33554432, maximumWasmMemoryBytes: 33554432");
}
