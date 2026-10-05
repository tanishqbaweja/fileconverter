import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { readFile } from "node:fs/promises";
import test from "node:test";

const source = (name) => readFile(new URL(`../${name}`, import.meta.url), "utf8");

test("MPEG2 private allocator candidate changes only encoder-plane caching, not layout or decoder pools", async () => {
  const patch = await source("media/ffmpeg/patches/mpeg2-encoder-uncached-frame-buffers.patch");
  assert.match(patch, /av_codec_is_encoder\(s->codec\)/);
  assert.match(patch, /pool->buffer_size\[i\] = size\[i\] \+ 16 \+ STRIDE_ALIGN - 1/);
  assert.match(patch, /av_buffer_allocz\(pool->buffer_size\[i\]\)/);
  assert.match(patch, /: av_buffer_pool_get\(pool->pools\[i\]\)/);
  assert.doesNotMatch(patch, /avcodec_align_dimensions|av_image_fill_linesizes|av_image_fill_plane_sizes|av_frame_unref|av_buffer_unref|av_buffer_ref\(|qmin|qmax|skip_frame|width\s*=|height\s*=/);
  const removed = patch.split("\n").filter((line) => line.startsWith("-") && !line.startsWith("---"));
  assert.equal(removed.length, 2);
  assert.match(removed[0], /av_buffer_pool_init\(size\[i\] \+ 16 \+ STRIDE_ALIGN - 1/);
  assert.match(removed[1], /av_buffer_pool_get\(pool->pools\[i\]\)/);
});

test("MPEG2 uncached-encoder build is source-pinned, bundled, private and still fixed 32MiB", async () => {
  const recipe = await source("media/ffmpeg/build-mpeg2-candidate.sh");
  assert.match(recipe, /38efe5e7fc627437306290919c8de3e2de5817d611b29d1f98e7ee6c12a8fb19/);
  assert.match(recipe, /62a73fe537318e4706f25904022d071e8f8ef9535b5334bf5c7b650e572c0478/);
  assert.match(recipe, /patch --fuzz=0 --directory=ffmpeg --strip=1/);
  assert.match(recipe, /mpeg2-encoder-uncached-frame-buffers.patch" source-bundle\//);
  assert.match(recipe, /-sALLOW_MEMORY_GROWTH=0 "-sINITIAL_MEMORY=33554432" "-sMAXIMUM_MEMORY=33554432"/);
  const manifest = await source("media/ffmpeg/mpeg2-candidate-manifest.mjs");
  assert.match(manifest, /patches\/mpeg2-encoder-uncached-frame-buffers.patch/);
  assert.match(manifest, /frameBufferPolicy: "Private encoder-only uncached planes/);
  const verifier = await source("scripts/verify-mpeg2-frame-pool-patch.mjs");
  assert.match(verifier, /data.length <= 32768/);
  assert.match(verifier, /assert.equal\(restored, before\)/);
  assert.match(verifier, /runtime.close\(\)/);
});

test("MPEG2 cache candidate is anchored to 65 measured LOW_DELAY events, not a fit or idle-buffer claim", async () => {
  const evidence = JSON.parse(await source("evidence/mpeg2-low-delay-allocation-measured-2026-10-05.json"));
  assert.equal(evidence.publicAcceptance, false);
  assert.equal(evidence.primaryMemoryAcceptance, false);
  assert.equal(evidence.diagnosticOnly, true);
  assert.equal(evidence.sourceBytes, 2958573265);
  assert.equal(evidence.sourceSha256, "31f36695b5b44c62125a9e4264e84dc085accd21c02cc3487aae597f54b9db34");
  assert.equal(evidence.metrics.outputBytes, 0);
  assert.equal(evidence.allocatorSamples.length, 65);
  assert.equal(evidence.allocatorSamplesEvicted, 0);
  const last = evidence.allocatorSamples.at(-1);
  assert.equal(last.phase, 17);
  assert.equal(last.encoder, false);
  assert.equal(last.codecId, 173);
  assert.equal(last.width, 1920);
  assert.equal(last.height, 808);
  assert.equal(last.dynamicHeapBytes, 30357488);
  assert.equal(last.freeDynamicBytes, 24400);
  assert.equal(last.unclaimedHeapBytes, 165872);
  evidence.allocatorSamples.forEach((r, i) => {
    assert.equal(r.sequence, i + 1);
    assert.equal(r.freeBlockSizeBuckets.length, 32);
  });
  const completedEncoderRequests = evidence.allocatorSamples.filter((r) => r.encoder && r.phase === 18);
  assert.equal(completedEncoderRequests.length, 5);
  assert.ok(completedEncoderRequests.every((r) => r.frameBufferBytes === 2529861));
  assert.equal(evidence.nextChangedCandidate.idleEncoderBufferBytesAtFailure, null);
  assert.equal(evidence.nextChangedCandidate.provenFit, false);
  assert.equal(evidence.nextChangedCandidate.provenFidelity, false);
  assert.equal(evidence.nextChangedCandidate.provenSpeedGain, false);
  assert.equal(createHash("sha256").update(await source(
    "media/ffmpeg/patches/mpeg2-encoder-uncached-frame-buffers.patch")).digest("hex"),
  evidence.nextChangedCandidate.formattedPatchSha256);
});
