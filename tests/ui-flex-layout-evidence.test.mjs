import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { access, readFile } from "node:fs/promises";
import path from "node:path";
import test from "node:test";
const root = path.resolve(import.meta.dirname, ".."), sha = bytes => createHash("sha256").update(bytes).digest("hex");
const read = async name => JSON.parse(await readFile(path.join(root, `evidence/ui-${name}-2026-10-07.json`)));

test("actual paired grid/flex controls preserve nine geometries/markup/settings and405published cards", async () => {
  const comparison = await read("flex-layout-comparison");
  assert.equal(comparison.status, "paired-layout-geometry-pass-not-public-acceptance");
  assert.equal(comparison.geometry.length, 9); assert.equal(comparison.matrixCards, 405);
  assert.ok(comparison.geometry.every(row => row.sameControls && row.sameMarkup && row.geometryPass && row.maxDifferenceCssPixels === 0));
  assert.equal(comparison.noDeferralOrHiddenContent, true);
  assert.ok(!/content-visibility|display:none|order:/.test(comparison.css));
  for (const mode of ["grid", "flex"]) {
    const p = await read(`${mode}-layout`);
    assert.equal(p.status, "completed-diagnostic"); assert.equal(p.traces.length, 2);
    assert.ok(p.traces.every(t => t.status === "completed-diagnostic" && t.trace.dataLossOccurred === false && !t.trace.overflow && !t.trace.parseError));
    assert.equal(p.rows.length, 7); assert.ok(p.rows.every(row => row.error === null && row.jobState !== "running"));
    assert.equal(p.rows[3].dom.nodes, 7265); assert.equal(p.rows[5].dom.nodes, 8345);
    assert.equal(p.conversionsPerformed, 0); assert.equal(p.generatedMediaCopies, 0);
    assert.equal(p.noForcedGc, true); assert.equal(p.publicAcceptance, false);
    assert.equal(p.originalFailureAllocationCause, null);
    assert.equal(p.layoutExperiment.geometry.length, 9); assert.equal(p.layoutExperiment.matrixCards, 405);
    for (const [file, hash] of Object.entries(p.sourcePins)) assert.equal(sha(await readFile(path.join(root, file))), hash, file);
    for (const [name, source] of Object.entries(p.generatedSources)) assert.equal(sha(source), p.generatedHashes[name]);
    for (const value of Object.values(p.cleanup)) assert.equal(value, true);
    await assert.rejects(access(p.runtimeDirectory), { code: "ENOENT" });
    await assert.rejects(access(p.outerRuntimeDirectory), { code: "ENOENT" });
  }
});

test("smaller observed Blink/grid allocation does NOT replace complete private memory or certify original conversion", async () => {
  const a = await read("flex-layout-analysis"), [grid, flex] = a.modes;
  assert.equal(grid.gridTrackGrowthBytes, 2406720); assert.equal(flex.gridTrackGrowthBytes, 209280);
  assert.equal(grid.gridTrackGrowthObjects, 1380); assert.equal(flex.gridTrackGrowthObjects, 120);
  assert.equal(a.gridTrackGrowthReductionPercent, 100 * (1 - flex.gridTrackGrowthBytes / grid.gridTrackGrowthBytes));
  assert.equal(a.mainBlinkAllocatedGrowthReductionBytes, 2977488); assert.equal(a.embedderGrowthReductionBytes, 3127104);
  assert.equal(grid.plainTextGrowthBytes, 2157600); assert.equal(flex.plainTextGrowthBytes, 2157600);
  assert.ok(flex.fullTreePrivateAfterBytes > grid.fullTreePrivateAfterBytes);
  assert.equal(flex.addedProcessIdentitiesAtAfterSnapshot.length, 5);
  assert.equal(a.fullTreeImprovementProven, false); assert.equal(a.sameNativeIdentityAcrossFreshModes, false);
  assert.equal(a.productionChanged, false); assert.equal(a.publicAcceptance, false);
  assert.equal(a.originalFullSourceMemoryAcceptance, false); assert.equal(a.conversionSpeedAcceptance, false);
  assert.equal(a.originalConversionCause, null);
  assert.equal(a.cleanup.sampledIdentities, 32); assert.equal(a.cleanup.checkedPids, 34);
  assert.equal(a.cleanup.allObservedPidsAbsent, true); assert.equal(a.cleanup.protectedFullPostHashMatches, true);
  assert.equal(a.cleanup.fourScratchDirectoriesAbsent, true);
  for (const [file, hash] of Object.entries(a.sourcePins)) assert.equal(sha(await readFile(path.join(root, file))), hash, file);
});
