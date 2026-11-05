import assert from "node:assert/strict";
import { test } from "node:test";
import { readFile } from "node:fs/promises";
import { gunzipSync } from "node:zlib";
import { createHash } from "node:crypto";
import { execFile } from "node:child_process";
import { promisify } from "node:util";
import path from "node:path";
import { makeVp9OriginalStartupSource } from "../scripts/lib/vp9-original-startup-recipe.mjs";
import { originalStartupStop, VP9_ORIGINAL_STARTUP } from "../scripts/lib/vp9-original-startup.mjs";
const root = path.resolve(import.meta.dirname, ".."), parent = JSON.parse(await readFile(new URL("../evidence/2026-11-05-webcodecs-vp9-stream-duration-fidelity-42020605269-recipe.json", import.meta.url)));
const source = gunzipSync(Buffer.from(parent.generatedSourceGzipBase64, "base64"), { maxOutputLength: 1048576 }).toString();
const sha = value => createHash("sha256").update(value).digest("hex");
test("startup recipe exactly reverses to authenticated retained source without editing or rerunning old evidence", () => {
  assert.equal(sha(source), parent.generatedSha256); const result = makeVp9OriginalStartupSource(source, root);
  let reversed = result.generated;
  for (const [before, after] of result.edits.toReversed()) { assert.equal(reversed.split(after).length, 2); reversed = reversed.replace(after, before); }
  assert.equal(reversed, source); assert.equal(result.parentSha256, parent.generatedSha256); assert.equal(result.generatedSha256, sha(result.generated));
  assert.equal(result.startupOnly, true); assert.equal(result.fullFileAcceptance, false); assert.equal(result.publicAcceptance, false);
});
test("full original is passed directly, not an excerpt/generated source, with strict preflight and old baseline unchanged", () => {
  const { generated, changesMemoryFormulaOrLimit, changesBaselineWindowOrThreshold } = makeVp9OriginalStartupSource(source, root);
  assert.ok(generated.includes('const fixture = path.join(root, "test.mkv");'));
  assert.ok(generated.includes('protectedOriginal: true, generated: false, copied: false, truncated: false'));
  assert.doesNotMatch(generated, /testsrc2=|fixtureArgs|copyFile\(comparisonSource, fixture|count_frames/);
  assert.ok(generated.includes('minimumBytes: 2147483648')); assert.ok(generated.includes('assert.equal(report.blankBaseline?.stable, true, "Stable blank required before the long original startup'));
  assert.equal(changesMemoryFormulaOrLimit, false); assert.equal(changesBaselineWindowOrThreshold, false);
  assert.ok(generated.includes('report.workerIsolation = false; report.explicitCpuWorker = true;'));
});
test("memory gate uses exact250MiB same-blank threshold, missing is unavailable rather than zero", () => {
  const baseline = 300000000, peak = mib => ({ peak: { privateBytes: baseline + mib * 1048576 }, validSamples: 1, unavailableSamples: 0 });
  assert.equal(originalStartupStop(peak(250), baseline, 2000), null);
  assert.equal(originalStartupStop(peak(250.000001), baseline, 2000).kind, "memory-budget-exceeded");
  assert.equal(originalStartupStop({ peak: null, validSamples: 0, unavailableSamples: 1 }, baseline, 100).kind, "unavailable-memory-samples");
  assert.equal(originalStartupStop({ peak: null, validSamples: 0, unavailableSamples: 0 }, baseline, 100), null);
  assert.equal(originalStartupStop({ peak: null, validSamples: 0, unavailableSamples: 0 }, baseline, 5000).kind, "no-valid-memory-samples");
  assert.throws(() => originalStartupStop({ peak: { privateBytes: null }, unavailableSamples: 0 }, baseline, 100));
});
test("five-minute bound is a diagnostic stop, never full-file acceptance or a source-duration change", () => {
  assert.equal(VP9_ORIGINAL_STARTUP.windowMs, 300000); assert.equal(VP9_ORIGINAL_STARTUP.cancellationGraceMs, 30000);
  assert.deepEqual([VP9_ORIGINAL_STARTUP.width, VP9_ORIGINAL_STARTUP.height, VP9_ORIGINAL_STARTUP.frameRate], [1920, 804, 24]);
  assert.equal(VP9_ORIGINAL_STARTUP.bitRateBps, 6000000);
  assert.equal(originalStartupStop({ peak: { privateBytes: 400000000 }, validSamples: 1, unavailableSamples: 0 }, 300000000, 300000).kind,
    "bounded-startup-window-ended");
});
test("driver check-only verifies lineage and parses generated source without browser, recipe write or media output", async () => {
  const { stdout } = await promisify(execFile)(process.execPath, ["scripts/test-vp9-original-startup.mjs", "--check-only"],
    { cwd: root, windowsHide: true, timeout: 30000, maxBuffer: 65536 });
  const value = JSON.parse(stdout); assert.equal(value.reversible, true); assert.equal(value.browserLaunched, false); assert.equal(value.recipeWritten, false);
  assert.match(value.generatedSha256, /^[a-f0-9]{64}$/);
});
