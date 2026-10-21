// Explicit four-case hosted correctness check; never Windows memory acceptance.
import assert from "node:assert/strict";
import { createHash } from "node:crypto";
export function makeVpxTerminalRecoveryWorkflow(source) {
  assert.equal(createHash("sha256").update(source).digest("hex"), "2774771a70800a96c7368982fdaa365ffc8b2027a2ed3dafae362ffa96d30d65");
  const install = "      - run: sudo apt-get update && sudo apt-get install -y --no-install-recommends ffmpeg\n";
  const extra = "\n      - name: Fetch immutable sources of the already compiled private artifact\n" +
    "        run: git fetch --no-tags --depth=1 origin b53061ba87a310b986ab79a6e12a080a33f58fd5\n" +
    "\n      - uses: actions/download-artifact@v4\n        with:\n          github-token: ${{ github.token }}\n" +
    "          run-id: 39581181533\n          name: ffmpeg-nondocker-mismatch-39581181533\n          path: work/vpx-timing-39581181533\n" +
    "\n      - name: Audit existing compiled bytes and the exact post-build declaration correction\n" +
    "        run: |\n          node --input-type=module -e 'import {recoverVpxSpecialistManifest} from \"./scripts/lib/vpx-postbuild-recovery.mjs\"; import {auditVpxDecoderArtifact} from \"./scripts/lib/vpx-decoder-artifact.mjs\"; await recoverVpxSpecialistManifest(\"work/vpx-timing-39581181533\"); const a = await auditVpxDecoderArtifact(\"work/vpx-timing-39581181533\"); console.log(JSON.stringify({recovery:a.recovery,abi:a.abi,inventory:a.inventory,memoryLimits:a.memoryLimits}));'\n";
  const edits = [
    ["  audio-destination-scopes:\n", "  audio-destination-scopes:\n    name: Private VPX four terminal cases (not Windows memory or full CI)\n    permissions:\n      contents: read\n      actions: read\n"],
    ["      WITHIN_TEST_VIDEO: \"off\"\n", "      WITHIN_TEST_VIDEO: \"off\"\n      WITHIN_VPX_CANDIDATE_DIRECTORY: ${{ github.workspace }}/work/vpx-timing-39581181533\n"],
    [install, install + extra],
    ["      - name: Run only genuine browser destination-scope checks\n", "      - name: Run four genuine private VPX terminal and recovery scenarios\n"],
    ["npx playwright test tests/browser/audio-destination-scopes.spec.ts", "npx playwright test --config playwright.vpx.config.ts --grep 'mismatched source|pre-cancelled job|bounded selected-destination|real conversion recovers'"],
    ["          name: audio-destination-scopes-${{ github.run_id }}\n          path: output/playwright/audio-destination-scopes-*.json\n", "          name: private-vpx-terminal-${{ github.run_id }}\n          path: output/playwright/vpx-decoder-qualification-*.json\n"],
    ['for task_path in "$GITHUB_WORKSPACE/work/audio-scope-npm-cache" "$GITHUB_WORKSPACE/work/audio-scope-browsers"; do',
      'for task_path in "$GITHUB_WORKSPACE/work/audio-scope-npm-cache" "$GITHUB_WORKSPACE/work/audio-scope-browsers" "$GITHUB_WORKSPACE/work/vpx-timing-39581181533"; do'],
    ['"$GITHUB_WORKSPACE/work/audio-scope-npm-cache"|"$GITHUB_WORKSPACE/work/audio-scope-browsers") ;;',
      '"$GITHUB_WORKSPACE/work/audio-scope-npm-cache"|"$GITHUB_WORKSPACE/work/audio-scope-browsers"|"$GITHUB_WORKSPACE/work/vpx-timing-39581181533") ;;'],
  ];
  let generated = source;
  for (const [before, after] of edits) { assert.equal(generated.split(before).length, 2); generated = generated.replace(before, after); }
  let reverse = generated;
  for (const [before, after] of edits.toReversed()) { assert.equal(reverse.split(after).length, 2); reverse = reverse.replace(after, before); }
  assert.equal(reverse, source);
  return { generated, generatedSha256: createHash("sha256").update(generated).digest("hex"), edits, selectedCases: 4,
    publicAcceptance: false, memoryAcceptance: false, fullCi: false };
}
