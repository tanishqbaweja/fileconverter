import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { makeAudioMetadataBuildWorkflow } from "./audio-metadata-build-workflow.mjs";
export function makeAudioRepeatedCommentBuildWorkflow(source) {
  const base = makeAudioMetadataBuildWorkflow(source);
  const edits = [
    ["node media/ffmpeg/build-audio-text-metadata-candidate.mjs", "node media/ffmpeg/build-audio-repeated-metadata-candidate.mjs"],
    ["            work/ffmpeg-nondocker-output/config_components.h\n", "            work/ffmpeg-nondocker-output/oggparsevorbis.parent.c\n" +
      "            work/ffmpeg-nondocker-output/oggparsevorbis.repeated.c\n" +
      "            work/ffmpeg-nondocker-output/audio-repeated-comment-source.json\n            work/ffmpeg-nondocker-output/config_components.h\n"],
  ];
  let generated = base.generated;
  for (const [before, after] of edits) { assert.equal(generated.split(before).length, 2); generated = generated.replace(before, after); }
  let reversed = generated;
  for (const [before, after] of edits.toReversed()) reversed = reversed.replace(after, before);
  assert.equal(reversed, base.generated);
  return { generated, generatedSha256: createHash("sha256").update(generated).digest("hex"),
    scope: "isolated-private-build-branch-only", originalSdkDependencyAndCleanupStepsRetained: true, publicAcceptance: false };
}
