// Separate production encoding and final-save counters; neither is acceptance.
// Keep the historical single-stage observer byte-exact for old evidence.
import assert from "node:assert/strict";
import { recordOutputWorkCheckpoint } from "./split-copy-work-checkpoints.mjs";
export const MP4_DESTINATION_COPY_PHASE = "Copying staged MP4 to selected destination";
const safeCount = value => Number.isSafeInteger(value) && value >= 0;
export function recordStagedOutputWorkCheckpoint(probe, state) {
  if (state?.jobState !== "running") return;
  if (state.phase !== MP4_DESTINATION_COPY_PHASE) {
    assert.ok(!probe.finalDestinationCopyObservation, "Reject return to encoding after final destination copy");
    return recordOutputWorkCheckpoint(probe, state);
  }
  assert.equal(state.selectedProfileId, "mkv-to-mp4", "Only the measured production MP4 staging route is recognized");
  const m = state.metrics;
  if (!m || ![m.inputBytes, m.outputBytes, m.scratchBytes].every(safeCount) ||
      !Number.isFinite(m.elapsedMs) || m.elapsedMs < 0) {
    probe.unavailableProgressSamples++; return;
  }
  assert.ok(m.scratchBytes > 0 && m.outputBytes <= m.scratchBytes, "Destination copy must remain within the staged file");
  // Production emits copy-start before the first scratch read/write; these
  // optional maxima do not exist yet. Do not replace absence with a measured0.
  for (const field of ["maxScratchReadChunkBytes", "maxScratchWriteChunkBytes"])
    if (m[field] != null) assert.ok(safeCount(m[field]) && m[field] <= 524288, field);
  assert.ok(safeCount(m.maxWriteChunkBytes) && m.maxWriteChunkBytes <= 524288 && m.peakQueuedBytes <= 524288 &&
    m.peakPendingOperations <= 1, "Existing fixed512KiB final-copy bounds must hold");
  const current = { inputBytes: m.inputBytes, outputBytes: m.outputBytes, elapsedMs: m.elapsedMs };
  const copy = probe.finalDestinationCopyObservation, previous = copy?.last ?? probe.lastProgressObservation;
  if (previous) assert.ok(current.elapsedMs >= previous.elapsedMs && current.inputBytes >= previous.inputBytes,
    "Reject reset/nonmonotonic elapsed or input counters at final copy");
  if (copy) {
    assert.equal(m.scratchBytes, copy.stagedBytes, "Staged size must remain fixed during destination copy");
    assert.equal(current.inputBytes, copy.first.inputBytes, "No new source reads during destination copy");
    assert.ok(current.outputBytes >= previous.outputBytes, "Reject reset/nonmonotonic destination-copy counters");
    copy.last = current;
  } else {
    probe.finalDestinationCopyObservation = { phase: MP4_DESTINATION_COPY_PHASE,
      stagedBytes: m.scratchBytes, encodingLast: probe.lastProgressObservation ?? null,
      first: current, last: current, scope: "Observed-stage-transition-not-completed-save-or-conversion-acceptance" };
  }
  // Never rewrite encoding windows, double-count bytes, infer save completion,
  // or skip a conversion/validation/memory/cleanup gate from this observation.
}
