import assert from "node:assert/strict";
import { test } from "node:test";
import { readFile } from "node:fs/promises";
import { gunzipSync } from "node:zlib";
import { createHash } from "node:crypto";
import { execFile } from "node:child_process";
import { promisify } from "node:util";
import { makeVp9TemporalQualificationSource, VP9_TEMPORAL_EXPECTED_OUTPUT_SHA256 } from "../scripts/lib/vp9-temporal-qualification-recipe.mjs";
const root = new URL("../", import.meta.url), parent = JSON.parse(await readFile(new URL("evidence/2026-11-05-webcodecs-vp9-recovery-qualification-42020605269-recipe.json", root)));
const source = gunzipSync(Buffer.from(parent.generatedSourceGzipBase64, "base64")).toString();
test("guarded qualification is an exact reversible retarget of prior six-job strict control", () => {
  const result = makeVp9TemporalQualificationSource(source, "12345678"); let reversed = result.generated;
  for (const [before, after] of result.edits.toReversed()) reversed = reversed.replace(after, before);
  assert.equal(reversed, source); assert.equal(createHash("sha256").update(source).digest("hex"), result.parentSha256);
  assert.ok(result.generated.includes('loadVp9DurationCpuAssets(root, "12345678", "original-width")'));
  assert.ok(result.generated.includes('evidence/2026-11-06-vp9-temporal-qualification-12345678.json'));
  assert.ok(result.generated.includes('qualifyVp9Recovery({ page, observer'));
  assert.ok(result.generated.includes(VP9_TEMPORAL_EXPECTED_OUTPUT_SHA256));
  assert.doesNotMatch(result.generated, /vp9-duration-input-42020605269|vp9-duration-native-42020605269/);
  assert.equal(result.changesBaselineFormulaOrLimit, false); assert.equal(result.publicAcceptance, false);
  assert.equal(result.speedGainProven, false);
});
test("unknown source or old unguarded tools are rejected, not silently reused", () => {
  assert.throws(() => makeVp9TemporalQualificationSource(source + " ", "12345678"));
  for (const id of ["42020605269", "42122918540", "../escape"]) assert.throws(() => makeVp9TemporalQualificationSource(source, id));
});
test("check-only parses authenticated full ancestry without launching browser or writing artifacts", async () => {
  const { stdout } = await promisify(execFile)(process.execPath, ["scripts/test-vp9-temporal-qualification.mjs", "--check-only"],
    { windowsHide: true, timeout: 30000, maxBuffer: 65536 });
  const result = JSON.parse(stdout); assert.equal(result.reversible, true); assert.equal(result.browserLaunched, false); assert.equal(result.recipeWritten, false);
});
