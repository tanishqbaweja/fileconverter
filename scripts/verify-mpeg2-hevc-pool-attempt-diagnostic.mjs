// Source-only primary audit, bounded and write-free; no native/media retry.
import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { readFile } from "node:fs/promises";
import { instrumentHevcPoolAttempts, reverseHevcPoolAttempts }
  from "../media/ffmpeg/mpeg2-hevc-pool-attempt-diagnostic.mjs";
import { HEVC_REFS_SOURCE_SHA256, instrumentHevcEncoderBoundary, reverseHevcEncoderBoundary }
  from "../media/ffmpeg/mpeg2-hevc-auxiliary-diagnostic.mjs";

const sha = (value) => createHash("sha256").update(value).digest("hex");
const response = await fetch("https://raw.githubusercontent.com/FFmpeg/FFmpeg/n8.1.2/libavcodec/hevc/refs.c",
  { signal: AbortSignal.timeout(30000) }); assert.ok(response.ok);
const reader = response.body.getReader(), parts = []; let bytes = 0;
try {
  for (;;) {
    const row = await reader.read(); if (row.done) break;
    bytes += row.value.byteLength; assert.ok(bytes <= 32768); parts.push(row.value);
  }
} finally { await reader.cancel(); reader.releaseLock(); }
const original = Buffer.concat(parts).toString("utf8"); assert.equal(sha(original), HEVC_REFS_SOURCE_SHA256);
const instrumented = instrumentHevcPoolAttempts(original);
assert.equal(original.match(/av_refstruct_pool_get\(/g)?.length, 2);
assert.equal(instrumented.match(/av_refstruct_pool_get\(/g)?.length, 1);
assert.equal(reverseHevcPoolAttempts(instrumented), original);
assert.throws(() => instrumentHevcPoolAttempts(instrumented));
assert.throws(() => instrumentHevcPoolAttempts(original.replace("av_refstruct_pool_get", "altered_get")));
assert.throws(() => reverseHevcPoolAttempts(instrumented.replace("return obj;", "return NULL;")));
assert.throws(() => reverseHevcPoolAttempts(instrumented.replace("within_hevc_pool_get(s, l, 1)", "within_hevc_pool_get(s, l, 0)")));
const root = new URL("../", import.meta.url), sources = {};
for (const file of ["media/ffmpeg/mpeg2-hevc-pool-attempt-diagnostic.mjs", "media/ffmpeg/mpeg2-hevc-pool-attempt-diagnostic.h",
  "scripts/verify-mpeg2-hevc-pool-attempt-diagnostic.mjs", "scripts/lib/hevc-pool-attempt-trace.mjs"])
  sources[file] = sha(await readFile(new URL(file, root)));
const kernel = await readFile(new URL("media/ffmpeg/mpeg2-candidate.c", root), "utf8");
assert.equal(reverseHevcEncoderBoundary(instrumentHevcEncoderBoundary(kernel)), kernel);
const failure = JSON.parse(await readFile(new URL("evidence/mpeg2-hevc-auxiliary-trial-failure-2026-10-06.json", root)));
assert.match(failure.protected.error, /av_refstruct_pool_get/); assert.match(failure.protected.error, /alloc_frame/);
assert.equal(failure.allocation.exactFailedPool, null);
process.stdout.write(`${JSON.stringify({ status: "source-only-hevc-allocation-boundary-observer-not-acceptance",
  sources, upstreamSource: { file: "libavcodec/hevc/refs.c", bytes, sha256: sha(original) },
  instrumentedSourceSha256: sha(instrumented), byteExactSourceReversal: true,
  byteExactKernelReversal: true, mutationNegativeControlsPassed: true, exactPoolCallSites: 2,
  originalGetterCallsPerAttempt: 1, sharedHevcEventCap: 48, planeEventCap: 192, browserEventCap: 240,
  inactiveLinkWalkCap: 128, nativeInventoryBytes: 48,
  sharedEventPhases: ["before-pool-get", "after-pool-get", "before-encoder-send"],
  allocationPolicyChanged: false, liveReferencesChanged: false, codecSettingsChanged: false,
  normalWrapperChanged: false, sourceDimensionsChanged: false,
  compiledObserverVerified: false, actualFailedPool: null, actualLiveBackingBytesAtFailure: null,
  actualInactiveBackingBytesAtFailure: null, measuredRuntimeSavingsBytes: null, speedGainClaim: null,
  publicAcceptance: false, primaryMemoryAcceptance: false, generatedSourceFilesCreated: 0, scratchFilesCreated: 0,
  next: "One changed no-Docker dlmalloc/hevc-mpeg4 plane-diagnostic build, mandatory same-allocator reader/selector/lifecycle units, small fidelity/adverse gates and one original-size diagnostic. No unchanged normal retry, larger heap, live-reference removal or acceptance/speed claim." })}\n`);
