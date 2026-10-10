// Single command substitution on an isolated Git tree, canonical file untouched.
import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { CANONICAL_NONDOCKER_WORKFLOW_SHA256 } from "./late-slot-build-workflow.mjs";
export function makeEncoderPlaneBuildWorkflow(source) {
  assert.equal(createHash("sha256").update(source).digest("hex"), CANONICAL_NONDOCKER_WORKFLOW_SHA256);
  const before = "            bash media/ffmpeg/build-mpeg2-split-encoder.sh";
  const after = "            node media/ffmpeg/build-mpeg2-encoder-planes.mjs";
  assert.equal(source.split(before).length, 2);
  const generated = source.replace(before, after);
  assert.equal(generated.replace(after, before), source); return generated;
}
