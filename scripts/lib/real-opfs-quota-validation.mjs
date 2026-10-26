// Browser-enforced per-origin quota in an owned test profile, NOT physical disk
// exhaustion, OS permission revocation, a fabricated DOMException or publication.
import assert from "node:assert/strict";
// Chromium requests at least1MiB capacity even for a tiny SyncAccessHandle write.
// Leave64KiB test-only headroom so the target is a later write, not header open.
// This is a fault-test parameter, never the converter's memory/quality limit.
export const REAL_OPFS_QUOTA_BYTES = 1048576 + 65536;
export const REAL_OPFS_QUOTA_CASES = Object.freeze([
  Object.freeze({ source: "flac", destination: "opus", realQuotaFailure: true }),
  Object.freeze({ source: "flac", destination: "opus", artwork: "png", repeated: true, recoveryAfterRealQuota: true }),
]);
export function validateRealOpfsQuotaFailure(state, { quota, storageBefore, storageAfter, faultParameterPresent } = {}) {
  assert.equal(quota?.overrideActive, true); assert.equal(quota.quota, REAL_OPFS_QUOTA_BYTES);
  assert.equal(faultParameterPresent, false, "Do not substitute the existing injected quota/write path");
  assert.equal(state.jobState, "error"); assert.equal(state.workerStatus, "ready");
  assert.match(state.error, /quota|no space|not enough space|insufficient space/i);
  assert.doesNotMatch(state.error, /bounded metadata limit|tags and cover exceed|Audio metadata exceeds/i);
  assert.equal(state.opfsName, null); assert.deepEqual(state.opfsNames, []);
  assert.deepEqual(storageBefore, []); assert.deepEqual(storageAfter, []);
  const metrics = state.metrics;
  assert.ok(metrics.inputBytes > 0 && metrics.outputBytes > 0, "Require actual native input AND acknowledged output before quota exhaustion");
  assert.ok(metrics.outputBytes <= REAL_OPFS_QUOTA_BYTES);
  assert.equal(metrics.peakWasmMemoryBytes, 33554432); assert.equal(metrics.pendingOperations, 0); assert.equal(metrics.queuedBytes, 0);
  assert.equal(metrics.peakPendingOperations, 1);
  for (const value of [metrics.maxReadChunkBytes, metrics.maxWriteChunkBytes, metrics.peakQueuedBytes]) assert.ok(value > 0 && value <= 262144);
  return { status: "passed-private-browser-enforced-quota-failure", quotaBytes: REAL_OPFS_QUOTA_BYTES,
    actualNativeReadAndWrite: true, noRetainedPartialOutput: true, workerRecovered: true,
    errorInjectionUsed: false, browserOriginQuotaOverrideUsed: true, physicalDiskExhausted: false,
    osPermissionRevocationTested: false, outputAcceptance: false, publicAcceptance: false };
}
