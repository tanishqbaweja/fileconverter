import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import path from "node:path";
import test from "node:test";
import { gunzipSync } from "node:zlib";
import { makeProgressCompositingGoldens, compareProgressCompositingUi } from "../scripts/lib/progress-compositing-golden-recipe.mjs";
import { makeStableUiHeadlessBaseline, sha } from "../scripts/lib/stable-ui-headless-baseline-recipe.mjs";
const root = path.resolve(import.meta.dirname, ".."), read = file => readFile(path.join(root, file));
const retained = JSON.parse(await read("evidence/2026-10-08T21-50-57-923Z-stable-ui-headless-baseline.json"));
const reference = JSON.parse(await read(retained.reference.path));
const sources = await read(reference.generatedArchive.path); assert.equal(sha(sources), reference.generatedArchive.sha256);
const executed = JSON.parse(gunzipSync(sources, { maxOutputLength: 262144 }));
const build = JSON.parse(await read("evidence/2026-10-09T15-22-00-000Z-progress-compositing-build.json"));
const cssGzip = await read(build.cssArchive.path); assert.equal(sha(cssGzip), build.cssArchive.sha256);
const css = gunzipSync(cssGzip, { maxOutputLength: 1048576 });
const audit = JSON.parse(await read("evidence/2026-10-09T15-42-44-939Z-progress-compositing-golden-analysis.json"));
const normalCssArchive = await read(audit.normalStylesheetArchive.path); assert.equal(sha(normalCssArchive), audit.normalStylesheetArchive.sha256);
const normalCss = gunzipSync(normalCssArchive, { maxOutputLength: 1048576 });
const rawGzip = await read(retained.compressedReport.path); assert.equal(sha(rawGzip), retained.compressedReport.sha256);
const baselineReport = JSON.parse(gunzipSync(rawGzip, { maxOutputLength: 2097152 }));
const stamp = "2026-10-09T16-00-00-000Z", runtime = path.join(root, "work", "progress-compositing-UNIT-ONLY");
const generated = makeProgressCompositingGoldens(executed, root, runtime, stamp, build.asset, build.stylesheet, css);
const baseline = makeStableUiHeadlessBaseline(executed, root, runtime, stamp);
function candidateReport() {
  const value = structuredClone(baselineReport);
  for (const row of value.rows.filter(row => row.kind === "matrix-static-stylesheet")) {
    row.records = [{ url: "http://127.0.0.1:3000" + build.stylesheet.url, beforeBytes: build.stylesheet.bytes,
      beforeSha256: build.stylesheet.sha256, afterBytes: generated.stylesheetBinding.afterBytes,
      afterSha256: generated.stylesheetBinding.afterSha256 }];
  }
  return value;
}
const compare = candidate => compareProgressCompositingUi(candidate, baselineReport, generated.stylesheetBinding, normalCss, generated.historicMatrixCss);

test("Exact reversible headless derivative adds actual App/CSS bindings without changing real conversion/quality/privacy/cleanup gates", () => {
  for (const [name, patches] of [["spec", generated.patches], ["driver", generated.driverPatches]]) {
    let text = generated[name];
    for (const [before, after] of patches.toReversed()) text = text.replace(after, before);
    assert.equal(text, baseline[name]); assert.equal(sha(text), generated[name === "spec" ? "baselineSpecSha256" : "baselineDriverSha256"]);
  }
  assert.equal(generated.config, baseline.config);
  assert.ok(generated.spec.includes(JSON.stringify(build.asset)) && generated.spec.includes(JSON.stringify(generated.stylesheetBinding)));
  assert.ok(generated.spec.includes("headless: true") && !generated.spec.includes("headless: false"));
  assert.equal((generated.driver.match(/windowsHide: true/g) ?? []).length, 6);
  assert.ok(generated.driver.includes("Never stop an unrelated or reused PID"));
  assert.ok(generated.driver.includes("await recordLaunch(server") && generated.driver.includes("await recordLaunch(runner"));
  assert.ok(generated.driver.includes("observeOwnedProcessExit(row.identity)"));
});

test("Intentional CSS difference is bound before/after, not falsified as identical; unchanged six-state geometry passes", () => {
  const result = compare(candidateReport());
  assert.equal(result.matchingHeadlessGeometryAccepted, true); assert.equal(result.maximumDeltaCssPixels, 0);
  assert.equal(result.cssIntentionallyChanged, true); assert.equal(result.comparisons.length, 6);
  assert.throws(() => compare(baselineReport), /AssertionError/);
});

test("Reject incorrect CSS/content/origin path, missing samples, altered layout/state/matrix and unbound source", () => {
  for (const field of ["beforeSha256", "afterSha256", "url"]) {
    const report = candidateReport(); report.rows.find(row => row.kind === "matrix-static-stylesheet").records[0][field] = "wrong";
    assert.throws(() => compare(report));
  }
  const missing = candidateReport(); missing.rows.splice(missing.rows.findIndex(row => row.kind === "matrix-static-stylesheet"), 1);
  assert.throws(() => compare(missing));
  const moved = candidateReport(); moved.rows.find(row => row.kind === "matrix-ui-observation").rows[0].x += 1 / 32;
  assert.equal(compare(moved).matchingHeadlessGeometryAccepted, false);
  for (const field of ["jobState", "matrixSha256", "overflow"]) {
    const report = candidateReport(); report.rows.find(row => row.kind === "matrix-ui-observation")[field] = field === "overflow" ? true : "wrong";
    assert.throws(() => compare(report));
  }
  const altered = Buffer.from(css); altered[0] ^= 1;
  assert.throws(() => makeProgressCompositingGoldens(executed, root, runtime, stamp, build.asset, build.stylesheet, altered));
  assert.throws(() => makeProgressCompositingGoldens({ ...executed, spec: executed.spec + "\n" }, root, runtime, stamp, build.asset, build.stylesheet, css));
  assert.throws(() => compareProgressCompositingUi(candidateReport(), baselineReport, generated.stylesheetBinding, normalCss, generated.historicMatrixCss + " "));
});
