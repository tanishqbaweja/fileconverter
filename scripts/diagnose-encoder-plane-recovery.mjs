// Bounded private two-case same-page recovery run, no automatic retries.
import assert from "node:assert/strict";
import { readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import { pathToFileURL } from "node:url";
import { sha } from "./lib/stable-ui-headless-baseline-recipe.mjs";
import { createOwnedRuntimeScratch } from "./lib/owned-runtime-scratch.mjs";
const root = path.resolve(import.meta.dirname, "..");
assert.ok(process.argv.length === 2 || (process.argv.length === 3 && process.argv[2] === "--prepare"));
const source = await readFile(path.join(root, "scripts/diagnose-encoder-plane-quality.mjs"), "utf8");
assert.equal(sha(source), "1414f3bbb4acd595ab7204ae5fe0e10a095b43e1e349ef518c26f5c05bdf55fa");
const edits = [
  ['const root = path.resolve(import.meta.dirname, "..");', `const root = ${JSON.stringify(root)};`],
  ['makeEncoderPlaneQualityBrowserRecipe as makeSingleIdleBrowserRecipe, inspectQualityDiagnostic as verifySingleIdleGoldenReport',
    'makeEncoderPlaneRecoveryBrowserRecipe as makeSingleIdleBrowserRecipe, inspectRecoveryDiagnostic as verifySingleIdleGoldenReport'],
  ['./lib/encoder-plane-quality-browser-recipe.mjs', './lib/encoder-plane-recovery-browser-recipe.mjs'],
  ['"tests/encoder-plane-quality-browser.test.mjs",',
    '"tests/encoder-plane-quality-browser.test.mjs", "scripts/diagnose-encoder-plane-recovery.mjs", "scripts/lib/encoder-plane-recovery-browser-recipe.mjs", "scripts/lib/encoder-plane-bitrate-browser-recipe.mjs", "tests/encoder-plane-recovery-browser.test.mjs",'],
  ['encoder-plane-quality-diagnostic-', 'encoder-plane-recovery-diagnostic-'],
  ['encoder-plane-quality-${suffix}', 'encoder-plane-recovery-${suffix}'],
  ['encoder-plane-quality-diagnostic.json', 'encoder-plane-recovery-diagnostic.json'],
  ['one-headless-full-geometry-quality-diagnostic-only-not-acceptance', 'two-headless-adverse-and-same-page-recovery-cases-not-full-acceptance'],
  ['quality-diagnostic-launcher-', 'recovery-diagnostic-launcher-'],
];
let generated = source;
for (const [before, after] of edits) { assert.equal(generated.split(before).length - 1, 1, before); generated = generated.replace(before, after); }
let reversed = generated; for (const [before, after] of edits.toReversed()) reversed = reversed.replace(after, before);
assert.equal(reversed, source);
generated = generated.replace(/from "(\.\/lib\/[^"\r\n]+)";/g,
  (_, relative) => `from ${JSON.stringify(pathToFileURL(path.join(root, "scripts", relative)).href)};`);
const runtime = await createOwnedRuntimeScratch("recovery-diagnostic-launcher-");
try {
  const file = path.join(runtime.directory, "launcher.mjs"); await writeFile(file, generated, { flag: "wx" });
  await import(pathToFileURL(file).href);
} finally { await runtime.close(); }
