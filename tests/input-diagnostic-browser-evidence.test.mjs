import assert from "node:assert/strict";
import { access, readFile } from "node:fs/promises";
import path from "node:path";
import test from "node:test";
import { gunzipSync } from "node:zlib";
import { sha } from "../scripts/lib/stable-ui-headless-baseline-recipe.mjs";
import { inspectInputReadMediaReport } from "../scripts/lib/input-read-media-recipe.mjs";
import { inspectInputScanReport } from "../scripts/lib/input-scan-browser-recipe.mjs";
const root = path.resolve(import.meta.dirname, ".."), read = file => readFile(path.join(root, file));
const json = async file => JSON.parse(await read(file));
async function restore(row) {
  const zipped = await read(row.path); assert.equal(zipped.length, row.bytes); assert.equal(sha(zipped), row.sha256);
  const raw = gunzipSync(zipped, { maxOutputLength: 8388608 }); assert.equal(raw.length, row.restoredBytes); assert.equal(sha(raw), row.restoredSha256);
  return raw;
}
test("actual read-failure qualification joins162 executed/current sources and four unchanged independently validated goldens", async () => {
  const receipt = await json("evidence/2026-10-12T19-28-30-102Z-input-read-media.json"); assert.equal(receipt.failure, null);
  const sources = JSON.parse(await restore(receipt.generatedArchive)); assert.equal(Object.keys(receipt.sourcePins).length, 162);
  assert.deepEqual(receipt.sourcePins, receipt.postSourcePins); assert.deepEqual(receipt.sourcePins, sources.sourcePins);
  for (const [file, hash] of Object.entries(receipt.sourcePins)) { assert.equal(sha(sources.sources[file]), hash, file); assert.equal(sha(await read(file)), hash, file); }
  const baselineBytes = await read(receipt.baseline.path); assert.equal(sha(baselineBytes), receipt.baseline.sha256);
  const buildBytes = await read(receipt.build.path); assert.equal(sha(buildBytes), receipt.build.sha256);
  const report = JSON.parse(await restore(receipt.report.archive)), baseline = JSON.parse(baselineBytes).reports[0].report, build = JSON.parse(buildBytes);
  const result = inspectInputReadMediaReport(report, baseline, build); assert.deepEqual(result, receipt.analysis);
  assert.equal(result.genuineValidatedConversions, 4); assert.equal(result.validatedInputFailureRecovery.ordinalSsim, 0.983095);
  assert.equal(result.validatedInputFailureRecovery.outputBytes, 2245558);
  assert.equal(result.inputReadFailures.length, 2); assert.equal(result.inputReadFailures[0].offset, 1048576);
  assert.equal(result.fullOriginalAcceptance, false); assert.equal(result.speedImprovementProven, false);
  const bad = structuredClone(report); bad.rows.find(row => row.kind === "input-read-diagnostics" && row.samples.length).samples[1].offset++;
  assert.throws(() => inspectInputReadMediaReport(bad, baseline, build), /second call/);
});
test("actual whole-original input-only scan joins167 sources and cannot be relabelled genuine conversion", async () => {
  const receipt = await json("evidence/2026-10-12T19-34-03-916Z-input-only-original-scan.json"); assert.equal(receipt.failure, null);
  const sources = JSON.parse(await restore(receipt.generatedArchive)); assert.equal(Object.keys(receipt.sourcePins).length, 167);
  for (const [file, hash] of Object.entries(receipt.sourcePins)) { assert.equal(sha(sources.sources[file]), hash, file); assert.equal(sha(await read(file)), hash, file); }
  const report = JSON.parse(await restore(receipt.report.archive)), result = inspectInputScanReport(report); assert.deepEqual(result, receipt.analysis);
  assert.equal(result.scan.sequentialBytes, 2958573265); assert.equal(result.scan.sequentialReads, 45145);
  assert.equal(result.scan.elapsedMs, 8016.134999997914); assert.equal(result.scan.bufferBytes, 65536);
  assert.equal(result.scan.encodedFrames, 0); assert.equal(result.originalLongLivedFailureCauseProven, false);
  const bad = structuredClone(report); bad.rows.find(row => row.kind === "whole-original-production-input-scan").notConversion = false;
  assert.throws(() => inspectInputScanReport(bad));
});
test("failed controls remain failed, compact archives retain original preimages, verified redundant raw cleanup is recoverable", async () => {
  const proof = await json("evidence/2026-10-13-input-read-diagnostics-verified.json"); assert.equal(proof.results.length, 4);
  assert.deepEqual(proof.results.map(row => row.passed), [false, true, false, true]); assert.equal(proof.removedRedundantRawJsonBytes, 2002147);
  assert.equal(proof.originalLongLivedFailureCauseProven, false);
  for (const result of proof.results) {
    assert.equal(sha(await read(result.receipt.path)), result.receipt.sha256);
    const receipt = await json(result.receipt.path), sources = JSON.parse(await restore(result.sourceArchive));
    for (const [file, hash] of Object.entries(receipt.sourcePins)) assert.equal(sha(sources.sources[file]), hash, file);
    await restore(result.rawReportArchive);
    await assert.rejects(access(path.join(root, receipt.report.path)), { code: "ENOENT" });
    assert.deepEqual(receipt.protectedPre, receipt.protectedPost); assert.equal(result.protectedWholePrePostHashVerified, true);
    assert.equal(result.stockAssetsRestored, true); assert.equal(result.ownedScratchAbsent, true);
    if (result.passed) {
      assert.deepEqual(result.currentSourceDifferences, []); assert.equal(result.nativeAbsenceChecks.length, 2);
      for (const record of result.nativeAbsenceChecks) { assert.equal(record.status, "owned-identity-absent"); assert.equal(record.noProcessesKilled, true); }
    }
  }
  const own = await read(proof.ownSource.path); assert.equal(sha(own), proof.ownSource.sha256); assert.deepEqual(Buffer.from(proof.ownSource.preimage, "base64"), own);
});
