import assert from "node:assert/strict";
import test from "node:test";
import { createHash } from "node:crypto";
import { readFile } from "node:fs/promises";
import { gunzipSync } from "node:zlib";
import { renderCurrentScalingSeries } from "../scripts/lib/mkv-current-scaling-series.mjs";
import { headerProtectedReference } from "../scripts/lib/mkv-header-protected-reference.mjs";
import { largeScalingReference } from "../scripts/lib/mkv-large-scaling-reference.mjs";
const read = f => readFile(new URL(`../${f}`, import.meta.url)), sha = b => createHash("sha256").update(b).digest("hex");
async function entries() {
  const refs = [{ ...headerProtectedReference, label: "original" }, { ...largeScalingReference, label: "synthetic-900loops" },
    { file: "evidence/2026-11-16T01-06-04-238Z-mkv-hevc-header-core-scale-near10gb.json", sha256: "0397e86401a5f40f0cded71d20a1522731fcc12174f27c59324949d73f6d5777", label: "synthetic-1600loops" }];
  return Promise.all(refs.map(async reference => {
    const bytes = await read(reference.file); assert.equal(sha(bytes), reference.sha256); const report = JSON.parse(bytes), archive = report.arms[0].archive;
    const packed = await read(archive.file); assert.equal(sha(packed), archive.sha256);
    const raw = gunzipSync(packed, { maxOutputLength: 128 * 1048576 }); assert.equal(sha(raw), archive.decodedSha256);
    return { report, reference, samples: JSON.parse(raw) };
  }));
}
test("compact three-size series independently recomputes every conversion peak; same exact core/Chrome, different original content and FAILED near10GB explicit", async () => {
  const data = await entries(), { summary, csv, html } = renderCurrentScalingSeries(data), p = summary.points;
  assert.deepEqual(p.map(p => p.incrementalPrivateMiB), [223.46484375, 173.59375, 233.5078125]);
  assert.deepEqual(p.map(p => p.validSamples), [224, 457, 1108]); assert.deepEqual(p.map(p => p.singleCompleteQualification), [true, true, false]);
  assert.deepEqual(p.map(p => p.cleanupAboveIdleMiB), [18.078125, 44.3203125, null]);
  assert.equal(summary.nativeWasmSha256, "41c4a075de285d0d906b2711c5e5420a401235ab89e1f185abe5d48a830a3eba");
  assert.equal(summary.chromeVersion, "157.0.8103.51"); assert.equal(summary.originalHasDifferentContentAndGeometry, true);
  assert.deepEqual(summary.matchedSyntheticParentOnly, [1, 2]); assert.equal(p[0].parentSha256, null); assert.equal(p[1].parentSha256, p[2].parentSha256);
  for (const k of ["flatMemoryProven", "productionSpeedupProven", "repeatGatePassed", "publicAcceptance", "primaryFormulaChanged", "processesExcluded"]) assert.equal(summary[k], false);
  assert.match(html, /Red points failed full qualification/); assert.match(html, /DIFFERENT content and geometry/); assert.match(html, /5GB repeats remain FAILED/);
  assert.doesNotMatch(html, /<script|https?:\/\//); assert.equal(csv.trim().split("\n").length, 4); assert.ok(JSON.stringify(summary).length < 8192);
});
test("mismatched Chrome, altered original blank, changed native and false full success cannot make a cross-size comparison", async () => {
  for (const mutate of [
    e => { e[2].report.arms[0].browser.version = "different"; },
    e => { e[2].report.arms[0].blank.privateBytes += 1048576; },
    e => { e[2].report.candidateBuild.runId = "different"; },
    e => { e[2].report.status = "passed-first-real-near10gb-scaling-not-repeats-or-public-acceptance"; },
  ]) { const data = await entries(); mutate(data); assert.throws(() => renderCurrentScalingSeries(data)); }
});
