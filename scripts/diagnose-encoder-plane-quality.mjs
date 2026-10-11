// One bounded synthetic browser diagnosis; keep the original 0.98 assertion.
import assert from "node:assert/strict";
import { readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import { pathToFileURL } from "node:url";
import { sha } from "./lib/stable-ui-headless-baseline-recipe.mjs";
import { createOwnedRuntimeScratch } from "./lib/owned-runtime-scratch.mjs";
const root = path.resolve(import.meta.dirname, "..");
assert.ok(process.argv.length === 2 || (process.argv.length === 3 && process.argv[2] === "--prepare"));
const source = await readFile(path.join(root, "scripts/validate-mpeg2-encoder-plane-goldens.mjs"), "utf8");
assert.equal(sha(source), "fcbaf80c2ac563e6bfa8eb9db5a1c7ab71aa68e90d3170fdf22d5d1386d78c04");
const edits = [
  ['path.resolve(import.meta.dirname, "..")', JSON.stringify(root)],
  ['import { makeEncoderPlaneBrowserRecipe as makeSingleIdleBrowserRecipe, verifyEncoderPlaneBuildEvidence as verifySingleIdleBuildEvidence,\n  verifyEncoderPlaneGoldenReport as verifySingleIdleGoldenReport, FROZEN_BROWSER_SOURCES,',
    'import { makeEncoderPlaneQualityBrowserRecipe as makeSingleIdleBrowserRecipe, inspectQualityDiagnostic as verifySingleIdleGoldenReport } from "./lib/encoder-plane-quality-browser-recipe.mjs";\nimport { verifyEncoderPlaneBuildEvidence as verifySingleIdleBuildEvidence, FROZEN_BROWSER_SOURCES,'],
  ['"scripts/lib/encoder-plane-golden-launcher-source.mjs", "tests/mpeg2-encoder-plane-browser.test.mjs",',
    '"scripts/lib/encoder-plane-golden-launcher-source.mjs", "tests/mpeg2-encoder-plane-browser.test.mjs",\n  "scripts/diagnose-encoder-plane-quality.mjs", "scripts/lib/encoder-plane-quality-browser-recipe.mjs",\n  "scripts/lib/encoder-plane-title-browser-recipe.mjs", "scripts/lib/matroska-mp4-stream-title.mjs",\n  "scripts/lib/bounded-ssim-summary.mjs", "tests/bounded-ssim-summary.test.mjs", "tests/encoder-plane-quality-browser.test.mjs",'],
  ['createOwnedRuntimeScratch("encoder-plane-browser-goldens-")', 'createOwnedRuntimeScratch("encoder-plane-quality-diagnostic-")'],
  ['assert.ok(!process.exitCode, "Preserve failure; no automatic retry");',
    '// A failed 0.98 assertion is diagnostic evidence, not success.\n    // Keep process.exitCode unchanged and require the exact numeric report below.'],
  ['${stamp}-encoder-plane-${suffix}.gz', '${stamp}-encoder-plane-quality-${suffix}.gz'],
  ['${stamp}-encoder-plane-browser-goldens.json', '${stamp}-encoder-plane-quality-diagnostic.json'],
  ['five-headless-goldens-byte-exact-and-recovery-passed', 'one-headless-full-geometry-quality-diagnostic-only-not-acceptance'],
];
let generated = source;
for (const [before, after] of edits) { assert.equal(generated.split(before).length - 1, 1, before); generated = generated.replace(before, after); }
let reversed = generated; for (const [before, after] of edits.toReversed()) reversed = reversed.replace(after, before);
assert.equal(reversed, source);
generated = generated.replace(/from "(\.\/lib\/[^"\r\n]+)";/g,
  (_, relative) => `from ${JSON.stringify(pathToFileURL(path.join(root, "scripts", relative)).href)};`);
const runtime = await createOwnedRuntimeScratch("quality-diagnostic-launcher-");
try {
  const file = path.join(runtime.directory, "launcher.mjs");
  await writeFile(file, generated, { flag: "wx" });
  await import(pathToFileURL(file).href);
} finally { await runtime.close(); }
