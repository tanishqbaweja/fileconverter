import assert from "node:assert/strict";
import { access, readFile } from "node:fs/promises";
import path from "node:path";
import test from "node:test";
import { gunzipSync } from "node:zlib";
import { sha } from "../scripts/lib/stable-ui-headless-baseline-recipe.mjs";
import { inspectRecoveryDiagnostic } from "../scripts/lib/encoder-plane-recovery-browser-recipe.mjs";
const root = path.resolve(import.meta.dirname, ".."), read = file => readFile(path.join(root, file));
const proof = JSON.parse(await read("evidence/2026-10-11T07-51-01-110Z-encoder-plane-recovery-diagnostic.json"));
async function restore(record) {
  const compressed = await read(record.path); assert.equal(compressed.length, record.bytes); assert.equal(sha(compressed), record.sha256);
  const bytes = gunzipSync(compressed, { maxOutputLength: 8388608 });
  assert.equal(bytes.length, record.restoredBytes); assert.equal(sha(bytes), record.restoredSha256);
  return JSON.parse(bytes);
}
const report = await restore(proof.report.archive), source = await restore(proof.generatedArchive);
const buildBytes = await read(proof.build.path); assert.equal(sha(buildBytes), proof.build.sha256); const build = JSON.parse(buildBytes);
test("actual4Mbps adverse cleanup and two same-page replacement-worker recoveries pass all independent validators", () => {
  assert.equal(proof.failure, null); assert.deepEqual(inspectRecoveryDiagnostic(report, null, build), proof.analysis);
  assert.equal(proof.analysis.completedValidatedRecoveryConversions, 2);
  for (const result of proof.analysis.results) {
    assert.equal(result.samePageProductionReplacementWorkerRecovered, true);
    assert.equal(result.analysis.ordinalSsim, 0.983095); assert.equal(result.analysis.outputBytes, 2245558);
    assert.equal(result.analysis.caseStatus, "passed"); assert.equal(result.analysis.publicAcceptance, false);
  }
  const probes = report.rows.filter(row => row.kind === "independent-pre-assertion-probes");
  assert.equal(probes.length, 2); assert.equal(probes[0].outputSha256, probes[1].outputSha256);
  assert.equal(proof.originalFullSourceAcceptance, false); assert.equal(proof.completeChromiumMemoryAcceptance, false);
});
test("archived source preimages, protected-original and recorded cleanup evidence agree without current-release acceptance", async () => {
  assert.deepEqual(proof.sourcePins, proof.postSourcePins); assert.deepEqual(source.sourcePins, proof.sourcePins);
  for (const [file, expected] of Object.entries(proof.sourcePins)) assert.equal(sha(source.sources[file]), expected, file);
  assert.deepEqual(proof.protectedPre, proof.protectedPost); assert.equal(proof.protectedPost.sha256, "31f36695b5b44c62125a9e4264e84dc085accd21c02cc3487aae597f54b9db34");
  assert.equal(proof.cleanup.normalAppAndCssUnchanged, true); assert.equal(proof.cleanup.privateAdditionsAbsent, true);
  assert.equal(proof.cleanup.ownedWrapperAbsent, true); assert.deepEqual(proof.cleanup.newFixtureDirsRemaining, []);
  const helperBytes = await read(proof.cleanup.helpers.path); assert.equal(sha(helperBytes), proof.cleanup.helpers.sha256);
  for (const record of proof.cleanup.helpers.launchRecords) assert.equal(record.absence.status, "owned-identity-absent");
  const compact = JSON.parse(await read("evidence/2026-10-11T07-51-01-110Z-encoder-plane-recovery-report-compaction.json"));
  assert.equal(compact.proofSha256, sha(await read(compact.proofPath)));
  assert.equal(compact.rawPath, proof.report.path); assert.equal(compact.bytes, proof.report.bytes);
  assert.equal(compact.sha256, proof.report.sha256); assert.equal(compact.recoverableFrom, proof.report.archive.path);
  assert.equal(compact.removedAfterLosslessVerification, true);
  await assert.rejects(access(path.join(root, compact.rawPath)), { code: "ENOENT" });
});
test("retained old failed assumption stays failed and both adverse reports are recoverable without fabricated recovery", async () => {
  const collected = JSON.parse(await read("evidence/2026-10-11T07-46-32-435Z-encoder-plane-recovery-failed-worker-collection.json"));
  const originalBytes = await read(collected.proofPath); assert.equal(sha(originalBytes), collected.proofSha256);
  const failed = JSON.parse(originalBytes); assert.equal(failed.status, "failed-or-incomplete"); assert.equal(failed.analysis, null);
  const oldSource = await restore(failed.generatedArchive); assert.deepEqual(oldSource.sourcePins, failed.sourcePins);
  assert.deepEqual(failed.sourcePins, failed.postSourcePins);
  for (const [file, hash] of Object.entries(failed.sourcePins)) assert.equal(sha(oldSource.sources[file]), hash);
  assert.ok(oldSource.generated.spec.includes("expect(page.workers()[0]).toBe(originalWorker)"));
  assert.equal(collected.reports.length, 2);
  for (const row of collected.reports) {
    const zipped = await read(row.path); assert.equal(zipped.length, row.bytes); assert.equal(sha(zipped), row.sha256);
    const raw = gunzipSync(zipped, { maxOutputLength: 2097152 }); assert.equal(raw.length, row.originalBytes); assert.equal(sha(raw), row.originalSha256);
    assert.equal(JSON.parse(raw).rows.some(row => row.kind === "validated-same-page-recovery"), false);
    await assert.rejects(access(path.join(root, row.originalPath)), { code: "ENOENT" });
  }
});
test("fake retained worker, missing adverse output cleanup or changed quality cannot pass recovery inspection", () => {
  for (const change of [r => { r.rows.find(row => row.kind === "validated-same-page-recovery").sameWorkerObject = true; },
    r => { r.rows.find(row => row.kind === "cancel-after-direct-output").partialBytes = [123]; },
    r => { r.rows.find(row => row.kind === "bounded-ssim-summary-before-assertion" && row.ordinal).diagnostic.score = 0.97; }]) {
    const wrong = structuredClone(report); change(wrong); assert.throws(() => inspectRecoveryDiagnostic(wrong, null, build));
  }
});
