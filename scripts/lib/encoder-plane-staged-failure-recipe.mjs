// Failure-only audit. Never amend the historical receipt or acceptance analyzer.
import assert from "node:assert/strict";
import { makeStagedFullTerminalAnalyzer } from "./encoder-plane-staged-terminal-recipe.mjs";
export function makeStagedFullFailureAnalyzer(source, root) {
  const staged = makeStagedFullTerminalAnalyzer(source, root);
  const edits = [
    ['assert.equal(receipt.status, "actual-full-attempt-terminal-independent-analysis-pending");',
      'assert.equal(receipt.status, "failed-or-incomplete");'],
    ['assert.equal(receipt.failure, null); assert.equal(receipt.executions, 1);',
      'assert.ok(typeof receipt.failure === "string" && receipt.failure.length > 0); assert.equal(receipt.executions, 1);'],
    ['assert.ok(!raw.cleanup.errors?.length);',
      'assert.equal(raw.status, "failed"); assert.equal(facts.fullOriginalSessionGatePassed, false);\nassert.equal(facts.publicAcceptance, false); assert.ok(raw.failure);\nconst cleanupErrors = raw.cleanup.errors ?? []; assert.ok(Array.isArray(cleanupErrors));'],
    ['const result = { recordedAt: new Date().toISOString(), receipt:',
      'const result = { diagnosticAuditOnly: true, cleanupGatePassed: cleanupErrors.length === 0,\n  originalCleanupErrors: cleanupErrors, cleanupErrorCausesProven: false,\n  firstCandidateFailure: raw.failure, outerCollectorFailure: receipt.failure,\n  savedButNotIndependentlyValidated: raw.runs.filter(run => run.state?.jobState === "complete" && !run.independentValidation).map(run => ({ number: run.number, outputBytes: run.state.metrics.outputBytes, elapsedMs: run.state.metrics.elapsedMs })),\n  recordedAt: new Date().toISOString(), receipt:'],
    ['const output = receiptPath.replace(/\\.json$/, "-analysis.json");',
      'const output = receiptPath.replace(/\\.json$/, "-failure-analysis.json");'],
  ];
  let generated = staged.generated;
  for (const [before, after] of edits) {
    assert.equal(generated.split(before).length - 1, 1, before);
    generated = generated.replace(before, after);
  }
  let reversed = generated;
  for (const [before, after] of edits.toReversed()) reversed = reversed.replace(after, before);
  assert.equal(reversed, staged.generated, "All other evidence, source, memory, ownership and restoration checks are unchanged");
  return { generated, edits, diagnosticAuditOnly: true, publicAcceptance: false };
}
