// Scoped derivative of the qualified short browser diagnostic, no auto retry.
import assert from "node:assert/strict";
import { readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import { pathToFileURL } from "node:url";
import { sha } from "./lib/stable-ui-headless-baseline-recipe.mjs";
import { createOwnedRuntimeScratch } from "./lib/owned-runtime-scratch.mjs";
const root = path.resolve(import.meta.dirname, "..");
const argument = process.argv[2];
assert.match(argument ?? "", /^--bitrate=(2000000|4000000)$/);
assert.ok(process.argv.length === 3 || (process.argv.length === 4 && process.argv[3] === "--prepare"));
const bitRate = Number(argument.split("=")[1]);
const source = await readFile(path.join(root, "scripts/diagnose-encoder-plane-quality.mjs"), "utf8");
assert.equal(sha(source), "1414f3bbb4acd595ab7204ae5fe0e10a095b43e1e349ef518c26f5c05bdf55fa");
const edits = [
  ['const root = path.resolve(import.meta.dirname, "..");', `const root = ${JSON.stringify(root)};\nprocess.argv.splice(2, 1);`],
  ['makeEncoderPlaneQualityBrowserRecipe as makeSingleIdleBrowserRecipe, inspectQualityDiagnostic as verifySingleIdleGoldenReport',
    `makeEncoderPlaneBitrateBrowserRecipe as bitrateRecipe, inspectBitrateDiagnostic as bitrateAnalysis`],
  ['./lib/encoder-plane-quality-browser-recipe.mjs', './lib/encoder-plane-bitrate-browser-recipe.mjs'],
  ['import { verifyEncoderPlaneBuildEvidence as verifySingleIdleBuildEvidence, FROZEN_BROWSER_SOURCES,',
    `const makeSingleIdleBrowserRecipe = (...args) => bitrateRecipe(...args, ${bitRate});\\nconst verifySingleIdleGoldenReport = (...args) => bitrateAnalysis(...args, ${bitRate});\\nimport { verifyEncoderPlaneBuildEvidence as verifySingleIdleBuildEvidence, FROZEN_BROWSER_SOURCES,`],
  ['"tests/encoder-plane-quality-browser.test.mjs",',
    '"tests/encoder-plane-quality-browser.test.mjs", "scripts/diagnose-encoder-plane-bitrate.mjs", "scripts/lib/encoder-plane-bitrate-browser-recipe.mjs", "tests/encoder-plane-bitrate-browser.test.mjs",'],
  ['encoder-plane-quality-diagnostic-', `encoder-plane-bitrate-${bitRate}-diagnostic-`],
  ['encoder-plane-quality-${suffix}', `encoder-plane-bitrate-${bitRate}-\${suffix}`],
  ['encoder-plane-quality-diagnostic.json', `encoder-plane-bitrate-${bitRate}-diagnostic.json`],
  ['quality-diagnostic-launcher-', `bitrate-${bitRate}-diagnostic-launcher-`],
];
let generated = source;
for (const [before, after] of edits) { assert.equal(generated.split(before).length - 1, 1, before); generated = generated.replace(before, after); }
let reversed = generated; for (const [before, after] of edits.toReversed()) reversed = reversed.replace(after, before);
assert.equal(reversed, source);
generated = generated.replace(/from "(\.\/lib\/[^"\r\n]+)";/g,
  (_, relative) => `from ${JSON.stringify(pathToFileURL(path.join(root, "scripts", relative)).href)};`);
const runtime = await createOwnedRuntimeScratch("bitrate-diagnostic-launcher-");
try {
  const file = path.join(runtime.directory, "launcher.mjs");
  await writeFile(file, generated, { flag: "wx" });
  await import(pathToFileURL(file).href);
} finally { await runtime.close(); }
