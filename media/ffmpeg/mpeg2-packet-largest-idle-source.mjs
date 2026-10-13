import assert from "node:assert/strict";
import { makePacketCacheBridge, makePacketCacheKernel } from "./mpeg2-packet-cache-source.mjs";
export { makePacketCacheKernel };
export function makeLargestIdleHeader(source) {
  const before = "    if (!cache->closed && !cache->idle)\n        cache->idle = lease;\n    else\n        within_packet_lease_free(lease);";
  const after = "    /* Keep one largest final-unreferenced allocation, never a live buffer. */\n    if (!cache->closed && (!cache->idle || lease->capacity > cache->idle->capacity)) {\n        if (cache->idle) within_packet_lease_free(cache->idle);\n        cache->idle = lease;\n    } else {\n        within_packet_lease_free(lease);\n    }";
  assert.equal(source.split(before).length, 2);
  const generated = source.replace(before, after); assert.equal(generated.replace(after, before), source);
  return generated;
}
export function makeLargestIdleBridge(source) {
  const prior = makePacketCacheBridge(source);
  const before = '#include "mpeg2-packet-cache.h"', after = '#include "mpeg2-packet-largest-idle.h"';
  assert.equal(prior.split(before).length, 2);
  const generated = prior.replace(before, after); assert.equal(generated.replace(after, before), prior);
  return generated;
}
export { makeLargestIdleBridge as makePacketCacheBridge };
