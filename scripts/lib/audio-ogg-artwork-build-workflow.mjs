import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { makeAudioRepeatedCommentBuildWorkflow } from "./audio-repeated-comment-build-workflow.mjs";
export function makeAudioOggArtworkBuildWorkflow(source) {
  const base = makeAudioRepeatedCommentBuildWorkflow(source);
  const before = "node media/ffmpeg/build-audio-repeated-metadata-candidate.mjs", after = "node media/ffmpeg/build-audio-ogg-artwork-candidate.mjs";
  assert.equal(base.generated.split(before).length, 2);
  const generated = base.generated.replace(before, after); assert.equal(generated.replace(after, before), base.generated);
  return { generated, generatedSha256: createHash("sha256").update(generated).digest("hex"),
    scope: "isolated-private-Ogg-artwork-build-only", originalSdkDependencyAndCleanupStepsRetained: true, publicAcceptance: false };
}
