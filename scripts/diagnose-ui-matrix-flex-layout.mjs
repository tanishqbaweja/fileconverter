// One changed bounded browser pair, never a conversion or primary acceptance.
import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { access, readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import { pathToFileURL } from "node:url";
import { createOwnedRuntimeScratch } from "./lib/owned-runtime-scratch.mjs";
import { inspectStressHostMemory } from "./lib/host-memory-preflight.mjs";
import { makeDetailedBlinkAttribution } from "./lib/largest-blink-attribution-recipe.mjs";
import { makeUiMatrixFlexLayoutControl } from "./lib/ui-matrix-flex-layout-recipe.mjs";
import { joinUiLargestBlinkTypes } from "./lib/ui-largest-blink-join.mjs";

const root = path.resolve(import.meta.dirname, ".."), sha = bytes => createHash("sha256").update(bytes).digest("hex");
const paths = ["scripts/diagnose-ui-matrix-flex-layout.mjs", "scripts/lib/ui-matrix-flex-layout-recipe.mjs",
  "scripts/lib/ui-flex-layout-recipe.mjs", "scripts/diagnose-ui-native-allocation.mjs", "scripts/lib/bounded-renderer-attribution.mjs",
  "app/converter/ConverterApp.tsx", "app/globals.css"];
const sourcePins = Object.fromEntries(await Promise.all(paths.map(async file => [file, sha(await readFile(path.join(root, file)))])));
const stamp = new Date().toISOString().replaceAll(/[:.]/g, "-");
const envelopePath = path.join(root, `evidence/${stamp}-ui-matrix-flex-layout.json`);
await assert.rejects(access(envelopePath), { code: "ENOENT" });
const proofs = [];
let failure = null;
try {
  for (const candidate of [false, true]) {
    const host = await inspectStressHostMemory(), mode = candidate ? "matrix-flex" : "matrix-grid";
    console.log(JSON.stringify({ mode, host }));
    assert.equal(host.safeToStart, true, "Unchanged physical AND virtual 2GiB guard");
    const runtime = await createOwnedRuntimeScratch(`ui-${mode}-wrapper-`);
    let report, rawPath, helperSource, controlSource;
    try {
      helperSource = makeDetailedBlinkAttribution(await readFile(path.join(root, "scripts/lib/bounded-renderer-attribution.mjs"), "utf8"), root);
      const helper = path.join(runtime.directory, "attribution.mjs");
      await writeFile(helper, helperSource, { flag: "wx" });
      controlSource = makeUiMatrixFlexLayoutControl(await readFile(path.join(root, "scripts/diagnose-ui-native-allocation.mjs"), "utf8"), root, pathToFileURL(helper).href, candidate);
      const driver = path.join(runtime.directory, "control.mjs");
      await writeFile(driver, controlSource, { flag: "wx" });
      const completed = await import(pathToFileURL(driver).href);
      report = completed.completedReport; rawPath = completed.completedReportPath;
    } finally { await runtime.close(); }
    await assert.rejects(access(runtime.directory), { code: "ENOENT" });
    assert.ok(report && rawPath);
    const raw = await readFile(rawPath);
    proofs.push({ mode, host, rawReport: { path: path.relative(root, rawPath).replaceAll("\\", "/"), bytes: raw.length, sha256: sha(raw) },
      generatedSources: { helper: helperSource, control: controlSource }, generatedHashes: { helper: sha(helperSource), control: sha(controlSource) },
      status: report.status, browserVersion: report.browserVersion, layoutExperiment: report.layoutExperiment, rows: report.rows,
      sourcePins: report.sourcePins, cleanup: report.cleanup, cleanupErrors: report.cleanupErrors, failure: report.failure,
      ownedPids: report.ownedPids, runtimeDirectory: report.runtimeDirectory, outerRuntimeDirectory: runtime.directory, outerRuntimeRemoved: true,
      joined: report.traceReports?.length === 2 && report.traceReports.every(t => t.status === "completed-diagnostic")
        ? joinUiLargestBlinkTypes(report.traceReports, report.rows) : null });
    console.log(JSON.stringify({ mode, status: report.status, failure: report.failure, cleanup: report.cleanup }));
    assert.equal(report.status, "completed-diagnostic", "Retain failure; never retry unchanged");
  }
} catch (error) { failure = String(error); process.exitCode = 1; }

let geometry = null;
if (proofs.length === 2 && proofs.every(p => p.status === "completed-diagnostic")) {
  const [before, after] = proofs;
  assert.equal(before.browserVersion, after.browserVersion);
  assert.deepEqual(before.layoutExperiment.choices, after.layoutExperiment.choices);
  assert.equal(before.layoutExperiment.matrixMarkupSha256, after.layoutExperiment.matrixMarkupSha256);
  geometry = before.layoutExperiment.geometry.map((a, index) => {
    const b = after.layoutExperiment.geometry[index];
    assert.equal(a.profileId, b.profileId); assert.deepEqual(a.viewport, b.viewport);
    const sameControls = JSON.stringify(a.controls) === JSON.stringify(b.controls);
    const sameMarkup = a.rows.length === b.rows.length && a.rows.every((r, i) => r.selector === b.rows[i].selector && r.index === b.rows[i].index && r.htmlSha256 === b.rows[i].htmlSha256);
    const differences = sameMarkup ? a.rows.map((r, i) => ({ selector: r.selector, index: r.index,
      maxDifferenceCssPixels: Math.max(...["x", "y", "width", "height"].map(key => Math.abs(r[key] - b.rows[i][key]))) })) : null;
    const maxDifferenceCssPixels = differences ? Math.max(...differences.map(d => d.maxDifferenceCssPixels)) : null;
    return { profileId: a.profileId, viewport: a.viewport, sameControls, sameMarkup, maxDifferenceCssPixels,
      pass: sameControls && sameMarkup && maxDifferenceCssPixels <= 1, differences: differences?.filter(d => d.maxDifferenceCssPixels > 1) ?? null };
  });
}
for (const [file, digest] of Object.entries(sourcePins)) assert.equal(sha(await readFile(path.join(root, file))), digest, file);
const proof = { recordedAt: new Date().toISOString(), status: failure ? "failed-matrix-layout-control" : geometry?.every(g => g.pass)
  ? "paired-matrix-layout-geometry-pass-not-public-acceptance" : "candidate-layout-rejected", sourcePins, proofs, geometry, failure,
  changedPublishedFiles: false, conversionsPerformed: 0, generatedMediaCopies: 0, publicAcceptance: false,
  completeChromiumMemoryAcceptance: false, originalFailureAllocationCause: null, conversionSpeedAcceptance: false,
  caveat: "Fully rendered405cards; same actual protected source/60choices/dynamic flex/flags/trace caps. Partial garbage-inclusive type inventories and seven private snapshots are NOT live allocation/continuous peaks/primary acceptance or original failure cause. Geometry after both traces. No deferral/forcedGC/engine/source/output changes." };
const json = JSON.stringify(proof, null, 2) + "\n";
assert.ok(Buffer.byteLength(json) < 4 * 1048576);
await writeFile(envelopePath, json, { flag: "wx" });
console.log(JSON.stringify({ path: envelopePath, status: proof.status, geometry, failure }));
if (proof.status !== "paired-matrix-layout-geometry-pass-not-public-acceptance") process.exitCode = 1;
