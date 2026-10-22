// A private, three-case hosted trace-plumbing/correctness check. Never a Windows
// private-memory result or an excuse to rebuild unchanged codec bytes.
import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { makeVpxTerminalRecoveryWorkflow } from "./vpx-terminal-recovery-workflow.mjs";
export function makeVpxLiveMemoryWorkflow(source) {
  const base = makeVpxTerminalRecoveryWorkflow(source).generated;
  const start = base.indexOf("\n      - name: Fetch immutable sources of the already compiled private artifact\n");
  const end = base.indexOf("\n      - name: Run four genuine private VPX terminal and recovery scenarios\n", start);
  assert.ok(start > 0 && end > start);
  const oldDirectory = "vpx-timing-39581181533", directory = "vpx-chapter-end-39623553380";
  const extra = '\n      - uses: actions/download-artifact@v4\n        with:\n          github-token: ${{ github.token }}\n' +
    '          run-id: 39623553380\n          name: private-vpx-timeline-39623553380\n          path: work/' + directory + '\n' +
    '\n      - name: Audit unchanged actual native bytes and source ABI heap pins\n        run: |\n' +
    '          node --input-type=module -e \'import {auditVpxDecoderArtifact} from "./scripts/lib/vpx-decoder-artifact.mjs"; console.log(JSON.stringify(await auditVpxDecoderArtifact("work/' + directory + '")));\'\n';
  const edits = [
    [base.slice(start, end), extra],
    ["Private VPX four terminal cases (not Windows memory or full CI)", "Private bounded VP9 allocator trace (not Windows memory or full CI)"],
    ["Run four genuine private VPX terminal and recovery scenarios", "Run original VP8 prefix and first VP9 with bounded live allocation trace"],
    ["--grep 'mismatched source|pre-cancelled job|bounded selected-destination|real conversion recovers'", "--grep 'CPU vp8 decode|CPU vp9 decode to MPEG4 with default settings'"],
    ["name: private-vpx-terminal-", "name: private-vpx-live-memory-"],
    ["          path: output/playwright/vpx-decoder-qualification-*.json\n", "          path: |\n            output/playwright/vpx-decoder-qualification-*.json\n            output/playwright/vpx-decoder-qualification-*-during-vp9-memory.json.gz\n"],
    ['      WITHIN_TEST_VIDEO: "off"\n', '      WITHIN_TEST_VIDEO: "off"\n      WITHIN_VPX_ALLOCATION_DIAGNOSTIC: "1"\n      WITHIN_VPX_DURING_ALLOCATOR_TRACE: "1"\n'],
  ];
  let generated = base;
  for (const [before, after] of edits) { assert.equal(generated.split(before).length, 2); generated = generated.replace(before, after); }
  assert.equal(generated.split(oldDirectory).length, 4); generated = generated.replaceAll(oldDirectory, directory);
  let reverse = generated.replaceAll(directory, oldDirectory);
  reverse = reverse.replace(extra.replaceAll(directory, oldDirectory), extra);
  for (const [before, after] of edits.toReversed()) { assert.equal(reverse.split(after).length, 2); reverse = reverse.replace(after, before); }
  assert.equal(reverse, base);
  assert.doesNotMatch(generated, /recoverVpxSpecialistManifest|b53061ba|39581181533/);
  return { generated, generatedSha256: createHash("sha256").update(generated).digest("hex"),
    nativeBuild: 39623553380, selectedCases: 3, wasmRebuild: false, diagnosticOnly: true, windowsMemoryAcceptance: false, publicAcceptance: false };
}
