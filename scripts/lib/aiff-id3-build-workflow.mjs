import assert from "node:assert/strict";
import { createHash } from "node:crypto";
export const AIFF_CANONICAL_WORKFLOW_SHA = "cda0b434adc7dd36109b4a2cc63fe726a507889cf6d1c0f5862d5d78dbf5c965";
export function makeAiffId3BuildWorkflow(source) {
  assert.equal(createHash("sha256").update(source).digest("hex"), AIFF_CANONICAL_WORKFLOW_SHA);
  const before = "          else\n            bash media/ffmpeg/reproduce-nondocker.sh\n          fi\n";
  const after = "          elif test \"${{ inputs.core }}\" = within-aiff; then\n" +
    '            export PATH="$(dirname "$EMSDK_NODE"):$PATH"\n' +
    "            node media/ffmpeg/build-aiff-id3-specialist.mjs\n" + before;
  const marker = "      - name: Retain private H264 candidate and corresponding sources\n";
  const upload = "      - name: Retain private metadata-only AIFF specialist\n" +
    "        if: success() && inputs.core == 'within-aiff'\n" +
    "        uses: actions/upload-artifact@v4\n        with:\n" +
    "          name: private-aiff-id3-specialist-${{ github.run_id }}\n" +
    "          path: work/ffmpeg-nondocker-output/\n" +
    "          if-no-files-found: error\n          retention-days: 1\n\n";
  assert.equal(source.split(before).length, 2); assert.equal(source.split(marker).length, 2);
  const generated = source.replace(before, after).replace(marker, upload + marker);
  assert.equal(generated.replace(upload + marker, marker).replace(after, before), source);
  return generated;
}
