// Preserve the failed analysis preimage before correcting a cutoff assertion.
import assert from "node:assert/strict";
import { readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import { gunzipSync } from "node:zlib";
import { sha } from "./lib/stable-ui-headless-baseline-recipe.mjs";
assert.equal(process.argv.length, 2);
const root = path.resolve(import.meta.dirname, ".."), read = file => readFile(path.join(root, file));
const target = "scripts/analyze-mvf-arena-full-terminal.mjs", before = (await read(target)).toString();
const terminal = JSON.parse(await read("evidence/2026-10-14T22-43-44-516Z-mvf-arena-original-full-terminal.json"));
const record = terminal.candidate.compressedReport, zip = await read(record.path); assert.equal(sha(zip), record.sha256);
const raw = gunzipSync(zip, { maxOutputLength: 33554432 }); assert.equal(sha(raw), record.restoredSha256); const report = JSON.parse(raw);
const oldAssertion = "assert.equal(report.runs[0].nativePeaks.validSamples, 11840)";
const newAssertion = "assert.equal(report.runs[0].nativePeaks.validSamples, 11839)";
assert.equal(before.split(oldAssertion).length, 2); const after = before.replace(oldAssertion, newAssertion);
assert.equal(after.replace(newAssertion, oldAssertion), before);
assert.equal(report.runs[0].nativePeaks.validSamples, 11839); assert.equal(report.nativeFailureCapture.evaluatedConversionSamples, 11840);
const phase = report.nativeMemory.phases.find(row => row.phase === "conversion-1"); assert.equal(phase.validSamples, 11832);
const output = "evidence/mvf-terminal-sample-cutoff-correction-2026-10-15.json";
await writeFile(path.join(root, output), JSON.stringify({ recordedAt: new Date().toISOString(), target,
  priorFailedAssertion: oldAssertion, correctedAssertion: newAssertion, sourceBeforeSha256: sha(before), sourceBeforePreimage: Buffer.from(before).toString("base64"),
  proposedAfterSha256: sha(after), exactOneAssertionReversal: true,
  measuredCutoffs: { activePhaseSamples: phase.validSamples, runNativeSnapshotSamples: report.runs[0].nativePeaks.validSamples, budgetCaptureEvaluations: report.nativeFailureCapture.evaluatedConversionSamples },
  converterOrRawEvidenceChanged: false, browserConversions: 0, noConverterRetry: true, sourceFileWritten: false, publicAcceptance: false }, null, 2) + "\n", { flag: "wx" });
console.log(JSON.stringify({ output, proposedAfterSha256: sha(after) }));
