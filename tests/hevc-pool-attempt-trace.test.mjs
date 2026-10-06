import assert from "node:assert/strict";
import test from "node:test";
import { summarizeHevcPoolAttempts } from "../scripts/lib/hevc-pool-attempt-trace.mjs";

const error = "OOM\nav_refstruct_pool_get\nalloc_frame";
const event = (sequence, phase, pool = "tab_mvf", mvLive = 0, rplLive = 0) => ({
  kind: "hevc-pool-event", sequence, phase, requestPool: phase === "before-encoder-send" ? null : pool,
  succeeded: phase === "after-pool-get" ? true : null, layer: 0,
  activeDpbFrames: 5, shortReferenceFrames: 5, longReferenceFrames: 0, outputPendingFrames: 2,
  pools: ["tab_mvf", "rpl_tab"].map((name, i) => ({ name, configured: true, statisticsComplete: true,
    payloadBytes: 1024, backingBytesPerEntry: 1040, liveEntries: i === 0 ? mvLive : rplLive, cachedEntries: 0 })),
  scope: "allocation-time-read-only-pools-not-free-blocks-not-acceptance",
});
test("Complete uncapped pre/post pool chronology attributes only the pending native abort and simultaneous bytes", () => {
  const rows = [event(1, "before-pool-get"), event(2, "after-pool-get", "tab_mvf", 1),
    event(3, "before-pool-get", "rpl_tab", 1)];
  const result = summarizeHevcPoolAttempts(rows, { error });
  assert.equal(result.exactFailedPool, "rpl_tab"); assert.equal(result.failedAttempt, rows[2]);
  assert.equal(result.completedRequests, 1); assert.equal(result.successfulRequests, 1);
  assert.equal(result.actualLiveBackingBytes, 1040); assert.equal(result.actualInactiveBackingBytes, 0);
  assert.equal(result.requestedEntryBackingBytes, 1040); assert.equal(result.statisticsAvailable, true);
  assert.equal(result.contiguousFreeBlockCapacity, null); assert.equal(result.measuredRuntimeSavingsBytes, null);
  assert.equal(result.safeLiveReferenceRemoval, false); assert.equal(result.publicAcceptance, false);
  assert.match(result.limits, /pool live counts may differ/);
  // The extra pinned HEVC wrapper may occupy the last visible native frame.
  assert.equal(summarizeHevcPoolAttempts(rows,
    { error: "OOM\nav_refstruct_pool_get\nwithin_hevc_pool_get" }).exactFailedPool, "rpl_tab");
});
test("Missing, incomplete, evicted, capped and non-aborting observations cannot invent cache bytes or pool failure", () => {
  const incomplete = event(1, "before-pool-get"); incomplete.pools[0].statisticsComplete = false;
  const unknown = summarizeHevcPoolAttempts([incomplete], { error });
  assert.equal(unknown.exactFailedPool, "tab_mvf"); assert.equal(unknown.actualLiveBackingBytes, null);
  assert.equal(unknown.actualInactiveBackingBytes, null); assert.equal(unknown.statisticsAvailable, false);
  const plane = (sequence, phase) => ({ kind: "frame-plane-allocation", sequence, phase,
    codecId: 173, encoder: false, contextWidth: 1920, contextHeight: 804, codedWidth: 1920, codedHeight: 808,
    width: 1920, height: 832, pixelFormat: 0, plane: 0, requestedBytes: 1600000, linesize: 1920,
    frameBufferBytes: phase === "before" ? 0 : 1600000, succeeded: phase === "before" ? null : true,
    scope: "scalar-request-not-heap-free-space-not-acceptance" });
  for (const [rows, options] of [[[], { error }], [[event(5, "before-pool-get")], { error }],
    [[event(48, "before-pool-get")], { error }], [[event(1, "before-pool-get")], { error, eventsEvicted: 1 }],
    [[event(1, "before-pool-get")], { error: "unrelated failure" }],
    [[event(1, "before-pool-get")], { error: "OOM\nav_refstruct_pool_get\nother_decoder" }],
    [[event(1, "before-encoder-send")], { error }],
    [[event(1, "before-pool-get"), plane(1, "before"), plane(2, "after")], { error }],
    [[event(2, "after-pool-get")], { error, eventsEvicted: 1 }]]) {
    const result = summarizeHevcPoolAttempts(rows, options);
    assert.equal(result.exactFailedPool, null); assert.equal(result.actualInactiveBackingBytes, null);
    assert.equal(result.measuredRuntimeSavingsBytes, null);
  }
});
test("Malformed pool chronology and unbounded/foreign telemetry are rejected, not patched into success", () => {
  assert.throws(() => summarizeHevcPoolAttempts(Array(241).fill(event(1, "before-pool-get")), { error }));
  assert.throws(() => summarizeHevcPoolAttempts([{ kind: "foreign" }], { error }));
  assert.throws(() => summarizeHevcPoolAttempts([event(1, "before-pool-get"), event(3, "after-pool-get")], { error }));
  assert.throws(() => summarizeHevcPoolAttempts([event(1, "after-pool-get")], { error }));
  assert.throws(() => summarizeHevcPoolAttempts([event(1, "before-pool-get"), event(2, "after-pool-get", "rpl_tab")], { error }));
  assert.throws(() => summarizeHevcPoolAttempts([event(1, "before-pool-get"), event(2, "before-encoder-send")], { error }));
  const extra = event(1, "before-pool-get"); extra.address = 16;
  assert.throws(() => summarizeHevcPoolAttempts([extra], { error }));
});
