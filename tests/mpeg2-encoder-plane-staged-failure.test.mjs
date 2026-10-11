import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { createHash } from "node:crypto";
import { gunzipSync } from "node:zlib";
import path from "node:path";
import test from "node:test";
import { makeStagedFullTerminalAnalyzer } from "../scripts/lib/encoder-plane-staged-terminal-recipe.mjs";
import { makeStagedFullFailureAnalyzer } from "../scripts/lib/encoder-plane-staged-failure-recipe.mjs";
const root = path.resolve(import.meta.dirname, "..");
const source = readFileSync(path.join(root, "scripts/analyze-encoder-plane-full-terminal.mjs"), "utf8");
test("failure diagnosis reverses exactly to the unchanged terminal audit", () => {
  const failure = makeStagedFullFailureAnalyzer(source, root);
  let reversed = failure.generated;
  for (const [before, after] of failure.edits.toReversed()) reversed = reversed.replace(after, before);
  assert.equal(reversed, makeStagedFullTerminalAnalyzer(source, root).generated);
  assert.equal(failure.publicAcceptance, false);
});
test("failure diagnosis retains acceptance denial and separate cleanup evidence", () => {
  const { generated } = makeStagedFullFailureAnalyzer(source, root);
  assert.ok(generated.includes('assert.equal(raw.status, "failed")'));
  assert.ok(generated.includes('assert.equal(facts.fullOriginalSessionGatePassed, false)'));
  assert.ok(generated.includes('originalCleanupErrors: cleanupErrors'));
  assert.ok(generated.includes('cleanupErrorCausesProven: false'));
  assert.ok(generated.includes('"-failure-analysis.json"'));
  for (const gate of ['encoderPlaneTerminalFacts(raw)', 'exactExecutedCallerAndDriverReconstructed: true',
    'Actual owned birth identity is still alive', 'hash.digest("hex"), raw.source.sha256',
    'maxOutputLength: limit', 'receipt.sourcePins, receipt.postSourcePins']) assert.ok(generated.includes(gate), gate);
});
test("failure diagnosis refuses a changed historical analyzer", () => {
  assert.throws(() => makeStagedFullFailureAnalyzer(source + "\n", root), /historical acceptance audit/);
});
test("actual saved output with title and cleanup failures cannot become acceptance", () => {
  const file = "evidence/2026-10-10T18-57-09-340Z-encoder-plane-staged-original-full-terminal.json";
  const bytes = readFileSync(path.join(root, file));
  const receipt = JSON.parse(bytes);
  const audit = JSON.parse(readFileSync(path.join(root, file.replace(/\.json$/, "-failure-analysis.json"))));
  assert.equal(audit.receipt.sha256, createHash("sha256").update(bytes).digest("hex"));
  const archive = receipt.candidate.compressedReport;
  const compressed = readFileSync(path.join(root, archive.path));
  assert.equal(compressed.length, archive.bytes);
  assert.equal(createHash("sha256").update(compressed).digest("hex"), archive.sha256);
  const restored = gunzipSync(compressed, { maxOutputLength: 33554432 });
  assert.equal(restored.length, archive.restoredBytes);
  assert.equal(createHash("sha256").update(restored).digest("hex"), archive.restoredSha256);
  const raw = JSON.parse(restored);
  assert.equal(receipt.status, "failed-or-incomplete"); assert.equal(raw.status, "failed");
  assert.equal(raw.runs[0].state.jobState, "complete");
  assert.equal(raw.runs[0].state.metrics.outputBytes, 3337164038);
  assert.equal(raw.runs[0].independentValidation, null);
  assert.match(raw.failure.message, /Preserve primary video title/);
  assert.deepEqual(audit.firstCandidateFailure, raw.failure);
  assert.deepEqual(audit.originalCleanupErrors, raw.cleanup.errors);
  assert.equal(audit.cleanupGatePassed, false);
  assert.equal(audit.cleanupErrorCausesProven, false);
  assert.equal(audit.native.observedIncrementalPrivateMiB, 230.03125);
  assert.equal(audit.completedConversions, 0);
  for (const gate of ["fullOriginalSessionGatePassed", "publicAcceptance", "scalingAcceptance",
    "conversionSpeedAcceptance", "goalComplete"]) assert.equal(audit[gate], false, gate);
});
