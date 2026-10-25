import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { makeAudioOggArtworkBuildWorkflow } from "./audio-ogg-artwork-build-workflow.mjs";
export function makeAudioOggArtworkLowerCopyBuildWorkflow(source) {
  const base = makeAudioOggArtworkBuildWorkflow(source);
  const before = "node media/ffmpeg/build-audio-ogg-artwork-candidate.mjs", after = "node media/ffmpeg/build-audio-ogg-artwork-lower-copy-candidate.mjs";
  assert.equal(base.generated.split(before).length, 2);
  const generated = base.generated.replace(before, after); assert.equal(generated.replace(after, before), base.generated);
  return { generated, generatedSha256: createHash("sha256").update(generated).digest("hex"),
    scope: "isolated-private-lower-copy-Ogg-artwork-build", originalSdkDependencyAndCleanupStepsRetained: true, publicAcceptance: false };
}
