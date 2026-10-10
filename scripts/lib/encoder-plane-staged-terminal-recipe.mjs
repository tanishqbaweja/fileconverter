// Identity-only derivative of the actually executed independent terminal audit.
import assert from "node:assert/strict";
import path from "node:path";
import { pathToFileURL } from "node:url";
import { sha } from "./stable-ui-headless-baseline-recipe.mjs";
export const ORIGINAL_TERMINAL_ANALYZER_SHA = "bdf5bd41016c5d6820141b5d3634cac3fc2520369742943e77cf49be0b3184f0";
export const stagedTerminalAnalysisFiles = ["scripts/analyze-encoder-plane-staged-full-terminal.mjs",
  "scripts/lib/encoder-plane-staged-terminal-recipe.mjs", "tests/mpeg2-encoder-plane-staged-terminal.test.mjs"];
export function makeStagedFullTerminalAnalyzer(source, root) {
  assert.equal(sha(source), ORIGINAL_TERMINAL_ANALYZER_SHA, "Never silently change the historical acceptance audit");
  const edits = [
    ['import { makeEncoderPlaneFullDriver, makeEncoderPlaneFullCaller } from "./lib/encoder-plane-full-recipe.mjs";',
      'import { makeEncoderPlaneStagedFullDriver as makeEncoderPlaneFullDriver, makeEncoderPlaneStagedFullCaller as makeEncoderPlaneFullCaller } from "./lib/encoder-plane-staged-full-recipe.mjs";'],
    ['path.resolve(import.meta.dirname, "..")', JSON.stringify(root)],
    ['-encoder-plane-original-full-terminal\\.json$/', '-encoder-plane-staged-original-full-terminal\\.json$/'],
    ['for (const file of ["scripts/analyze-encoder-plane-full-terminal.mjs",',
      'for (const file of [' + stagedTerminalAnalysisFiles.map(file => JSON.stringify(file) + ',').join('') + '"scripts/analyze-encoder-plane-full-terminal.mjs",'],
  ];
  let generated = source;
  for (const [before, after] of edits) {
    assert.equal(generated.split(before).length - 1, 1, before); generated = generated.replace(before, after);
  }
  // Runtime-owned generated analyzer lives outside scripts/, so rebase imports.
  for (const match of generated.matchAll(/^(import[^\r\n]*from) "(\.\/lib\/[^"\r\n]+)";$/gm))
    edits.push([match[0], `${match[1]} ${JSON.stringify(pathToFileURL(path.join(root, "scripts", match[2])).href)};`]);
  for (const [before, after] of edits.slice(4)) {
    assert.equal(generated.split(before).length - 1, 1, before); generated = generated.replace(before, after);
  }
  let reversed = generated;
  for (const [before, after] of edits.toReversed()) reversed = reversed.replace(after, before);
  assert.equal(reversed, source, "Full actual-source/memory/fidelity/cleanup gates remain byte-exact");
  return { generated, generatedSha256: sha(generated), edits, originalSha256: sha(source),
    publicAcceptance: false, additionalCleanSessionRequired: true };
}
