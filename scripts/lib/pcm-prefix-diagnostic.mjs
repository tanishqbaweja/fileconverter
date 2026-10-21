// Small independent-validator diagnostic only. Never buffers complete PCM or
// chooses a trim by searching for a matching hash.
import assert from "node:assert/strict";
import { createHash } from "node:crypto";
export function createPcmPrefixDiagnostic({ channels, bytesPerSample = 2, declaredLeadingSamples, maximumBytes = 2 * 1024 ** 2 }) {
  assert.ok(Number.isInteger(channels) && channels >= 1 && channels <= 8);
  assert.ok([2, 4].includes(bytesPerSample));
  assert.ok(Number.isSafeInteger(declaredLeadingSamples) && declaredLeadingSamples >= 0 && declaredLeadingSamples <= 192000);
  assert.ok(Number.isSafeInteger(maximumBytes) && maximumBytes > 0 && maximumBytes <= 4 * 1024 ** 2);
  const frameBytes = channels * bytesPerSample, trimBytes = declaredLeadingSamples * frameBytes;
  assert.ok(trimBytes <= maximumBytes);
  const raw = createHash("sha256"), afterDeclaredPrefix = createHash("sha256");
  let bytes = 0, ended = false, largestChunk = 0;
  return {
    update(chunk) {
      assert.equal(ended, false); assert.ok(chunk instanceof Uint8Array && chunk.byteLength <= 262144);
      assert.ok(bytes + chunk.byteLength <= maximumBytes, "Small-fixture PCM cap exceeded");
      raw.update(chunk);
      afterDeclaredPrefix.update(chunk.subarray(Math.min(chunk.byteLength, Math.max(0, trimBytes - bytes))));
      bytes += chunk.byteLength; largestChunk = Math.max(largestChunk, chunk.byteLength);
    },
    finish() {
      assert.equal(ended, false); ended = true;
      assert.equal(bytes % frameBytes, 0, "Partial PCM sample frame");
      assert.ok(bytes >= trimBytes, "Declared trim exceeds decoded samples");
      return { channels, bytesPerSample, decodedBytes: bytes, decodedSamplesPerChannel: bytes / frameBytes,
        rawSha256: raw.digest("hex"), declaredLeadingSamples,
        afterDeclaredPrefixSamplesPerChannel: (bytes - trimBytes) / frameBytes,
        afterDeclaredPrefixSha256: afterDeclaredPrefix.digest("hex"), largestChunkBytes: largestChunk,
        retainedPcmBytes: 0, scope: "diagnosis-only-not-a-fidelity-pass-or-automatic-trim-policy" };
    },
  };
}
