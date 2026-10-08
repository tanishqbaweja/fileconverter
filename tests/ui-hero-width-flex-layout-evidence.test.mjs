import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { access, readFile } from "node:fs/promises";
import path from "node:path";
import test from "node:test";
import { gunzipSync } from "node:zlib";
import { joinUiLargestBlinkTypes } from "../scripts/lib/ui-largest-blink-join.mjs";
const root = path.resolve(import.meta.dirname, ".."), sha = b => createHash("sha256").update(b).digest("hex");
const prefix = "evidence/2026-10-08T11-39-44-157Z-ui-hero-width-flex-layout";
const read = async suffix => JSON.parse(await readFile(path.join(root, prefix + suffix + ".json")));

test("actual corrected hero pair preserves all405cards/controls and nine responsive geometries", async () => {
  const p = await read("");
  assert.equal(p.status, "paired-hero-width-layout-geometry-pass-not-public-acceptance"); assert.equal(p.failure, null);
  assert.equal(p.geometry.length, 9);
  assert.deepEqual(p.proofs.map(m => m.mode), ["hero-width-grid", "hero-width-flex"]);
  for (const [i, g] of p.geometry.entries()) {
    const [a, b] = p.proofs.map(m => m.layoutExperiment.geometry[i]);
    assert.deepEqual(a.controls, b.controls); assert.deepEqual(a.viewport, b.viewport);
    assert.deepEqual(a.rows.map(r => [r.selector, r.index, r.htmlSha256]), b.rows.map(r => [r.selector, r.index, r.htmlSha256]));
    const difference = Math.max(...a.rows.flatMap((r, j) => ["x", "y", "width", "height"].map(k => Math.abs(r[k] - b.rows[j][k]))));
    assert.equal(g.maxDifferenceCssPixels, difference); assert.equal(g.pass, true);
    assert.equal(difference, a.viewport.width === 1280 ? .015625 : 0);
  }
  for (const m of p.proofs) {
    assert.equal(m.status, "completed-diagnostic"); assert.equal(m.browserVersion, "154.0.8037.98");
    assert.equal(m.layoutExperiment.matrixCards, 405);
    assert.equal(m.layoutExperiment.matrixMarkupSha256, "4d2f0c1da04db1bbd47e2bee964503f510cc31c001b619bc454fe6780df8f7c1");
    assert.equal(m.rows.length, 7); assert.ok(m.rows.every(r => r.error === null && r.privateBytes > 0 && r.jobState !== "running"));
    for (const v of Object.values(m.cleanup)) assert.equal(v, true);
    for (const dir of [m.runtimeDirectory, m.outerRuntimeDirectory]) await assert.rejects(access(dir), { code: "ENOENT" });
    for (const [name, source] of Object.entries(m.generatedSources)) assert.equal(sha(source), m.generatedHashes[name]);
    for (const [file, hash] of Object.entries(m.sourcePins)) assert.equal(sha(await readFile(path.join(root, file))), hash, file);
  }
  for (const [file, hash] of Object.entries(p.sourcePins)) assert.equal(sha(await readFile(path.join(root, file))), hash, file);
});

test("allocation diagnostics remain distinct from continuous whole-browser or speed acceptance", async () => {
  const a = await read("-analysis"), [grid, flex] = a.modes;
  assert.equal(a.candidateGeometryAccepted, true);
  assert.equal(grid.embedderGrowthBytes, 8458752); assert.equal(flex.embedderGrowthBytes, 3955720);
  assert.equal(grid.mainBlinkAllocatedGrowthBytes, 8653120); assert.equal(flex.mainBlinkAllocatedGrowthBytes, 4388632);
  assert.equal(grid.fullTreePrivateAfterBytes, 375218176); assert.equal(flex.fullTreePrivateAfterBytes, 361947136);
  assert.equal(grid.gridTrackGrowthBytes, 209280); assert.equal(flex.gridTrackGrowthBytes, null);
  assert.deepEqual(flex.selectedTypes, []);
  for (const m of a.modes) { assert.equal(m.addedProcessIdentitiesAtAfterSnapshot.length, 5); assert.equal(m.snapshotsNotContinuousPeaks, true); }
  assert.equal(a.cleanup.sampledIdentities, 32); assert.equal(a.cleanup.checkedPids, 34);
  assert.equal(a.cleanup.allObservedPidsAbsent, true); assert.equal(a.cleanup.protectedFullPostHashMatches, true);
  assert.equal(a.publicAcceptance, false); assert.equal(a.completeChromiumMemoryAcceptance, false);
  assert.equal(a.conversionSpeedAcceptance, false); assert.equal(a.originalFailureAllocationCause, null);
  for (const [file, hash] of Object.entries(a.sourcePins)) assert.equal(sha(await readFile(path.join(root, file))), hash, file);
  const prep = JSON.parse(await readFile(path.join(root, "evidence/ui-hero-width-flex-preparation-2026-10-08.json")));
  assert.equal(prep.browserExecutions, 0); assert.equal(prep.candidateGeometryAccepted, null);
  for (const [file, hash] of Object.entries(prep.sourcePins)) assert.equal(sha(await readFile(path.join(root, file))), hash, file);
});

test("corrected pair lossless archives reconstruct exact raw joins after guarded removal", async () => {
  const p = await read(""), c = await read("-compaction");
  assert.equal(c.status, "verified-lossless-ui-hero-width-raw-report-compaction"); assert.equal(c.reports.length, 2);
  for (const [i, r] of c.reports.entries()) {
    await assert.rejects(access(path.join(root, r.rawPath)), { code: "ENOENT" });
    const archive = await readFile(path.join(root, r.archivePath));
    assert.equal(archive.length, r.archiveBytes); assert.equal(sha(archive), r.archiveSha256);
    const bytes = gunzipSync(archive, { maxOutputLength: 4 * 1048576 });
    assert.equal(bytes.length, r.rawBytes); assert.equal(sha(bytes), r.rawSha256);
    assert.equal(r.rawSha256, p.proofs[i].rawReport.sha256);
    const raw = JSON.parse(bytes); assert.deepEqual(joinUiLargestBlinkTypes(raw.traceReports, raw.rows), p.proofs[i].joined);
    assert.deepEqual(raw.forbidden, []); assert.equal(raw.traceReports.length, 2);
    assert.ok(raw.traceReports.every(t => t.status === "completed-diagnostic"));
  }
  for (const [file, hash] of Object.entries(c.sourcePins)) assert.equal(sha(await readFile(path.join(root, file))), hash, file);
});
