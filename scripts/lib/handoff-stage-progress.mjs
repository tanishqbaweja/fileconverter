import assert from "node:assert/strict";
import { recordStagedOutputWorkCheckpoint,MP4_DESTINATION_COPY_PHASE } from "./staged-output-work-checkpoints.mjs";
export function recordHandoffStageProgress(probe,state) {
  // A real budget failure can request cancellation while copying. This is not
  // an encoding restart and must not hide/replace the primary memory failure.
  if(probe.finalDestinationCopyObservation&&state?.jobState==="running"&&state.phase==="Cancelling safely") {
    probe.copyCancellationObserved=true;return;
  }
  if(state?.jobState==="running"&&state.phase===MP4_DESTINATION_COPY_PHASE) {
    assert.equal(state.metrics.peakWasmMemoryBytes,50331648);
    // The retiring codec's last copy-start notification may still carry its
    // live heaps; the saver then reports0. OS private memory remains primary.
    assert.ok([0,50331648].includes(state.metrics.wasmMemoryBytes));
  }
  return recordStagedOutputWorkCheckpoint(probe,state);
}
