// One title-bearing derivative; no rebuild, original conversion or automatic retry.
import assert from "node:assert/strict";
import { readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import { pathToFileURL } from "node:url";
import { sha } from "./lib/stable-ui-headless-baseline-recipe.mjs";
import { createOwnedRuntimeScratch } from "./lib/owned-runtime-scratch.mjs";
const root = path.resolve(import.meta.dirname, "..");
assert.ok(process.argv.length === 2 || (process.argv.length === 3 && process.argv[2] === "--prepare"));
const original = await readFile(path.join(root, "scripts/validate-mpeg2-encoder-plane-goldens.mjs"), "utf8");
assert.equal(sha(original), "fcbaf80c2ac563e6bfa8eb9db5a1c7ab71aa68e90d3170fdf22d5d1386d78c04", "Historical launcher must be unchanged");
const edits = [
  ['path.resolve(import.meta.dirname, "..")', JSON.stringify(root)],
  ['makeEncoderPlaneBrowserRecipe as makeSingleIdleBrowserRecipe', 'makeEncoderPlaneTitleBrowserRecipe as makeSingleIdleBrowserRecipe'],
  ['verifyEncoderPlaneGoldenReport as verifySingleIdleGoldenReport', 'verifyEncoderPlaneTitleGoldenReport as verifySingleIdleGoldenReport'],
  ['  ENCODER_PLANE_SLOT as SINGLE_IDLE_SLOT, ENCODER_PLANE_RUN as SINGLE_IDLE_RUN } from "./lib/encoder-plane-browser-recipe.mjs";',
    '  ENCODER_PLANE_SLOT as SINGLE_IDLE_SLOT, ENCODER_PLANE_RUN as SINGLE_IDLE_RUN } from "./lib/encoder-plane-browser-recipe.mjs";'],
  ['"scripts/lib/encoder-plane-golden-launcher-source.mjs", "tests/mpeg2-encoder-plane-browser.test.mjs",',
    '"scripts/lib/encoder-plane-golden-launcher-source.mjs", "tests/mpeg2-encoder-plane-browser.test.mjs",\n  "scripts/validate-mpeg2-encoder-plane-titles.mjs", "scripts/lib/encoder-plane-title-browser-recipe.mjs",\n  "scripts/lib/matroska-mp4-stream-title.mjs", "tests/mpeg2-stream-title.test.mjs",'],
  ['createOwnedRuntimeScratch("encoder-plane-browser-goldens-")', 'createOwnedRuntimeScratch("encoder-plane-title-goldens-")'],
  ['${stamp}-encoder-plane-${suffix}.gz', '${stamp}-encoder-plane-title-${suffix}.gz'],
  ['${stamp}-encoder-plane-browser-goldens.json', '${stamp}-encoder-plane-title-browser-goldens.json'],
  ['five-headless-goldens-byte-exact-and-recovery-passed', 'five-headless-title-preservation-and-recovery-passed'],
];
// Move only the two altered aliases to the new module; original build guards remain.
edits.splice(3, 1, [
  'import { makeEncoderPlaneTitleBrowserRecipe as makeSingleIdleBrowserRecipe, verifyEncoderPlaneBuildEvidence as verifySingleIdleBuildEvidence,\n  verifyEncoderPlaneTitleGoldenReport as verifySingleIdleGoldenReport, FROZEN_BROWSER_SOURCES,',
  'import { makeEncoderPlaneTitleBrowserRecipe as makeSingleIdleBrowserRecipe, verifyEncoderPlaneTitleGoldenReport as verifySingleIdleGoldenReport } from "./lib/encoder-plane-title-browser-recipe.mjs";\nimport { verifyEncoderPlaneBuildEvidence as verifySingleIdleBuildEvidence, FROZEN_BROWSER_SOURCES,',
]);
let generated = original;
for (const [before, after] of edits) { assert.equal(generated.split(before).length - 1, 1, before); generated = generated.replace(before, after); }
let reversed = generated;
for (const [before, after] of edits.toReversed()) reversed = reversed.replace(after, before);
assert.equal(reversed, original);
generated = generated.replace(/from "(\.\/lib\/[^"\r\n]+)";/g,
  (_, relative) => `from ${JSON.stringify(pathToFileURL(path.join(root, "scripts", relative)).href)};`);
const runtime = await createOwnedRuntimeScratch("title-golden-launcher-");
try {
  const file = path.join(runtime.directory, "launcher.mjs");
  await writeFile(file, generated, { flag: "wx" });
  await import(pathToFileURL(file).href);
} finally { await runtime.close(); }
