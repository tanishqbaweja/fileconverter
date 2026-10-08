// A matched-mode control, derived only from the already executed headless suite.
import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import path from "node:path";
import { pathToFileURL } from "node:url";

export const sha = bytes => createHash("sha256").update(bytes).digest("hex");
export const baselineBinding = { url: "/assets/ConverterApp-BuCmNpWV.js", bytes: 315630,
  sha256: "e018d973a604af5f4a678860c08cea5e3c6f587a952b933799566dbaa2203172" };
const candidateBinding = { url: "/assets/ConverterApp-SNmCD3M3.js", bytes: 315826,
  sha256: "d884d80703f4157695736f4fd632f8c1bab06f8a815cff8bb4ea9b6b23514143" };
const executedHashes = { spec: "e2d47f8759db9cb243a9b0ce0294b6a75724a829f5085a7f357cbfd9aef419b0",
  driver: "bc081c1581a0d051f9f6ad0611040fa7ac62faca4ed71f6bfaf4d6aaadea4760",
  config: "20b93d63038fb5c493062fb58e948790253c5475ec2f6cbb5f886771d2526ba6" };
const previousRoot = "H:\\Github Repositories\\fileconverter";
const previousRuntime = previousRoot + "\\work\\stable-ui-headless-goldens-QirrgQ";
const previousUri = "file:///H:/Github%20Repositories/fileconverter/";
function patch(source, patches) {
  let value = source;
  for (const [before, after] of patches) {
    assert.equal(value.split(before).length, 2, `Unique bounded replacement: ${before}`);
    value = value.replace(before, after);
  }
  let reversed = value;
  for (const [before, after] of patches.toReversed()) reversed = reversed.replace(after, before);
  assert.equal(reversed, source, "All conversion, validation and cleanup code is preserved");
  return value;
}
export function makeStableUiHeadlessBaseline(executed, root, runtimeDirectory, stamp) {
  assert.match(stamp, /^\d{4}-\d{2}-\d{2}T[\d-]+Z$/);
  assert.ok(path.relative(root, runtimeDirectory).startsWith(`work${path.sep}`));
  for (const name of Object.keys(executedHashes)) assert.equal(sha(executed[name]), executedHashes[name], name);
  const relocate = source => source.replaceAll(previousUri, pathToFileURL(root + path.sep).href);
  const spec = relocate(patch(executed.spec, [
    [`const root = ${JSON.stringify(previousRoot)};`, `const root = ${JSON.stringify(root)};`],
    [JSON.stringify(candidateBinding), JSON.stringify(baselineBinding)],
    ['kind: "actual-served-stable-ui-candidate"', 'kind: "actual-served-stable-ui-baseline"'],
    ['"2026-10-08T13-49-53-644Z-matrix-goldens"', JSON.stringify(stamp + "-baseline-matrix-goldens")],
  ]));
  const driver = relocate(patch(executed.driver, [
    [`const root = ${JSON.stringify(previousRoot)}, exec`, `const root = ${JSON.stringify(root)}, exec`],
    [JSON.stringify(previousRuntime + "\\playwright.config.mjs"), JSON.stringify(path.join(runtimeDirectory, "playwright.config.mjs"))],
  ]));
  const config = patch(executed.config, [[JSON.stringify(previousRuntime), JSON.stringify(runtimeDirectory)]]);
  assert.ok(spec.includes("headless: true") && !spec.includes("headless: false"));
  assert.equal((driver.match(/windowsHide: true/g) ?? []).length, 6);
  return { spec, driver, config };
}

export function compareMatchedHeadlessUi(candidate, baseline) {
  const pick = (report, kind) => report.rows.filter(row => row.kind === kind);
  const left = pick(candidate, "matrix-ui-observation"), right = pick(baseline, "matrix-ui-observation");
  assert.equal(left.length, 6); assert.equal(right.length, 6);
  const styles = report => pick(report, "matrix-static-stylesheet").flatMap(row => row.records)
    .map(({ beforeBytes, beforeSha256, afterBytes, afterSha256 }) => ({ beforeBytes, beforeSha256, afterBytes, afterSha256 }));
  assert.deepEqual(styles(candidate), styles(baseline), "Actual CSS before/after hashes match, not just file names");
  const comparisons = []; let maximumDelta = 0;
  for (let index = 0; index < left.length; index++) {
    const a = left[index], b = right[index];
    for (const field of ["viewport", "jobState", "observationPhase", "matrixCards", "matrixSha256"])
      assert.deepEqual(a[field], b[field], `${index}:${field}`);
    assert.equal(a.overflow, false); assert.equal(b.overflow, false);
    assert.equal(a.rows.length, b.rows.length);
    const deltas = a.rows.map((row, n) => {
      const other = b.rows[n]; assert.equal(row.selector, other.selector); assert.equal(row.display, other.display);
      const delta = Object.fromEntries(["x", "y", "width", "height"].map(field => {
        assert.ok(Number.isFinite(row[field]) && Number.isFinite(other[field]));
        const difference = Math.abs(row[field] - other[field]); maximumDelta = Math.max(maximumDelta, difference);
        return [field, difference];
      }));
      return { selector: row.selector, ...delta };
    });
    comparisons.push({ jobState: a.jobState, observationPhase: a.observationPhase, deltas });
  }
  return { matchingHeadlessGeometryAccepted: maximumDelta <= 1 / 64,
    toleranceCssPixels: 1 / 64, maximumDeltaCssPixels: maximumDelta, comparisons,
    scope: "Same headless1280x900/actualCSS/fixture/settings/six UI states; not speed or full-source memory acceptance" };
}
