import assert from "node:assert/strict";
import { createHash } from "node:crypto";

const workflow = ".github/workflows/reproduce-ffmpeg-nondocker.yml";
const historicalSha = "5a0d4a2a4357abae5715363367aef69c400e584b49836c645eae0e08d5c587c6";
const readerOnlyRetentionSha = "8442e48304e6ba448cad205f1e6dfd5757a41e25f6b20be4a50c611957a1f767";
const retentionLines = ["            work/mpeg2-candidate-output/refstruct-diagnostic-smoke.json\n",
  "            work/mpeg2-candidate-output/mpeg2-accessory-smoke.json\n"];
const sha = (bytes) => createHash("sha256").update(bytes).digest("hex");
const allocatorInput = "      mpeg2_allocator:\n" +
  "        description: Private fixed-32-MiB allocation strategy, never acceptance\n" +
  "        required: false\n        default: emmalloc\n        type: choice\n" +
  "        options:\n          - emmalloc\n          - dlmalloc\n\n";
const allocatorEnvironment = "              WITHIN_MPEG2_ALLOCATOR=\"${{ inputs.mpeg2_allocator || 'emmalloc' }}\" \\\n";
const decoderInput = "      mpeg2_decoder_set:\n" +
  "        description: Additional private decoder module, broad default retained\n" +
  "        required: false\n        default: wide\n        type: choice\n" +
  "        options:\n          - wide\n          - hevc-mpeg4\n\n";
const decoderEnvironment = "              WITHIN_MPEG2_DECODER_SET=\"${{ inputs.mpeg2_decoder_set || 'wide' }}\" \\\n";

const planeInput = "      mpeg2_frame_allocation_diagnostic:\n" +
  "        description: Private scalar plane attribution only, never acceptance\n" +
  "        required: false\n        default: '0'\n        type: choice\n" +
  "        options:\n          - '0'\n          - '1'\n\n";
const planeEnvironment = "              WITHIN_MPEG2_FRAME_ALLOCATION_DIAGNOSTIC=\"${{ inputs.mpeg2_frame_allocation_diagnostic || '0' }}\" \\\n";

const splitAdditions = [
  "          - within-mpeg2-split-contract\n",
  "          elif test \"${{ inputs.core }}\" = within-mpeg2-split-contract; then\n" +
    "            export PATH=\"$(dirname \"$EMSDK_NODE\"):$PATH\"\n" +
    "            bash media/ffmpeg/verify-mpeg2-split-frame.sh\n",
  "      - name: Retain synthetic split frame contract only\n" +
    "        if: success() && inputs.core == 'within-mpeg2-split-contract'\n" +
    "        uses: actions/upload-artifact@v4\n        with:\n" +
    "          name: private-mpeg2-split-contract-${{ github.run_id }}\n" +
    "          path: outputs/reports/mpeg2-split-frame-contract.json\n" +
    "          if-no-files-found: error\n          retention-days: 1\n\n",
  " && inputs.core != 'within-mpeg2-split-contract'",
  "          task_path=\"$GITHUB_WORKSPACE/work/mpeg2-split-frame-build\"\n" +
    "          test \"$task_path\" = \"$GITHUB_WORKSPACE/work/mpeg2-split-frame-build\" && ! test -L \"$task_path\"\n" +
    "          rm -rf -- \"$task_path\"\n",
];

// Older compiled proofs predate two additional retained unit JSON files. Do
// not refresh their hashes: reversing exactly those lines must recover every
// byte of the workflow actually used. The later private allocator selector
// must reverse as exactly one paired input/environment addition as well.
// All other workflow bytes and all unrelated files remain byte-exact.
export function provenSourceSha(file, bytes, expected) {
  if (file !== workflow || ![historicalSha, readerOnlyRetentionSha].includes(expected) || sha(bytes) === expected)
    return sha(bytes);
  let text = bytes.toString("utf8");
  if (text.includes("within-mpeg2-split-contract")) {
    for (const addition of splitAdditions) {
      assert.equal(text.split(addition).length, 2, "Exactly one complete synthetic split-unit workflow addition");
      text = text.replace(addition, "");
    }
  }
  if (text.includes("mpeg2_frame_allocation_diagnostic:") || text.includes("WITHIN_MPEG2_FRAME_ALLOCATION_DIAGNOSTIC=")) {
    for (const addition of [planeInput, planeEnvironment]) {
      assert.equal(text.split(addition).length, 2, "Exactly one paired scalar plane diagnostic addition");
      text = text.replace(addition, "");
    }
  }
  if (text.includes("mpeg2_decoder_set:") || text.includes("WITHIN_MPEG2_DECODER_SET=")) {
    for (const addition of [decoderInput, decoderEnvironment]) {
      assert.equal(text.split(addition).length, 2, "Exactly one paired decoder selector addition");
      text = text.replace(addition, "");
    }
  }
  if (text.includes("mpeg2_allocator:") || text.includes("WITHIN_MPEG2_ALLOCATOR=")) {
    for (const addition of [allocatorInput, allocatorEnvironment]) {
      assert.equal(text.split(addition).length, 2, "Exactly one paired allocator selector addition");
      text = text.replace(addition, "");
    }
  }
  if (sha(text) === expected) return expected;
  for (const line of expected === historicalSha ? retentionLines : retentionLines.slice(1)) {
    assert.equal(text.split(line).length, 2, "Exactly one of each additional smoke artifact path");
    text = text.replace(line, "");
  }
  const recovered = sha(text);
  assert.equal(recovered, expected, "No other historical workflow bytes may change");
  return recovered;
}
