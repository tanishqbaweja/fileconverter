// Extend the immutable title audit with actual clock driver/caller identities.
import assert from "node:assert/strict";
import path from "node:path";
import { pathToFileURL } from "node:url";
import { sha } from "./stable-ui-headless-baseline-recipe.mjs";
import { makeTitleFullTerminalAnalyzer } from "./encoder-plane-title-terminal-recipe.mjs";
import { makeEncoderPlaneClockFullDriver } from "./encoder-plane-clock-full-recipe.mjs";
export const clockTerminalAnalysisFiles = ["scripts/analyze-encoder-plane-clock-full-terminal.mjs",
  "scripts/lib/encoder-plane-clock-terminal-recipe.mjs", "scripts/lib/encoder-plane-clock-terminal-facts.mjs",
  "tests/mpeg2-encoder-plane-clock-terminal.test.mjs"];
function exact(source, edits) {
  let generated = source;
  for (const [before, after] of edits) { assert.equal(generated.split(before).length - 1, 1, before); generated = generated.replace(before, after); }
  let reverse = generated; for (const [before, after] of edits.toReversed()) reverse = reverse.replace(after, before);
  assert.equal(reverse, source, "All original archive/source/whole-tree/quality/cleanup gates unchanged");
  return { generated, generatedSha256: sha(generated), edits };
}
export function makeClockFullTerminalAnalyzer(source, root) {
  const old = makeTitleFullTerminalAnalyzer(source, root);
  const uri = file => JSON.stringify(pathToFileURL(path.join(root, "scripts", file)).href);
  const edits = [
    [`import { makeEncoderPlaneTitleFullDriver as makeEncoderPlaneFullDriver, makeEncoderPlaneTitleFullCaller as makeEncoderPlaneFullCaller } from ${uri("lib/encoder-plane-title-full-recipe.mjs")};`,
      `import { makeEncoderPlaneClockFullDriver as makeEncoderPlaneFullDriver, makeEncoderPlaneClockFullCaller as makeEncoderPlaneFullCaller } from ${uri("lib/encoder-plane-clock-full-recipe.mjs")};`],
    [`import { encoderPlaneTitleTerminalFacts as encoderPlaneTerminalFacts, boundedTitleFullCleanupDiagnostics } from ${uri("lib/encoder-plane-title-terminal-facts.mjs")};`,
      `import { boundedTitleFullCleanupDiagnostics } from ${uri("lib/encoder-plane-title-terminal-facts.mjs")};\nimport { encoderPlaneClockTerminalFacts as encoderPlaneTerminalFacts } from ${uri("lib/encoder-plane-clock-terminal-facts.mjs")};`],
    ['-encoder-plane-title-original-full-terminal\\.json$/', '-encoder-plane-clock-original-full-terminal\\.json$/'],
    ['const result = { titleSpecificAudit: true,', 'const result = { clockSpecificAudit: true, titleSpecificAudit: true,'],
    ['for (const file of ["scripts/analyze-encoder-plane-title-full-terminal.mjs",',
      'for (const file of [' + clockTerminalAnalysisFiles.map(file => JSON.stringify(file) + ',').join('') + '"scripts/analyze-encoder-plane-title-full-terminal.mjs",'],
  ];
  return { ...exact(old.generated, edits), originalTitleAnalyzerSha256: sha(old.generated), publicAcceptance: false };
}

// Prospective diagnostics-only derivative, NOT a launch or bitrate change.
export function makeSsimCapturingClockFullDriver(previous, root, runtime, branch) {
  const old = makeEncoderPlaneClockFullDriver(previous, root, runtime, branch);
  const parser = JSON.stringify(pathToFileURL(path.join(root, "scripts/lib/bounded-ssim-summary.mjs")).href);
  const additions = ["scripts/lib/encoder-plane-clock-terminal-recipe.mjs", "scripts/lib/bounded-ssim-summary.mjs", "tests/mpeg2-encoder-plane-clock-terminal.test.mjs"];
  const edits = [
    ['import assert from "node:assert/strict";', `import { inspectSsimSummary, requireNumericSsim } from ${parser};\nimport assert from "node:assert/strict";`],
    ['const sourceFiles = [', 'const sourceFiles = [' + additions.map(file => JSON.stringify(file) + ',').join('')],
    ['const ssim = Number(/All:([0-9.]+)/.exec(stderr)?.[1]); assert.ok(ssim >= 0.98);',
      'run.independentSsimDiagnostic = inspectSsimSummary(stderr);\n    const ssim = requireNumericSsim(run.independentSsimDiagnostic); assert.ok(ssim >= 0.98);'],
  ];
  return { ...old, ...exact(old.generated, edits), previousClockDriverSha256: sha(old.generated),
    qualityDiagnosticsOnly: true, fullOriginalAcceptance: false, publicAcceptance: false };
}
