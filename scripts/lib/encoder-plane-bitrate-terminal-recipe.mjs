// Preserve every strict clock audit gate; substitute only qualified bitrate identities/facts.
import assert from "node:assert/strict";
import path from "node:path";
import { pathToFileURL } from "node:url";
import { sha } from "./stable-ui-headless-baseline-recipe.mjs";
import { makeClockFullTerminalAnalyzer } from "./encoder-plane-clock-terminal-recipe.mjs";
export const bitrateTerminalAnalysisFiles = ["scripts/analyze-encoder-plane-bitrate-full-terminal.mjs",
  "scripts/lib/encoder-plane-bitrate-terminal-recipe.mjs", "scripts/lib/encoder-plane-bitrate-terminal-facts.mjs",
  "tests/mpeg2-encoder-plane-bitrate-terminal.test.mjs"];
export function makeBitrateFullTerminalAnalyzer(source, root) {
  const old = makeClockFullTerminalAnalyzer(source, root);
  const uri = file => JSON.stringify(pathToFileURL(path.join(root, "scripts", file)).href);
  const edits = [
    [`import { makeEncoderPlaneClockFullDriver as makeEncoderPlaneFullDriver, makeEncoderPlaneClockFullCaller as makeEncoderPlaneFullCaller } from ${uri("lib/encoder-plane-clock-full-recipe.mjs")};`,
      `import { makeEncoderPlaneBitrateFullDriver as deriveBitrateDriver, makeEncoderPlaneBitrateFullCaller as makeEncoderPlaneFullCaller } from ${uri("lib/encoder-plane-bitrate-full-recipe.mjs")};
const qualifiedAdapter = { adapterBytes: 20047, adapterSha256: "81ea465cb26a839fed9ae4b25223e42a19d0486023cd443ff34126ed3a3eb2a7" };
const makeEncoderPlaneFullDriver = (previous, root, runtime, branch) => deriveBitrateDriver(previous, root, runtime, branch, qualifiedAdapter);`],
    [`import { encoderPlaneClockTerminalFacts as encoderPlaneTerminalFacts } from ${uri("lib/encoder-plane-clock-terminal-facts.mjs")};`,
      `import { encoderPlaneBitrateTerminalFacts as encoderPlaneTerminalFacts } from ${uri("lib/encoder-plane-bitrate-terminal-facts.mjs")};`],
    ['-encoder-plane-clock-original-full-terminal\\.json$/', '-encoder-plane-bitrate-original-full-terminal\\.json$/'],
    ['Array(3).fill({ bytes: 18330, sha256: "020b3bdc7d3902367358094a8db2d1fa990691443bdc4ec465c5b0ae34792837" })',
      'Array(3).fill({ bytes: qualifiedAdapter.adapterBytes, sha256: qualifiedAdapter.adapterSha256 })'],
    ['const result = { clockSpecificAudit: true,', 'const result = { bitrateSpecificAudit: true, clockSpecificAudit: true,'],
    ['for (const file of ["scripts/analyze-encoder-plane-clock-full-terminal.mjs",',
      'for (const file of [' + bitrateTerminalAnalysisFiles.map(file => JSON.stringify(file) + ',').join('') + '"scripts/analyze-encoder-plane-clock-full-terminal.mjs",'],
  ];
  let generated = old.generated;
  for (const [before, after] of edits) { assert.equal(generated.split(before).length - 1, 1, before); generated = generated.replace(before, after); }
  let reverse = generated; for (const [before, after] of edits.toReversed()) reverse = reverse.replace(after, before);
  assert.equal(reverse, old.generated, "All old whole-tree/source/quality/cleanup/clock acceptance gates unchanged");
  return { generated, generatedSha256: sha(generated), edits, previousClockAnalyzerSha256: sha(old.generated), publicAcceptance: false };
}
