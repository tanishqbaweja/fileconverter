import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { makeAudioOggArtworkBuildWorkflow } from "./audio-ogg-artwork-build-workflow.mjs";
export function makeMp3InputGainBuildWorkflow(source) {
  const base = makeAudioOggArtworkBuildWorkflow(source);
  const before = "node media/ffmpeg/build-audio-ogg-artwork-candidate.mjs", after = "node media/ffmpeg/build-mp3-input-gain-candidate.mjs";
  const marker = "            work/ffmpeg-nondocker-output/build-manifest.json\n";
  const added = marker + "            work/ffmpeg-nondocker-output/lame-presets.parent.c\n" +
    "            work/ffmpeg-nondocker-output/lame-presets.input-gain.c\n" +
    "            work/ffmpeg-nondocker-output/mp3-input-gain-source.json\n";
  assert.equal(base.generated.split(before).length, 2); assert.equal(base.generated.split(marker).length, 2);
  const generated = base.generated.replace(before, after).replace(marker, added);
  assert.equal(generated.replace(added, marker).replace(after, before), base.generated);
  return { generated, generatedSha256: createHash("sha256").update(generated).digest("hex"),
    scope: "isolated-private-MP3-input-gain-build-only", originalSdkDependencyAndCleanupStepsRetained: true, publicAcceptance: false };
}
