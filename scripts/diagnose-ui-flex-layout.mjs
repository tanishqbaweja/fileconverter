// ONE changed short real-UI pair; no fake progress, media conversion or publication.
import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { access, readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import { pathToFileURL } from "node:url";
import { createOwnedRuntimeScratch } from "./lib/owned-runtime-scratch.mjs";
import { inspectStressHostMemory } from "./lib/host-memory-preflight.mjs";
import { makeDetailedBlinkAttribution } from "./lib/largest-blink-attribution-recipe.mjs";
import { makeUiFlexLayoutControl } from "./lib/ui-flex-layout-recipe.mjs";
import { joinUiLargestBlinkTypes } from "./lib/ui-largest-blink-join.mjs";
const root = path.resolve(import.meta.dirname, ".."), sha = bytes => createHash("sha256").update(bytes).digest("hex");
for (const name of ["ui-grid-layout", "ui-flex-layout", "ui-flex-layout-comparison"])
  await assert.rejects(access(path.join(root, `evidence/${name}-2026-10-07.json`)), { code: "ENOENT" });
const historical = JSON.parse(await readFile(path.join(root, "evidence/mpeg2-failure-only-attribution-2026-10-07.json")));
assert.equal(historical.completeOriginalConversion, false);
for (const [file, digest] of Object.entries(historical.sourcePins)) assert.equal(sha(await readFile(path.join(root, file))), digest, file);
const proofs = [];
for (const candidate of [false, true]) {
  const mode = candidate ? "flex" : "grid", host = await inspectStressHostMemory();
  console.log(JSON.stringify({ mode, host })); assert.equal(host.safeToStart, true, "Same physical AND virtual2GiB preflight");
  const runtime = await createOwnedRuntimeScratch(`ui-${mode}-layout-wrapper-`);
  let helperSource, controlSource, report, rawPath;
  try {
    helperSource = makeDetailedBlinkAttribution(await readFile(path.join(root, "scripts/lib/bounded-renderer-attribution.mjs"), "utf8"), root);
    const helper = path.join(runtime.directory, "attribution.mjs"); await writeFile(helper, helperSource, { flag: "wx" });
    controlSource = makeUiFlexLayoutControl(await readFile(path.join(root, "scripts/diagnose-ui-native-allocation.mjs"), "utf8"), root, pathToFileURL(helper).href, candidate);
    const driver = path.join(runtime.directory, "control.mjs"); await writeFile(driver, controlSource, { flag: "wx" });
    const completed = await import(pathToFileURL(driver).href); report = completed.completedReport; rawPath = completed.completedReportPath;
  } finally { await runtime.close(); }
  await assert.rejects(access(runtime.directory), { code: "ENOENT" }); assert.ok(report && rawPath);
  const raw = await readFile(rawPath), complete = report.traceReports?.length === 2 && report.traceReports.every(t => t.status === "completed-diagnostic");
  const proof = { recordedAt: new Date().toISOString(), status: report.status, mode, host, browserVersion: report.browserVersion,
    scope: report.scope, rawReport: { path: path.relative(root, rawPath).replaceAll("\\", "/"), bytes: raw.length, sha256: sha(raw) },
    generatedSources: { helper: helperSource, control: controlSource }, generatedHashes: { helper: sha(helperSource), control: sha(controlSource) },
    sourcePins: report.sourcePins, rows: report.rows, layoutExperiment: report.layoutExperiment,
    traces: report.traceReports?.map(t => ({ ...t, realmRows: t.realmRows.length })) ?? [],
    joined: complete ? joinUiLargestBlinkTypes(report.traceReports, report.rows) : null,
    cleanup: report.cleanup, cleanupErrors: report.cleanupErrors, failure: report.failure,
    outerRuntimeRemoved: true, outerRuntimeDirectory: runtime.directory, runtimeDirectory: report.runtimeDirectory, ownedPids: report.ownedPids,
    originalBytes: report.originalSourceBytes, originalSha256: report.originalSourceSha256, forbidden: report.forbidden,
    noForcedGc: true, conversionsPerformed: 0, generatedMediaCopies: 0, publicAcceptance: false,
    completeChromiumMemoryAcceptance: false, conversionSpeedAcceptance: false, originalFailureAllocationCause: null,
    caveat: "Paired short actual UI source-inspection/60format changes; native snapshots NOT continuous250MiB gate. Two separately closed4MiB/16MiB detailed traces/top64 partial intersection, garbage/non-live/overlap caveats unchanged. Responsive geometry AFTER measurement. No conversions/synthetic progress/output/production change or original-spike attribution." };
  const json = JSON.stringify(proof, null, 2) + "\n"; assert.ok(Buffer.byteLength(json) < 2 * 1048576);
  const file = path.join(root, `evidence/ui-${mode}-layout-2026-10-07.json`); await writeFile(file, json, { flag: "wx" }); proofs.push(proof);
  console.log(JSON.stringify({ file, status: proof.status, cases: proof.layoutExperiment.geometry.length, cleanup: proof.cleanup, failure: proof.failure }));
  assert.equal(proof.status, "completed-diagnostic", "Preserved actual failure; no unchanged mode retry");
}
const [before, after] = proofs;
assert.equal(before.browserVersion, after.browserVersion); assert.deepEqual(before.layoutExperiment.choices, after.layoutExperiment.choices);
assert.equal(before.layoutExperiment.matrixMarkupSha256, after.layoutExperiment.matrixMarkupSha256);
const geometry = before.layoutExperiment.geometry.map((a, index) => {
  const b = after.layoutExperiment.geometry[index];
  assert.equal(a.profileId, b.profileId); assert.deepEqual(a.viewport, b.viewport);
  const sameControls = JSON.stringify(a.controls) === JSON.stringify(b.controls);
  const sameMarkup = a.rows.length === b.rows.length && a.rows.every((row, i) => row.selector === b.rows[i].selector && row.index === b.rows[i].index && row.htmlSha256 === b.rows[i].htmlSha256);
  const differences = sameMarkup ? a.rows.map((row, i) => ({ selector: row.selector, index: row.index,
    maxDifferenceCssPixels: Math.max(...["x", "y", "width", "height"].map(key => Math.abs(row[key] - b.rows[i][key]))) })) : null;
  const maxDifferenceCssPixels = differences ? Math.max(...differences.map(d => d.maxDifferenceCssPixels)) : null;
  return { profileId: a.profileId, viewport: a.viewport, sameControls, sameMarkup, maxDifferenceCssPixels,
    geometryPass: sameControls && sameMarkup && maxDifferenceCssPixels <= 1, differences: differences?.filter(d => d.maxDifferenceCssPixels > 1) ?? null };
});
const heaps = p => p.rows.filter(row => ["native-sampling-start", "ui-control-settled-3s"].includes(row.phase))
  .map(row => ({ phase: row.phase, privateBytes: row.privateBytes, rssBytes: row.rssBytes, heap: row.heap, dom: row.dom }));
const types = p => p.joined.filter(row => row.traceName?.startsWith("Renderer")).map(row => ({ pid: row.pid, nativeBirthMatched: row.nativeBirthMatched,
  beforeHeaps: row.beforeHeaps, afterHeaps: row.afterHeaps,
  selectedTypes: row.types.filter(t => /GridSizingTrackCollection|PlainTextNode|LogicalLineItems|FlexItem|FlexLine/.test(t.type)) }));
const comparison = { recordedAt: new Date().toISOString(), status: geometry.every(row => row.geometryPass) ? "paired-layout-geometry-pass-not-public-acceptance" : "candidate-layout-rejected",
  modes: proofs.map(p => ({ mode: p.mode, status: p.status, rawReport: p.rawReport, heaps: heaps(p), selectedTypeIntersection: types(p), cleanup: p.cleanup })),
  geometry, sameMatrixMarkup: true, matrixCards: 405, noDeferralOrHiddenContent: true,
  css: after.layoutExperiment.css, sourcePins: after.sourcePins,
  noForcedGc: true, conversionsPerformed: 0, generatedMediaCopies: 0, publicAcceptance: false, originalFailureAllocationCause: null,
  conversionSpeedAcceptance: false, completeChromiumMemoryAcceptance: false,
  caveat: "Fresh paired grid/flex controls, same60realchoices/source/flags/tracecaps/visibleHTML. Only observed partialtypes, no absent-as-zero or cross-run exact native-process identity claim. Geometries at9actual profile/viewport combinations AFTER measurement. Short idle diagnostic, not full-source conversion/memory/speed or a proven spike fix; production untouched." };
const file = path.join(root, "evidence/ui-flex-layout-comparison-2026-10-07.json"); await writeFile(file, JSON.stringify(comparison, null, 2) + "\n", { flag: "wx" });
console.log(JSON.stringify({ file, status: comparison.status, geometry, modes: comparison.modes }));
if (!geometry.every(row => row.geometryPass)) process.exitCode = 1;
