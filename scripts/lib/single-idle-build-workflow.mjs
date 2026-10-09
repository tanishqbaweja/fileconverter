// Registered workflow only on an isolated Git tree; canonical bytes untouched.
import assert from "node:assert/strict";
import { makeLateSlotBuildWorkflow, LATE_SLOT_WORKFLOW_AFTER } from "./late-slot-build-workflow.mjs";
export function makeSingleIdleBuildWorkflow(source) {
  const late = makeLateSlotBuildWorkflow(source);
  const after = "            node media/ffmpeg/build-mpeg2-single-idle.mjs\n";
  assert.equal(late.split(LATE_SLOT_WORKFLOW_AFTER).length, 2);
  const generated = late.replace(LATE_SLOT_WORKFLOW_AFTER, after);
  assert.equal(generated.replace(after, LATE_SLOT_WORKFLOW_AFTER), late);
  return generated;
}
