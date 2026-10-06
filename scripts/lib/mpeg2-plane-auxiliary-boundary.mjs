// Correlate ordered scalar events, not stale last-per-pool values or free heap.
import assert from "node:assert/strict";
import { summarizeFramePlaneTrace } from "./mpeg2-frame-plane-trace.mjs";
import { hevcAuxiliaryPoolBytes } from "./hevc-auxiliary-pool-bytes.mjs";

export function summarizePlaneAuxiliaryBoundary(events, { error = "", eventsEvicted = 0 } = {}) {
  assert.ok(Array.isArray(events) && events.length <= 240);
  for (const row of events) assert.ok(["frame-plane-allocation", "hevc-auxiliary-pools"].includes(row?.kind));
  const planes = events.filter((row) => row.kind === "frame-plane-allocation");
  const planeTrace = summarizeFramePlaneTrace(planes, { error, eventsEvicted });
  const auxiliary = events.filter((row) => row.kind === "hevc-auxiliary-pools");
  assert.ok(auxiliary.length <= 48);
  for (let i = 1; i < auxiliary.length; i++) assert.equal(auxiliary[i].sequence, auxiliary[i - 1].sequence + 1);
  const failed = planeTrace.failedAllocation;
  const boundary = auxiliary.at(-1) ?? null;
  const after = boundary ? events.slice(events.lastIndexOf(boundary) + 1) : [];
  const completeBoundaryPrefix = eventsEvicted === 0 && auxiliary[0]?.sequence === 1;
  const auxiliaryCapReached = boundary?.sequence === 48;
  const sameEncoderSend = Boolean(failed?.encoder && boundary && completeBoundaryPrefix && !auxiliaryCapReached
    && events.at(-1) === planes.at(-1) && after.length > 0
    && after.every((row) => row.kind === "frame-plane-allocation" && row.encoder && row.codecId === failed.codecId));
  const bytes = sameEncoderSend ? hevcAuxiliaryPoolBytes(boundary) : null;
  return {
    scope: "ordered-instrumented-boundary-not-free-blocks-not-conversion-acceptance",
    events: events.length, auxiliaryEvents: auxiliary.length, auxiliaryCapReached,
    completeBoundaryPrefix, sameEncoderSend, planeTrace,
    lastBoundary: boundary, boundaryLayer: boundary?.layer ?? null, boundaryAvailable: bytes?.available === true,
    boundaryBytes: bytes?.available ? bytes : null,
    actualInactiveHevcBackingBytes: bytes?.available ? bytes.requestedCachedBytes : null,
    actualLiveHevcBackingBytes: bytes?.available ? bytes.requestedLiveBytes : null,
    safeLiveReferenceRemoval: false, contiguousFreeBlockCapacity: null,
    measuredRuntimeSavingsBytes: null, speedGainClaim: null, publicAcceptance: false,
    limits: "One observed layer at this instrumented encoder-send boundary; not an all-layer aggregate, free heap, contiguous capacity or saving from releasing live references.",
  };
}
