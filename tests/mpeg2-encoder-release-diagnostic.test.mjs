import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";
import { mpeg2EncoderReleaseBytes } from "../scripts/lib/mpeg2-encoder-release-bytes.mjs";

const read = (file) => readFile(new URL(`../${file}`, import.meta.url), "utf8");
const sample = () => ({ kind: "mpeg2-encoder-pool-release", codecId: 2, codecThreads: 1,
  scope: "after-normal-cur-picture-release", pools: ["mbskip", "qscale", "mbtype", "motion", "refindex"].map((name, i) => ({
    name, poolIdentity: i + 1, configured: true, statisticsComplete: true,
    entryPayloadBytes: 1024, entryRequestedAllocationBytes: 1040, checkedOutEntries: 2, cachedEntries: i,
  })) });
test("Post-release diagnostic is addition-only, opt-in, source pinned and bounded; original codec lifetimes unchanged", async () => {
  const patch = await read("media/ffmpeg/patches/mpeg2-encoder-pool-release-diagnostic.patch");
  const added = patch.split("\n").filter((l) => l.startsWith("+") && !l.startsWith("+++")).map((l) => l.slice(1)).join("\n");
  assert.equal(patch.split("\n").filter((l) => l.startsWith("-") && !l.startsWith("---")).length, 0);
  assert.match(added, /avctx->codec_id == AV_CODEC_ID_MPEG2VIDEO && avctx->thread_count == 1/);
  assert.doesNotMatch(added, /av_malloc|av_free|av_refstruct_unref|pool_uninit|qmin|qmax|width\s*=|height\s*=/);
  assert.match(patch, /ff_mpv_unref_picture\(&s->c.cur_pic\);\n\+    if/);
  const header = await read("media/ffmpeg/mpeg2-allocator-diagnostic.h");
  assert.match(header, /sequence >= 16/); assert.match(header, /size_t records\[30\] = \{0\}/);
  assert.match(header, /AVRefStructPool \*pools\[5\]/);
  assert.match(header, /configured && values\[at \+ 1\] !== 0/);
  assert.match(header, /context->thread_count != 1/);
  assert.match(header, /within_refstruct_pool_diagnostic\(pools\[i\], row \+ 2\)/);
  assert.doesNotMatch(header, /av_refstruct_unref|av_refstruct_pool_uninit|av_malloc|av_free|memory\.grow/);
  const recipe = await read("media/ffmpeg/build-mpeg2-candidate.sh");
  assert.match(recipe, /if \[\[ "\$\{ALLOCATOR_DIAGNOSTIC\}" == 1 \]\]; then\s*# Read-only private pool telemetry/);
  assert.match(recipe, /2b16624607a83d6842d35ae053f3a542de82c84b72e7371bdadc6c6b5db9fb57/);
  assert.match(recipe, /mpeg2-encoder-pool-release-diagnostic.patch" source-bundle\//);
  const manifest = await read("media/ffmpeg/mpeg2-candidate-manifest.mjs");
  assert.match(manifest, /encoderReleaseSourceSha256 !== \(allocatorDiagnostic === "1"/);
  assert.match(manifest, /encoderReleaseSnapshots: 16/); assert.match(manifest, /browserEvents: 240/);
  const checker = await read("scripts/verify-mpeg2-encoder-release-diagnostic.mjs");
  assert.match(checker, /assert.equal\(recovered, before/); assert.match(checker, /patch --fuzz=0/);
  assert.match(checker, /runtime.close\(\)/);
});
test("Post-release scalar analysis counts actual cached backing, with no high-water or allocator-overhead guess", () => {
  const bytes = mpeg2EncoderReleaseBytes(sample());
  assert.equal(bytes.available, true); assert.equal(bytes.requestedLiveBytes, 10400);
  assert.equal(bytes.requestedCachedBytes, 10400); assert.equal(bytes.allocatorOverheadBytes, null);
  const absent = sample();
  absent.pools[0] = { name: "mbskip", poolIdentity: 0, configured: false, statisticsComplete: false,
    entryPayloadBytes: null, entryRequestedAllocationBytes: null, checkedOutEntries: null, cachedEntries: null };
  const missing = mpeg2EncoderReleaseBytes(absent);
  assert.equal(missing.available, true); assert.equal(missing.requestedLiveBytes, 8320);
  assert.equal(missing.pools[0].requestedCachedBytes, null);
});
test("Unknown, concurrent, aliased, incomplete or malformed post-release pool groups never become valid zero", () => {
  for (const mutate of [
    (s) => { s.codecThreads = 2; }, (s) => { s.codecId = 173; },
    (s) => { s.scope = "stale-latest-per-pool"; }, (s) => { s.pools.pop(); },
    (s) => { s.pools[0].statisticsComplete = false; }, (s) => { s.pools[0].cachedEntries = null; },
    (s) => { s.pools[0].cachedEntries = -1; }, (s) => { s.pools[0].cachedEntries = 0x100000000; },
    (s) => { s.pools[0].poolIdentity = s.pools[1].poolIdentity; },
    (s) => { s.pools[0].configured = false; },
    (s) => { s.pools[0].entryRequestedAllocationBytes = s.pools[0].entryPayloadBytes; },
    (s) => { s.pools[0].name = "motion"; },
  ]) {
    const s = sample(); mutate(s); const result = mpeg2EncoderReleaseBytes(s);
    assert.equal(result.available, false); assert.equal(result.requestedCachedBytes, null);
    assert.equal(result.requestedLiveBytes, null); assert.equal(result.pools, null);
  }
  assert.equal(mpeg2EncoderReleaseBytes(null).available, false);
});
