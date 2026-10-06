import assert from "node:assert/strict";
import test from "node:test";
import { summarizePlaneAuxiliaryBoundary } from "../scripts/lib/mpeg2-plane-auxiliary-boundary.mjs";

const boundary = () => ({ kind: "hevc-auxiliary-pools", sequence: 1, phase: "before-encoder-send", layer: 0,
  activeDpbFrames: 6, shortReferenceFrames: 5, longReferenceFrames: 0, outputPendingFrames: 2,
  scope: "simultaneous-read-only-pools-not-free-blocks-not-acceptance",
  pools: ["tab_mvf", "rpl_tab"].map((name) => ({ name, configured: true, statisticsComplete: true,
    payloadBytes: 1024, backingBytesPerEntry: 1040, liveEntries: 6, cachedEntries: 0 })) });
const plane = (sequence, phase, extra = {}) => ({ kind: "frame-plane-allocation", sequence, phase,
  codecId: 2, encoder: true, contextWidth: 1920, contextHeight: 804, codedWidth: 1920, codedHeight: 804,
  width: 1952, height: 836, pixelFormat: 0, plane: 0, requestedBytes: 1600000, linesize: 1952,
  frameBufferBytes: phase === "before" ? 0 : 1600000, succeeded: phase === "before" ? null : true,
  scope: "scalar-request-not-heap-free-space-not-acceptance", ...extra });
const error = "Cannot enlarge memory arrays to size 33787904 bytes (OOM)\nav_buffer_allocz\navcodec_default_get_buffer2";
test("Only complete uncapped chronology links simultaneous HEVC pools to a failed encoder allocation", () => {
  const events = [boundary(), plane(1, "before")];
  const result = summarizePlaneAuxiliaryBoundary(events, { error });
  assert.equal(result.sameEncoderSend, true); assert.equal(result.boundaryAvailable, true);
  assert.equal(result.boundaryLayer, 0); assert.match(result.limits, /not an all-layer aggregate/);
  assert.equal(result.actualInactiveHevcBackingBytes, 0); assert.equal(result.actualLiveHevcBackingBytes, 12480);
  assert.equal(result.safeLiveReferenceRemoval, false); assert.equal(result.contiguousFreeBlockCapacity, null);
  assert.equal(result.measuredRuntimeSavingsBytes, null); assert.equal(result.publicAcceptance, false);
});
test("Missing, capped, incomplete, evicted or stale boundaries retain unknown cache bytes, not valid zero", () => {
  const capped = boundary(); capped.sequence = 48;
  const incomplete = boundary(); incomplete.pools[0].statisticsComplete = false;
  const stale = [boundary(), plane(1, "before", { encoder: false, codecId: 173 }),
    plane(2, "after", { encoder: false, codecId: 173 }), plane(3, "before")];
  for (const [events, options] of [[[], { error }], [[plane(1, "before")], { error }],
    [[capped, plane(1, "before")], { error }], [[incomplete, plane(1, "before")], { error }],
    [[boundary(), plane(1, "before")], { error, eventsEvicted: 1 }], [stale, { error }],
    [[boundary(), plane(1, "before"), plane(2, "after")], { error }]]) {
    const result = summarizePlaneAuxiliaryBoundary(events, options);
    assert.equal(result.boundaryAvailable, false); assert.equal(result.actualInactiveHevcBackingBytes, null);
    assert.equal(result.actualLiveHevcBackingBytes, null);
  }
});
test("Unknown event kinds, oversized histories and auxiliary sequence gaps are rejected", () => {
  assert.throws(() => summarizePlaneAuxiliaryBoundary([{ kind: "media-chunk" }]));
  assert.throws(() => summarizePlaneAuxiliaryBoundary(Array(241).fill(boundary())));
  assert.throws(() => summarizePlaneAuxiliaryBoundary([boundary(), { ...boundary(), sequence: 3 }]));
});
