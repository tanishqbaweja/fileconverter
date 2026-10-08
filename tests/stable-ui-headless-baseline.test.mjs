import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import path from "node:path";
import test from "node:test";
import { gunzipSync } from "node:zlib";
import { baselineBinding, compareMatchedHeadlessUi, makeStableUiHeadlessBaseline } from "../scripts/lib/stable-ui-headless-baseline-recipe.mjs";
const root = path.resolve(import.meta.dirname, "..");
const executed = JSON.parse(gunzipSync(await readFile(path.join(root, "outputs/reports/2026-10-08T13-49-53-644Z-stable-ui-executed-sources.json.gz"))));
test("Matched headless control retains executed five-case quality, bounded I/O and cleanup suite", () => {
  const generated = makeStableUiHeadlessBaseline(executed, root, path.join(root, "work", "unused-control"), "2026-10-09T00-00-00-000Z");
  assert.ok(generated.spec.includes(JSON.stringify(baselineBinding)));
  assert.ok(generated.spec.includes('kind: "actual-served-stable-ui-baseline"'));
  assert.ok(generated.spec.includes('headless: true, viewport: { width: 1280, height: 900 }'));
  for (const anchor of ['for (const adapter of adapters)', 'sourceDecodedAudioHashes', 'outputDecodedAudioHashes', 'cancel-after-direct-output', 'direct-write-failure'])
    assert.ok(generated.spec.includes(anchor), anchor);
  assert.throws(() => makeStableUiHeadlessBaseline({ ...executed, spec: executed.spec + "\n" }, root, path.join(root, "work", "unused"), "2026-10-09T00-00-00-000Z"));
});
test("Matched geometry comparator never substitutes headed CSS or accepts changed markup or large deltas", async () => {
  const report = JSON.parse(gunzipSync(await readFile(path.join(root, "outputs/reports/2026-10-08T13-50-37.670Z-mpeg2-split-pipeline-37739125738-direct-artwork-stable-ui-headless-goldens.json.gz"))));
  assert.equal(compareMatchedHeadlessUi(report, structuredClone(report)).maximumDeltaCssPixels, 0);
  const altered = structuredClone(report), ui = altered.rows.find(row => row.kind === "matrix-ui-observation");
  ui.rows[0].width += 1; assert.equal(compareMatchedHeadlessUi(report, altered).matchingHeadlessGeometryAccepted, false);
  ui.matrixSha256 = "changed"; assert.throws(() => compareMatchedHeadlessUi(report, altered));
  const css = structuredClone(report); css.rows.find(row => row.kind === "matrix-static-stylesheet").records[0].afterSha256 = "changed";
  assert.throws(() => compareMatchedHeadlessUi(report, css));
});
