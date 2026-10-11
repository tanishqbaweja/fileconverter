// Offline actual-body arithmetic; never execute malloc or read codec payloads.
import assert from "node:assert/strict";
import { sha } from "./stable-ui-headless-baseline-recipe.mjs";
import { reverseSingleIdlePlaneGetBuffer } from "../../media/ffmpeg/mpeg2-encoder-plane-source.mjs";
export function reconstructExecutedHevcGetBuffer(encoderSource) {
  assert.equal(sha(encoderSource), "bb93754bc4f830df6d55043a6231992a3d34e1f75e6b556734d989560aba489f");
  const base = reverseSingleIdlePlaneGetBuffer(encoderSource);
  const before = `        // Private MPEG2 core: free inactive encoder planes on last unref.
        // Preserve upstream layout, padding, zeroing and all live references.
        // Decoder pools and codec algorithms remain unchanged.
        pic->buf[i] = av_codec_is_encoder(s->codec)
`;
  const after = `        // Private specialist core: no inactive encoder / HEVC plane cache.
        // Preserve upstream layout, padding, zeroing and all live references.
        // Other decoder pools and auxiliary reference pools remain unchanged.
        pic->buf[i] = (av_codec_is_encoder(s->codec) ||
                       s->codec_id == AV_CODEC_ID_HEVC)
`;
  assert.equal(base.split(before).length, 2); const generated = base.replace(before, after);
  assert.equal(sha(generated), "910da6292a78066b114da7d26c7c1684969022960efc8becf116dc2b5acc4ab4");
  assert.equal(generated.replace(after, before), base);
  return { generated, generatedSha256: sha(generated), encoderSourceSha256: sha(encoderSource), baseSha256: sha(base), edits: [[before, after]] };
}
export function deriveAlignment16FirstMallocCapacity({ wrapperText, allocatorText, frameText, fatalInstruction, frameInstructionContext, failure, getBufferSource }) {
  assert.equal(fatalInstruction, "call 4436 <emscripten_builtin_malloc>");
  assert.equal(failure.phase, "fast-malloc-pending"); assert.equal(failure.freshUnexposedPointerFreed, false);
  assert.equal(failure.freshUnexposedPointer, 0);
  assert.ok(Number.isSafeInteger(failure.wrapperRequestedBytes) && failure.wrapperRequestedBytes >= 262144 && failure.wrapperRequestedBytes < 0x7ffff000);
  assert.equal(failure.failedIndividualAllocationBytes, failure.wrapperRequestedBytes);
  assert.equal([...wrapperText.matchAll(/call \$emscripten_builtin_malloc/g)].length, 2);
  assert.match(wrapperText, /i32\.const 1918748\s+i32\.const 1\s+i32\.store[\s\S]{0,450}?local\.get \$p1\s+call \$emscripten_builtin_malloc/);
  assert.match(allocatorText, /local\.get \$p0\s+i32\.const 19\s+i32\.add\s+local\.tee \$l1\s+i32\.const -16\s+i32\.and/);
  assert.match(frameText, /local\.get \$p2\s+i32\.load offset=84\s+local\.set \$l3[\s\S]{0,350}?local\.get \$l3\s+call \$av_buffer_allocz/);
  assert.match(frameInstructionContext, /11b1f8:[^\n]*i32\.load 2 84[\s\S]*11b20b:[^\n]*call 4188 <av_buffer_allocz>/);
  assert.equal(sha(getBufferSource), "910da6292a78066b114da7d26c7c1684969022960efc8becf116dc2b5acc4ab4");
  assert.ok(getBufferSource.includes("size_t buffer_size[4];")); assert.ok(getBufferSource.includes("av_buffer_allocz(pool->buffer_size[i])"));
  const free = failure.allocatorFreeBlocks;
  assert.equal(free.complete, true); assert.equal(free.allocatorMutated, false); assert.equal(free.payloadRead, false);
  const chunkBytes = Math.floor((failure.wrapperRequestedBytes + 19) / 16) * 16;
  assert.ok(free.largestFreeChunkBytes < chunkBytes); assert.ok(free.totalFreeChunkBytes > chunkBytes);
  const contiguousTailUpperBoundBytes = free.topChunkBytes + free.unclaimedMemoryAboveSegmentBytes;
  assert.ok(contiguousTailUpperBoundBytes < chunkBytes);
  return { actualMallocArgumentBytes: failure.wrapperRequestedBytes, derivedAllocatorChunkBytes: chunkBytes,
    requestNormalization: "Exact compiled (request + 19) & -16 for this actual nonoverflowing first-malloc request",
    largestFreeChunkBytes: free.largestFreeChunkBytes, freeChunkShortfallBytes: chunkBytes - free.largestFreeChunkBytes,
    totalFreeChunkBytes: free.totalFreeChunkBytes, contiguousTailUpperBoundBytes,
    contiguousTailShortfallBytes: chunkBytes - contiguousTailUpperBoundBytes,
    actualCompiledRequestedSizeFieldOffset: 84, sourceInformedPlaneIndex: 2,
    planeIdentification: "Original fatal PC loads FramePool.buffer_size[2] in actual get_buffer2 body; source-informed layout join, no live frame payload read",
    fragmentedFreeCapacityForThisFirstMallocProven: true, whyHeapFragmentedProven: false, retainedLiveInventoryKnown: false,
    upstreamFallbackWasFailure: false, originalFailedRequestNotRewritten: true,
    allocatorHeapRaised: false, runtimeFixProven: false, fullOriginalAcceptance: false, publicAcceptance: false, speedGainProven: false };
}
