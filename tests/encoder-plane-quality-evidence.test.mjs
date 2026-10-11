import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import path from "node:path";
import test from "node:test";
import { gunzipSync } from "node:zlib";
import { sha } from "../scripts/lib/stable-ui-headless-baseline-recipe.mjs";
import { inspectQualityDiagnostic } from "../scripts/lib/encoder-plane-quality-browser-recipe.mjs";
const root = path.resolve(import.meta.dirname, ".."), read = file => readFile(path.join(root, file));
const proof = JSON.parse(await read("evidence/2026-10-11T07-11-32-834Z-encoder-plane-quality-diagnostic.json"));
const build = JSON.parse(await read(proof.build.path));
async function restore(record) {
  const compressed = await read(record.path); assert.equal(compressed.length, record.bytes); assert.equal(sha(compressed), record.sha256);
  const bytes = gunzipSync(compressed, { maxOutputLength: 8388608 });
  assert.equal(bytes.length, record.restoredBytes); assert.equal(sha(bytes), record.restoredSha256);
  return JSON.parse(bytes);
}
const report = await restore(proof.report.archive), executed = await restore(proof.generatedArchive);
test("actual browser quality failure has numeric pre-assertion diagnostics and does not grant acceptance", () => {
  assert.deepEqual(inspectQualityDiagnostic(report, null, build), proof.analysis);
  assert.equal(proof.analysis.ordinalSsim, 0.972072); assert.equal(proof.analysis.caseStatus, "failed");
  assert.equal(proof.publicAcceptance, false); assert.equal(proof.completeChromiumMemoryAcceptance, false);
  assert.equal(proof.originalFullSourceAcceptance, false);
  assert.ok(executed.generated.spec.includes('noise=alls=4:allf=t+u:all_seed=20261011'));
  assert.ok(executed.generated.spec.includes('expect(ordinalSsim).toBeGreaterThanOrEqual(0.98);'));
  assert.equal(executed.generated.stage.includes('mapped[9] = 4000000'), false, "Actual baseline used unchanged default controls");
});
test("retained source, current source and cleanup evidence agree", async () => {
  assert.deepEqual(proof.sourcePins, proof.postSourcePins); assert.deepEqual(executed.sourcePins, proof.sourcePins);
  for (const [file, expected] of Object.entries(proof.sourcePins)) {
    assert.equal(sha(await read(file)), expected, file); assert.equal(sha(executed.sources[file]), expected, file);
  }
  assert.deepEqual(proof.protectedPre, proof.protectedPost);
  assert.equal(proof.cleanup.ownedWrapperAbsent, true); assert.deepEqual(proof.cleanup.newFixtureDirsRemaining, []);
  assert.equal(proof.cleanup.normalAppAndCssUnchanged, true); assert.equal(proof.cleanup.privateAdditionsAbsent, true);
  for (const row of proof.cleanup.helpers.launchRecords) assert.equal(row.absence.status, "owned-identity-absent");
});
test("missing score, substituted geometry or relabelled passing case is rejected", () => {
  for (const mutate of [value => { value.rows.find(row => row.kind === "bounded-ssim-summary-before-assertion").diagnostic.status = "missing-summary"; },
    value => { value.rows.find(row => row.kind === "independent-pre-assertion-probes").outputProbe.streams[0].width = 640; },
    value => { value.rows.find(row => !row.kind && row.container && row.status === "failed").status = "passed"; }]) {
    const wrong = structuredClone(report); mutate(wrong); assert.throws(() => inspectQualityDiagnostic(wrong, null, build));
  }
});
