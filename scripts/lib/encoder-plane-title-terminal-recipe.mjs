// Separate post-terminal audit. Never edit the active driver's measured source set.
import assert from "node:assert/strict";
import path from "node:path";
import { pathToFileURL } from "node:url";
import { sha } from "./stable-ui-headless-baseline-recipe.mjs";
import { makeStagedFullTerminalAnalyzer } from "./encoder-plane-staged-terminal-recipe.mjs";
import { makeStagedFullFailureAnalyzer } from "./encoder-plane-staged-failure-recipe.mjs";

export const titleTerminalAnalysisFiles = ["scripts/analyze-encoder-plane-title-full-terminal.mjs",
  "scripts/lib/encoder-plane-title-terminal-recipe.mjs", "scripts/lib/encoder-plane-title-terminal-facts.mjs",
  "tests/mpeg2-encoder-plane-title-terminal.test.mjs", "scripts/lib/encoder-plane-staged-failure-recipe.mjs"];
export function makeTitleFullTerminalAnalyzer(source, root, failureOnly = false) {
  assert.equal(typeof failureOnly, "boolean");
  const old = failureOnly ? makeStagedFullFailureAnalyzer(source, root) : makeStagedFullTerminalAnalyzer(source, root);
  const uri = file => JSON.stringify(pathToFileURL(path.join(root, "scripts", file)).href);
  const edits = [
    [`import { makeEncoderPlaneStagedFullDriver as makeEncoderPlaneFullDriver, makeEncoderPlaneStagedFullCaller as makeEncoderPlaneFullCaller } from ${uri("lib/encoder-plane-staged-full-recipe.mjs")};`,
      `import { makeEncoderPlaneTitleFullDriver as makeEncoderPlaneFullDriver, makeEncoderPlaneTitleFullCaller as makeEncoderPlaneFullCaller } from ${uri("lib/encoder-plane-title-full-recipe.mjs")};`],
    [`import { encoderPlaneTerminalFacts } from ${uri("lib/encoder-plane-terminal-facts.mjs")};`,
      `import { encoderPlaneTitleTerminalFacts as encoderPlaneTerminalFacts, boundedTitleFullCleanupDiagnostics } from ${uri("lib/encoder-plane-title-terminal-facts.mjs")};`],
    ['-encoder-plane-staged-original-full-terminal\\.json$/', '-encoder-plane-title-original-full-terminal\\.json$/'],
    ['for (const file of ["scripts/analyze-encoder-plane-staged-full-terminal.mjs",',
      'for (const file of [' + titleTerminalAnalysisFiles.map(file => JSON.stringify(file) + ',').join('') + '"scripts/analyze-encoder-plane-staged-full-terminal.mjs",'],
    ['const result = {', 'const result = { titleSpecificAudit: true, cleanupDiagnostics: boundedTitleFullCleanupDiagnostics(raw.cleanup.errors ?? []),'],
  ];
  if (failureOnly) edits.push([
    'assert.equal(process.argv.length, 3); const receiptPath = process.argv[2];',
    'assert.equal(process.argv.length, 4); assert.equal(process.argv[3], "--diagnose-failure"); const receiptPath = process.argv[2];',
  ]);
  let generated = old.generated;
  for (const [before, after] of edits) {
    assert.equal(generated.split(before).length - 1, 1, before);
    generated = generated.replace(before, after);
  }
  let reversed = generated;
  for (const [before, after] of edits.toReversed()) reversed = reversed.replace(after, before);
  assert.equal(reversed, old.generated, "All original source/archive/memory/fidelity/ownership/cleanup gates remain");
  return { generated, generatedSha256: sha(generated), edits, failureOnly,
    publicAcceptance: false, additionalCleanSessionRequired: true };
}
