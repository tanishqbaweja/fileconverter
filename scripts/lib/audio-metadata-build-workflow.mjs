// Apply only on an isolated build branch to the already registered workflow.
// The main worktree's workflow and published engines remain byte-exact.
import assert from "node:assert/strict";
import { createHash } from "node:crypto";
export function makeAudioMetadataBuildWorkflow(source) {
  assert.equal(createHash("sha256").update(source).digest("hex"), "cda0b434adc7dd36109b4a2cc63fe726a507889cf6d1c0f5862d5d78dbf5c965");
  const branch = '          elif test "${{ inputs.core }}" = within-mpeg2-split-contract; then\n';
  const marker = "      - name: Retain private H264 candidate and corresponding sources\n";
  const upload = "      - name: Retain private bounded audio metadata candidate\n" +
    "        if: success() && inputs.core == 'within-remux'\n" +
    "        uses: actions/upload-artifact@v4\n        with:\n" +
    "          name: private-audio-metadata-${{ github.run_id }}\n          path: |\n" +
    "            work/ffmpeg-nondocker-output/within-remux.mjs\n            work/ffmpeg-nondocker-output/within-remux.wasm\n" +
    "            work/ffmpeg-nondocker-output/within_remux.parent.c\n            work/ffmpeg-nondocker-output/within_remux.metadata.c\n" +
    "            work/ffmpeg-nondocker-output/config_components.h\n            work/ffmpeg-nondocker-output/build-manifest.json\n" +
    "            work/ffmpeg-nondocker-output/LICENSE.*\n          if-no-files-found: error\n          retention-days: 1\n\n";
  const edits = [[branch, '          elif test "${{ inputs.core }}" = within-remux; then\n' +
    '            export PATH="$(dirname "$EMSDK_NODE"):$PATH"\n' +
    '            node media/ffmpeg/build-audio-text-metadata-candidate.mjs\n' + branch], [marker, upload + marker]];
  let generated = source;
  for (const [before, after] of edits) { assert.equal(generated.split(before).length, 2); generated = generated.replace(before, after); }
  let reversed = generated;
  for (const [before, after] of edits.toReversed()) { assert.equal(reversed.split(after).length, 2); reversed = reversed.replace(after, before); }
  assert.equal(reversed, source);
  return { generated, edits, generatedSha256: createHash("sha256").update(generated).digest("hex"),
    scope: "isolated-private-build-branch-only", publicAcceptance: false, originalSdkDependencyAndCleanupStepsRetained: true };
}
