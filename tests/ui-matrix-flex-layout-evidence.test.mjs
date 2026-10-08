import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { access, readFile } from "node:fs/promises";
import path from "node:path";
import test from "node:test";
import { gunzipSync } from "node:zlib";
import { joinUiLargestBlinkTypes } from "../scripts/lib/ui-largest-blink-join.mjs";

const root = path.resolve(import.meta.dirname, ".."), sha = bytes => createHash("sha256").update(bytes).digest("hex");
const prefix = "evidence/2026-10-08T08-38-48-399Z-ui-matrix-flex-layout";
const read = async suffix => JSON.parse(await readFile(path.join(root, prefix + suffix + ".json")));

test("actual current-Chrome matrix pair preserves405cards and nine responsive geometries", async () => {
  const p = await read("");
  assert.equal(p.status, "paired-matrix-layout-geometry-pass-not-public-acceptance");
  assert.equal(p.geometry.length, 9); assert.ok(p.geometry.every(g => g.sameMarkup && g.sameControls && g.pass && g.maxDifferenceCssPixels <= .016));
  assert.deepEqual(p.proofs.map(m => m.mode), ["matrix-grid", "matrix-flex"]);
  for (const m of p.proofs) {
    assert.equal(m.status, "completed-diagnostic"); assert.equal(m.browserVersion, "154.0.8037.98");
    assert.equal(m.layoutExperiment.matrixCards, 405); assert.equal(m.layoutExperiment.matrixMarkupSha256, "4d2f0c1da04db1bbd47e2bee964503f510cc31c001b619bc454fe6780df8f7c1");
    assert.ok(!/content-visibility|visibility:|display:none|order:/.test(m.layoutExperiment.css));
    assert.equal(m.rows.length, 7); assert.ok(m.rows.every(r => r.error === null && r.privateBytes > 0 && r.jobState !== "running"));
    for (const value of Object.values(m.cleanup)) assert.equal(value, true);
    for (const directory of [m.runtimeDirectory, m.outerRuntimeDirectory]) await assert.rejects(access(directory), { code: "ENOENT" });
    for (const [name, source] of Object.entries(m.generatedSources)) assert.equal(sha(source), m.generatedHashes[name]);
    for (const [file, hash] of Object.entries(m.sourcePins)) assert.equal(sha(await readFile(path.join(root, file))), hash, file);
  }
});

test("static Blink savings do not disguise unchanged selection growth or certify whole-browser memory", async () => {
  const a = await read("-analysis"), [grid, flex] = a.modes;
  assert.equal(a.status, "verified-terminal-matrix-layout-pair-not-public-acceptance");
  assert.equal(grid.gridTrackGrowthBytes, 209280); assert.equal(flex.gridTrackGrowthBytes, 209280);
  assert.equal(grid.mainBlinkAllocatedGrowthBytes, 8652976); assert.equal(flex.mainBlinkAllocatedGrowthBytes, 8652864);
  assert.equal(grid.fullTreePrivateAfterBytes, 367362048); assert.equal(flex.fullTreePrivateAfterBytes, 366497792);
  assert.equal(flex.addedProcessIdentitiesAtAfterSnapshot.length, 5);
  const [beforeGrid, beforeFlex] = a.modes.map(m => m.selectedTypes.find(t => /GridSizingTrackCollection/.test(t.type)).beforeAllocatedObjectsBytes);
  assert.equal(beforeGrid, 4269312); assert.equal(beforeFlex, 27904);
  assert.equal(a.cleanup.sampledIdentities, 28); assert.equal(a.cleanup.checkedPids, 30);
  assert.equal(a.cleanup.allObservedPidsAbsent, true); assert.equal(a.cleanup.protectedFullPostHashMatches, true);
  assert.equal(a.publicAcceptance, false); assert.equal(a.completeChromiumMemoryAcceptance, false);
  assert.equal(a.conversionSpeedAcceptance, false); assert.equal(a.originalFailureAllocationCause, null);
  for (const [file, hash] of Object.entries(a.sourcePins)) assert.equal(sha(await readFile(path.join(root, file))), hash, file);
});

test("two compact archives reconstruct exact raw allocation traces after verified removal", async () => {
  const p = await read(""), c = await read("-compaction");
  assert.equal(c.status, "verified-lossless-ui-matrix-raw-report-compaction"); assert.equal(c.reports.length, 2);
  for (const [i, r] of c.reports.entries()) {
    await assert.rejects(access(path.join(root, r.rawPath)), { code: "ENOENT" });
    const archive = await readFile(path.join(root, r.archivePath));
    assert.equal(archive.length, r.archiveBytes); assert.equal(sha(archive), r.archiveSha256);
    const bytes = gunzipSync(archive, { maxOutputLength: 4 * 1048576 });
    assert.equal(bytes.length, r.rawBytes); assert.equal(sha(bytes), r.rawSha256);
    assert.equal(r.rawSha256, p.proofs[i].rawReport.sha256);
    const raw = JSON.parse(bytes); assert.deepEqual(joinUiLargestBlinkTypes(raw.traceReports, raw.rows), p.proofs[i].joined);
    assert.deepEqual(raw.forbidden, []); assert.ok(raw.traceReports.every(t => t.status === "completed-diagnostic"));
  }
  for (const [file, hash] of Object.entries(c.sourcePins)) assert.equal(sha(await readFile(path.join(root, file))), hash, file);
});
