import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";
import { gunzipSync } from "node:zlib";
import { sha } from "../scripts/lib/stable-ui-headless-baseline-recipe.mjs";
import { compareRealProgressDiagnostics } from "../scripts/lib/real-progress-comparison.mjs";
import { summarizeJsAllocation } from "../scripts/lib/bounded-js-allocation.mjs";
const read = file => readFile(new URL(`../${file}`, import.meta.url));
const proof = JSON.parse(await read("evidence/2026-10-08T22-04-15-944Z-stable-ui-real-progress-analysis.json"));
test("Actual full-input diagnostic pair preserves failed full-conversion gates and independently reconstructable profiles", async () => {
  const bytes = await read(proof.executionReceipt.path); assert.equal(sha(bytes), proof.executionReceipt.sha256);
  const e = JSON.parse(bytes); assert.equal(e.executions.length, 2); assert.equal(e.productionRestored, true);
  assert.equal(sha(await read(proof.verifier.path)), proof.verifier.sha256);
  assert.equal(sha(await read(proof.comparisonHelper.path)), proof.comparisonHelper.sha256);
  for (const [file, hash] of Object.entries(e.sourcePins)) assert.equal(sha(await read(file)), hash, file);
  const reports = [];
  for (const run of e.executions) {
    const gzip = await read(run.compressedReport.path); assert.equal(sha(gzip), run.compressedReport.sha256);
    const raw = gunzipSync(gzip); assert.equal(sha(raw), run.rawReport.sha256); assert.equal(raw.length, run.rawReport.bytes);
    const report = JSON.parse(raw); reports.push(report);
    assert.equal(run.actualExitCode, 1); assert.equal(report.status, "failed"); assert.equal(run.rawRemovedAfterLosslessArchive, true);
    assert.match(report.failure.message, /cancelled[\s\S]*complete/);
    assert.equal(report.source.bytes, 2958573265); assert.equal(report.source.sha256, "31f36695b5b44c62125a9e4264e84dc085accd21c02cc3487aae597f54b9db34");
    for (const [file, hash] of Object.entries(report.sourceHashes)) assert.equal(e.sourcePins[file], hash, file);
    assert.equal(report.runs[0].independentValidation, null); assert.equal(report.runs[0].state.jobState, "cancelled");
    assert.equal(report.limitMiB, 250); assert.equal(report.requestedRuns, 3);
    assert.equal(report.startupSettlement.minimumMs, 300000); assert.ok(report.startupSettlement.actualMs >= 300000);
    assert.ok(report.blankBaseline.privateBytes <= report.startupSettlement.earlyWindow.privateBytes);
    const generatedGzip = await read(run.sourceArchive.path); assert.equal(sha(generatedGzip), run.sourceArchive.sha256);
    const generated = JSON.parse(gunzipSync(generatedGzip)); assert.equal(sha(generated.generated), run.sourceArchive.driverSha256);
    assert.ok(generated.generated.includes('"--headless=new"')); assert.ok(generated.generated.includes('timeDomain: "threadTicks"'));
    for (const record of report.conversionJsReport.records) {
      const filename = record.archive.path.replaceAll("\\", "/").split("/").at(-1);
      const compressed = await read(`outputs/reports/${filename}`); assert.equal(sha(compressed), record.archive.sha256);
      const profileBytes = gunzipSync(compressed); assert.equal(sha(profileBytes), record.archive.restoredSha256);
      const value = JSON.parse(profileBytes); assert.deepEqual(summarizeJsAllocation({ profile: value.profile }), value.summary);
      assert.deepEqual(value.state, record.state);
    }
    assert.deepEqual(report.forbiddenRequests, []); assert.deepEqual(report.conversionJsReport.errors, []);
    assert.equal(report.conversionJsReport.maximumSamplingMs, 90000); assert.equal(report.conversionJsReport.stopped, true);
    const m = report.runs[0].state.metrics; assert.equal(m.peakWasmMemoryBytes, 50331648); assert.equal(m.peakPendingOperations, 1);
    assert.equal(m.pendingOperations, 0); assert.equal(m.queuedBytes, 0); assert.ok(m.maxReadChunkBytes <= 65536 && m.maxWriteChunkBytes <= 65536);
  }
  assert.deepEqual(compareRealProgressDiagnostics(reports[0], reports[1]), proof.comparison);
  assert.equal(proof.nativeFacts[0].observedIncrementalPrivateMiB, 233.63671875);
  assert.equal(proof.nativeFacts[1].observedIncrementalPrivateMiB, 234.13671875);
  assert.ok(proof.nativeFacts.every(row => row.latePhasePeaksIncluded && !row.primaryMemoryAcceptance));
  for (const field of ["nativeAllocationCauseProven", "repeatabilityAccepted", "conversionSpeedAcceptance", "completeChromiumMemoryAcceptance", "originalFullSourceAcceptance", "publicAcceptance"]) assert.equal(proof[field], false);
  assert.equal(proof.conversionsCompleted, 0); assert.equal(proof.protectedFullPostHashVerified, true);
});
