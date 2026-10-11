// Explicit private new-binary observer/control derivatives. No old proof is
// rewritten, no section but synthetic exports changes, no native media helper.
import assert from "node:assert/strict";
import path from "node:path";
import { pathToFileURL } from "node:url";
import { sha } from "./stable-ui-headless-baseline-recipe.mjs";
import { makeAllocationAttemptExportRecipe as previousExport } from "./allocation-attempt-control-recipe.mjs";
import { makeCompositeAllocationControlBrowserFactory as previousBrowser, makeCompositeAllocationControlCaller as previousCaller } from "./composite-allocation-control-recipe.mjs";
export const ALIGNMENT16_DECODER_SHA256 = "417182a9ed0f5e19e77c5248545c80265b87abd477984872d9ccf4094d8b1014";
const oldSha = "9ce862602f8db5e61f5047e4ecdccea1d8f7e8c98452fb486a95befeeb558039";
const addedFiles = ["scripts/lib/alignment16-control-recipe.mjs", "scripts/check-alignment16-abort-control.mjs", "scripts/lib/alignment16-attempt-abort-capture.mjs",
  "scripts/lib/alignment16-composite-abort-capture.mjs", "tests/alignment16-control.test.mjs", "evidence/mpeg2-alignment16-build-38161556498.json",
  "evidence/mpeg2-alignment16-build-branch-2026-10-11-origin-fix.json"];
function exact(source, edits) {
  let generated = source;
  for (const [before, after, count = 1] of edits) { assert.ok(before && after); assert.equal(generated.split(before).length - 1, count, before.slice(0, 160)); generated = generated.replaceAll(before, after); }
  let reverse = generated; for (const [before, after] of edits.toReversed()) reverse = reverse.replaceAll(after, before);
  assert.equal(reverse, source, "Only qualified identity/origin/evidence edits; all native/ownership/privacy/limits remain");
  return { generated, generatedSha256: sha(generated), edits };
}
export function makeAlignment16ExportRecipe(source) {
  return { ...exact(previousExport(source).generated, [[JSON.stringify(oldSha), JSON.stringify(ALIGNMENT16_DECODER_SHA256)]]), publicAcceptance: false };
}
export function makeAlignment16ControlBrowserFactory(source) {
  const prior = previousBrowser(source).generated;
  const files = '"bounded-wasm-abort-capture.mjs","dlmalloc-free-header-inspection.mjs","allocation-attempt-abort-capture.mjs","composite-allocation-abort-capture.mjs","late-refstruct-abort-snapshot.mjs"';
  const edits = [
    ['from "./allocation-attempt-abort-capture.mjs";', 'from "./alignment16-attempt-abort-capture.mjs";'],
    ['from "/composite-allocation-abort-capture.mjs";', 'from "/alignment16-composite-abort-capture.mjs";'],
    [files, files + ',"alignment16-attempt-abort-capture.mjs","alignment16-composite-abort-capture.mjs"'],
    ['work/mpeg2-allocation-attempt-38138821153', 'work/mpeg2-alignment16-38161556498'],
    ["composite-allocation-abort-control", "alignment16-abort-control", 4],
    ["export const allocationAttemptControlFiles = [", "export const allocationAttemptControlFiles = [" + addedFiles.map(file => JSON.stringify(file) + ",").join("")],
  ];
  return { ...exact(prior, edits), publicAcceptance: false };
}
export function makeAlignment16ControlCaller(source, root) {
  const prior = previousCaller(source, root).generated;
  const edits = [
    ['evidence/mpeg2-allocation-attempt-build-38138821153.json', 'evidence/mpeg2-alignment16-build-38161556498.json'],
    ['evidence/mpeg2-allocation-attempt-build-branch-2026-10-11-binding-fix.json', 'evidence/mpeg2-alignment16-build-branch-2026-10-11-origin-fix.json'],
    ['actual-allocation-attempt-build-unit-verified-not-browser-acceptance', 'actual-alignment16-build-unit-verified-not-browser-acceptance'],
    ['work/mpeg2-allocation-attempt-38138821153', 'work/mpeg2-alignment16-38161556498'],
    ['"composite-allocation-control-caller-"', '"alignment16-control-caller-"'],
    ['composite-allocation-abort-control', 'alignment16-abort-control', 3],
    ['assert.equal(process.argv.length, 2);', 'assert.ok(process.argv.length === 2 || (process.argv.length === 3 && process.argv[2] === "--prepare"));\nconst prepareOnly = process.argv[2] === "--prepare";'],
    ['if (!receipt.launchHostPreflight.safeToStart)', 'if (!receipt.launchHostPreflight.safeToStart || prepareOnly)'],
    ['receipt.status = "held-before-browser-import-insufficient-host-memory";', 'receipt.status = prepareOnly ? "prepared-not-browser-executed" : "held-before-browser-import-insufficient-host-memory";'],
  ];
  for (const [file, before, after] of [
    ["allocation-attempt-abort-capture.mjs", 'ALLOCATION_ATTEMPT_ROOT } from ', 'ALLOCATION_ATTEMPT_ROOT } from '],
    ["allocation-attempt-control-recipe.mjs", 'import { makeAllocationAttemptExportRecipe } from ', 'import { makeAlignment16ExportRecipe as makeAllocationAttemptExportRecipe } from '],
    ["composite-allocation-control-recipe.mjs", 'import { makeCompositeAllocationControlBrowserFactory as makeAllocationAttemptBrowserFactory } from ', 'import { makeAlignment16ControlBrowserFactory as makeAllocationAttemptBrowserFactory } from '],
  ]) {
    const original = before + JSON.stringify(pathToFileURL(path.join(root, "scripts/lib", file)).href);
    const target = file === "allocation-attempt-abort-capture.mjs" ? "alignment16-attempt-abort-capture.mjs" : "alignment16-control-recipe.mjs";
    edits.push([original, after + JSON.stringify(pathToFileURL(path.join(root, "scripts/lib", target)).href)]);
  }
  const generated = exact(prior, edits);
  return { ...generated, previousCallerSha256: sha(prior), publicAcceptance: false };
}
