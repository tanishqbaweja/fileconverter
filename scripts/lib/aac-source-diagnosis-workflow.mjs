// Private source/validator inspection only. No browser, Wasm rebuild or route acceptance.
import assert from "node:assert/strict";
import { createHash } from "node:crypto";
export function makeAacSourceDiagnosisWorkflow(source) {
  assert.equal(createHash("sha256").update(source).digest("hex"), "2774771a70800a96c7368982fdaa365ffc8b2027a2ed3dafae362ffa96d30d65");
  const marker = "  audio-destination-scopes:\n", start = source.indexOf(marker);
  assert.ok(start > 0 && source.split(marker).length === 2);
  const before = source.slice(start);
  const after = "  audio-destination-scopes:\n" +
    "    name: AAC source and validator sample diagnosis (no browser or conversion acceptance)\n" +
    "    if: github.event_name == 'workflow_dispatch' && inputs.engine == 'audio-destination-scopes'\n" +
    "    runs-on: ubuntu-latest\n    timeout-minutes: 10\n    steps:\n" +
    "      - uses: actions/checkout@v4\n      - uses: actions/setup-node@v4\n        with:\n          node-version: \"24\"\n" +
    "      - run: mkdir -p work\n" +
    "      - run: sudo apt-get update && sudo apt-get install -y --no-install-recommends ffmpeg\n" +
    "      - name: Recreate and inspect the exact failed source fixture, never an app output\n" +
    "        run: node scripts/run-repository-owned-node.mjs scripts/diagnose-aac-source-priming.mjs\n" +
    "      - name: Retain compact counts, metadata and hashes only\n        if: always()\n" +
    "        uses: actions/upload-artifact@v4\n        with:\n" +
    "          name: aac-source-diagnosis-${{ github.run_id }}\n          path: outputs/reports/aac-source-priming-*.json\n" +
    "          if-no-files-found: warn\n          retention-days: 1\n";
  const generated = source.slice(0, start) + after;
  assert.equal(generated.replace(after, before), source);
  return { generated, generatedSha256: createHash("sha256").update(generated).digest("hex"),
    edits: [[before, after]], browserConversionClaim: false, nativeFixtureAndIndependentValidationOnly: true, publicAcceptance: false };
}
