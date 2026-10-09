// Retained controlled UI/build evidence, never conversion certification.
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";
import { gunzipSync } from "node:zlib";
import { baselineBinding, sha } from "../scripts/lib/stable-ui-headless-baseline-recipe.mjs";
import { makeProgressCompositingCandidate } from "../scripts/lib/progress-compositing-recipe.mjs";
const root = new URL("../", import.meta.url), read = file => readFile(new URL(file, root));
const ui = JSON.parse(await read("evidence/2026-10-09T15-18-50-602Z-progress-compositing-css.json"));
const build = JSON.parse(await read("evidence/2026-10-09T15-22-00-000Z-progress-compositing-build.json"));
test("Actual ABBA controlled production-page width animation causes layouts; transform eliminates them in this workload only", async () => {
  assert.equal(ui.failure, null); assert.equal(ui.status, "controlled-production-page-css-workload-tested-not-conversion-acceptance");
  assert.deepEqual(ui.rows.map(row => row.mode), ["baseline", "candidate", "candidate", "baseline"]);
  assert.deepEqual(ui.rows.map(row => row.delta.LayoutCount), [1007, 0, 0, 1012]);
  assert.ok(ui.rows.every(row => row.updates === 34));
  assert.equal(ui.workload.updateIntervalMs, 125); assert.equal(ui.workload.recordedProgressResampledForUiOnly, true);
  assert.equal(ui.nativeAllocationCauseProven, false); assert.equal(ui.conversionSpeedAcceptance, false);
  assert.equal(ui.completeChromiumMemoryAcceptance, false); assert.equal(ui.publicAcceptance, false);
  assert.deepEqual(ui.sourcePins, ui.postSourcePins);
  for (const [file, hash] of Object.entries(ui.sourcePins)) assert.equal(sha(await read(file)), hash, file);
});
test("All seven actual painted geometries/colors/heights match including original minimum marker; normal page survives and owned runtime is removed", async () => {
  assert.deepEqual(ui.geometry.map(row => row.percent), [0, 0.1, 1, 10, 50, 99, 100]);
  for (const row of ui.geometry) {
    assert.equal(row.baselineTrackWidth, row.candidateTrackWidth);
    assert.ok(Math.abs(row.baselinePaintedWidth - row.candidatePaintedWidth) <= 1 / 64);
    assert.equal(row.baselineColor, row.candidateColor); assert.equal(row.markerColor, row.baselineColor);
    assert.equal(row.heights[0], row.heights[1]);
  }
  assert.ok(ui.geometry[0].candidatePaintedWidth > 0);
  assert.equal(ui.cleanup.chrome.status, "owned-identity-absent"); assert.equal(ui.cleanup.ownedServerStopped, true);
  assert.equal(ui.cleanup.runtimeRemoved, true); assert.equal(ui.browserMode, "headless");
  const png = await read(ui.screenshots[0]); assert.deepEqual([...png.subarray(0, 8)], [137, 80, 78, 71, 13, 10, 26, 10]);
});
test("Exact private candidate sources/client CSS+JS reconstruct and type/lint pass; published App/CSS and normal production are restored", async () => {
  assert.equal(build.status, "private-progress-compositing-built-not-conversion-acceptance");
  assert.equal(build.normalProductionRestored, true); assert.equal(build.forBrowser, false);
  assert.equal(build.candidateLintErrors, 0); assert.equal(build.candidateLintWarnings, 0); assert.equal(build.candidateTypeDiagnostics, 0);
  for (const [file, hash] of Object.entries(build.sourcePins)) assert.equal(sha(await read(file)), hash, file);
  const inflated = [];
  for (const record of [build.sourceArchive, build.appArchive, build.cssArchive]) {
    const compressed = await read(record.path); assert.equal(compressed.length, record.bytes); assert.equal(sha(compressed), record.sha256);
    const raw = gunzipSync(compressed); assert.equal(raw.length, record.rawBytes); assert.equal(sha(raw), record.rawSha256); inflated.push(raw);
  }
  const recipe = makeProgressCompositingCandidate((await read("app/converter/ConverterApp.tsx")).toString(), (await read("app/globals.css")).toString());
  assert.deepEqual(JSON.parse(inflated[0]), recipe);
  assert.equal(inflated[1].length, build.asset.bytes); assert.equal(sha(inflated[1]), build.asset.sha256);
  assert.equal(inflated[2].length, build.stylesheet.bytes); assert.equal(sha(inflated[2]), build.stylesheet.sha256);
  assert.equal(sha(await read("dist/client" + baselineBinding.url)), baselineBinding.sha256);
  assert.equal(build.publishedSourceUnchanged, true); assert.equal(build.engineChanged, false);
  assert.equal(build.conversionSpeedAcceptance, false); assert.equal(build.completeChromiumMemoryAcceptance, false);
});
