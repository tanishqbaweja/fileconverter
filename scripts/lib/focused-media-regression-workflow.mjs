// A finite named recovery gate on a private branch, not a replacement for CI.
import assert from "node:assert/strict";
import { createHash } from "node:crypto";
export const FOCUSED_MEDIA_GREP = "browser FFmpeg (coalesces PCM packets for a bounded direct WAV save|flushes (a bounded direct (M4A|FLAC) save correctly|coalesced AIFF PCM through a bounded direct save|bounded (AMR-NB|MP3) packets through a direct save))|browser planner automatically replaces incompatible";
export function makeFocusedMediaRegressionWorkflow(source) {
  assert.equal(createHash("sha256").update(source).digest("hex"), "2774771a70800a96c7368982fdaa365ffc8b2027a2ed3dafae362ffa96d30d65");
  const oldArtifact = "      - name: Retain compact scope results, never generated media\n        if: always()\n" +
    "        uses: actions/upload-artifact@v4\n        with:\n          name: audio-destination-scopes-${{ github.run_id }}\n" +
    "          path: output/playwright/audio-destination-scopes-*.json\n          if-no-files-found: warn\n          retention-days: 1\n";
  const edits = [
    ["  audio-destination-scopes:\n", "  audio-destination-scopes:\n    name: Focused media synchronization recovery (eight cases, not full CI)\n"],
    ["      - name: Run only genuine browser destination-scope checks\n", "      - name: Run eight genuine media recovery checks, not full-suite acceptance\n"],
    ["npx playwright test tests/browser/audio-destination-scopes.spec.ts", `npx playwright test tests/browser/media-remux.spec.ts --grep '${FOCUSED_MEDIA_GREP}'`],
    [oldArtifact, "      - name: Retain focused media failure traces only\n        if: failure()\n" +
      "        uses: actions/upload-artifact@v4\n        with:\n          name: focused-media-regression-${{ github.run_id }}\n" +
      "          path: output/playwright/artifacts\n          if-no-files-found: ignore\n          retention-days: 1\n"],
  ];
  let generated = source;
  for (const [before, after] of edits) { assert.equal(generated.split(before).length, 2); generated = generated.replace(before, after); }
  let reverse = generated;
  for (const [before, after] of edits.toReversed()) { assert.equal(reverse.split(after).length, 2); reverse = reverse.replace(after, before); }
  assert.equal(reverse, source);
  return { generated, generatedSha256: createHash("sha256").update(generated).digest("hex"), edits,
    selectedCases: 8, scope: "private-eight-case-recovery-not-full-project-CI", publicAcceptance: false };
}
