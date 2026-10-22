import assert from "node:assert/strict";
import { createHash } from "node:crypto";
// Exact expected length comes from the independently counted AAC-LC packets.
// Neither the PCM nor its trailing region is retained in a chunk collection.
export function createStreamingPcmTrimDigest({ channels, expectedSamples, leadingSamples, trailingSamples }) {
  assert.ok(Number.isSafeInteger(channels) && channels >= 1 && channels <= 8);
  for (const value of [expectedSamples, leadingSamples, trailingSamples]) assert.ok(Number.isSafeInteger(value) && value >= 0);
  assert.ok(expectedSamples > leadingSamples + trailingSamples);
  const frameBytes = channels * 2, expectedBytes = expectedSamples * frameBytes;
  assert.ok(Number.isSafeInteger(expectedBytes) && expectedBytes <= 64 * 1024 ** 3);
  const start = leadingSamples * frameBytes, end = expectedBytes - trailingSamples * frameBytes;
  const raw = createHash("sha256"), audible = createHash("sha256"); let bytes = 0, maximumChunk = 0, finished = false;
  return {
    update(chunk) {
      assert.equal(finished, false); assert.ok(chunk instanceof Uint8Array && chunk.length <= 262144);
      assert.ok(bytes + chunk.length <= expectedBytes, "PCM exceeds independently counted complete frames");
      raw.update(chunk); const from = Math.max(0, start - bytes), to = Math.min(chunk.length, end - bytes);
      if (to > from) audible.update(chunk.subarray(from, to));
      bytes += chunk.length; maximumChunk = Math.max(maximumChunk, chunk.length);
    },
    finish() {
      assert.equal(finished, false); finished = true; assert.equal(bytes, expectedBytes, "PCM is truncated or has incomplete frames");
      return { channels, bytesPerSample: 2, decodedBytes: bytes, rawSamplesPerChannel: expectedSamples,
        audibleSamplesPerChannel: expectedSamples - leadingSamples - trailingSamples,
        rawSha256: raw.digest("hex"), audibleSha256: audible.digest("hex"), maximumChunkBytes: maximumChunk, retainedPcmBytes: 0 };
    },
  };
}
