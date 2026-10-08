// The registered workflow is invoked on an isolated Git tree; canonical bytes
// stay untouched. Only its existing private aligned-builder command changes.
import assert from "node:assert/strict";
import { createHash } from "node:crypto";
export const CANONICAL_NONDOCKER_WORKFLOW_SHA256 = "cda0b434adc7dd36109b4a2cc63fe726a507889cf6d1c0f5862d5d78dbf5c965";
export const LATE_SLOT_WORKFLOW_BEFORE = "            node media/ffmpeg/build-mpeg2-aligned-reuse.mjs\n";
export const LATE_SLOT_WORKFLOW_AFTER = "            node media/ffmpeg/build-mpeg2-late-refstruct.mjs\n";
export function makeLateSlotBuildWorkflow(source) {
  assert.equal(createHash("sha256").update(source).digest("hex"), CANONICAL_NONDOCKER_WORKFLOW_SHA256);
  assert.equal(source.split(LATE_SLOT_WORKFLOW_BEFORE).length, 2);
  const generated = source.replace(LATE_SLOT_WORKFLOW_BEFORE, LATE_SLOT_WORKFLOW_AFTER);
  assert.equal(generated.split(LATE_SLOT_WORKFLOW_AFTER).length, 2);
  assert.equal(generated.replace(LATE_SLOT_WORKFLOW_AFTER, LATE_SLOT_WORKFLOW_BEFORE), source);
  return generated;
}
