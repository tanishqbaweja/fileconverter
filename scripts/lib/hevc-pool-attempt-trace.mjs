// Attribute only a complete uncapped native pool-get chronology at an OOM.
import assert from "node:assert/strict";
import { hevcAuxiliaryPoolBytes } from "./hevc-auxiliary-pool-bytes.mjs";
import { summarizeFramePlaneTrace } from "./mpeg2-frame-plane-trace.mjs";

const keys = ["kind", "sequence", "phase", "requestPool", "succeeded", "layer", "activeDpbFrames",
  "shortReferenceFrames", "longReferenceFrames", "outputPendingFrames", "pools", "scope"];
const integer = (value, min, max) => Number.isSafeInteger(value) && value >= min && value <= max;
function inventory(row) {
  return hevcAuxiliaryPoolBytes({ kind: "hevc-auxiliary-pools", sequence: row.sequence,
    phase: "before-encoder-send", layer: row.layer, activeDpbFrames: row.activeDpbFrames,
    shortReferenceFrames: row.shortReferenceFrames, longReferenceFrames: row.longReferenceFrames,
    outputPendingFrames: row.outputPendingFrames, pools: row.pools,
    scope: "simultaneous-read-only-pools-not-free-blocks-not-acceptance" });
}
export function summarizeHevcPoolAttempts(events, { error = "", eventsEvicted = 0 } = {}) {
  assert.ok(Array.isArray(events) && events.length <= 240);
  assert.ok(integer(eventsEvicted, 0, Number.MAX_SAFE_INTEGER));
  for (const row of events) assert.ok(["frame-plane-allocation", "hevc-pool-event"].includes(row?.kind));
  const planeTrace = summarizeFramePlaneTrace(events.filter((row) => row.kind === "frame-plane-allocation"),
    { error, eventsEvicted });
  const rows = events.filter((row) => row.kind === "hevc-pool-event"); assert.ok(rows.length <= 48);
  const completePrefix = eventsEvicted === 0 && rows[0]?.sequence === 1;
  let pending = null, completedRequests = 0, successfulRequests = 0;
  for (let index = 0; index < rows.length; index++) {
    const row = rows[index];
    assert.equal(Object.keys(row).sort().join("|"), keys.slice().sort().join("|"));
    assert.equal(row.scope, "allocation-time-read-only-pools-not-free-blocks-not-acceptance");
    assert.ok(integer(row.sequence, 1, 48) && integer(row.layer, 0, 1));
    if (index > 0) assert.equal(row.sequence, rows[index - 1].sequence + 1);
    assert.ok(integer(row.activeDpbFrames, 0, 32));
    for (const field of ["shortReferenceFrames", "longReferenceFrames", "outputPendingFrames"])
      assert.ok(integer(row[field], 0, row.activeDpbFrames));
    if (row.phase === "before-encoder-send") {
      assert.equal(row.requestPool, null); assert.equal(row.succeeded, null);
      if (completePrefix) assert.equal(pending, null);
    } else {
      assert.ok(["tab_mvf", "rpl_tab"].includes(row.requestPool));
      if (row.phase === "before-pool-get") {
        assert.equal(row.succeeded, null);
        if (completePrefix) { assert.equal(pending, null); pending = row; }
      } else {
        assert.equal(row.phase, "after-pool-get"); assert.equal(typeof row.succeeded, "boolean");
        if (completePrefix) {
          assert.ok(pending); assert.equal(row.requestPool, pending.requestPool); assert.equal(row.layer, pending.layer);
          completedRequests++; successfulRequests += Number(row.succeeded); pending = null;
        }
      }
    }
  }
  const capReached = rows.at(-1)?.sequence === 48;
  const nativePoolAbort = /OOM|Cannot enlarge memory arrays/.test(error)
    && /av_refstruct_pool_get/.test(error) && /alloc_frame|within_hevc_pool_get/.test(error);
  const failedAttempt = completePrefix && !capReached && nativePoolAbort && events.at(-1) === pending ? pending : null;
  const bytes = failedAttempt ? inventory(failedAttempt) : null;
  const requested = bytes?.available ? failedAttempt.pools.find((row) => row.name === failedAttempt.requestPool) : null;
  return {
    scope: "ordered-instrumented-hevc-get-boundary-not-normal-placement-not-acceptance",
    events: events.length, poolEvents: rows.length, completePrefix, capReached,
    completedRequests: completePrefix ? completedRequests : null,
    successfulRequests: completePrefix ? successfulRequests : null, planeTrace, failedAttempt,
    exactFailedPool: failedAttempt?.requestPool ?? null,
    statisticsAvailable: bytes?.available === true,
    actualLiveBackingBytes: bytes?.available ? bytes.requestedLiveBytes : null,
    actualInactiveBackingBytes: bytes?.available ? bytes.requestedCachedBytes : null,
    requestedEntryBackingBytes: bytes?.available ? requested.backingBytesPerEntry : null,
    simultaneousPools: bytes?.available ? bytes.pools : null,
    contiguousFreeBlockCapacity: null, measuredRuntimeSavingsBytes: null,
    safeLiveReferenceRemoval: false, speedGainClaim: null, publicAcceptance: false,
    limits: "Only this instrumented layer and exact pre-get boundary. DPB flag categories overlap and omit not-yet-flagged frames; pool live counts may differ. No all-layer/free-heap/contiguous-capacity/savings or normal-core attribution. Missing, stale, evicted or capped measurements stay unavailable.",
  };
}
