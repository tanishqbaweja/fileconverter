// Qualify new combined callback using the same actual export-only fatal control.
import assert from "node:assert/strict";
import path from "node:path";
import { pathToFileURL } from "node:url";
import { makeReallocControlBrowserRecipe, REALLOC_CONTROL_FILES } from "./realloc-control-browser-recipe.mjs";
import { sha } from "./stable-ui-headless-baseline-recipe.mjs";
export const COMPOSITE_REALLOC_FILES = [...REALLOC_CONTROL_FILES,
  "scripts/check-realloc-composite-control.mjs", "scripts/lib/realloc-composite-control-recipe.mjs",
  "scripts/lib/realloc-allocation-abort-capture.mjs", "scripts/lib/realloc-aligned-attempt-snapshot.mjs",
  "scripts/lib/realloc-asyncify-glue-recipe.mjs", "tests/realloc-composition.test.mjs"];
function once(source,before,after) { assert.equal(source.split(before).length,2,before.slice(0,120)); return source.replace(before,after); }
export function makeCompositeReallocControlBrowserRecipe(source,root,controlPath,control,stamp) {
  const old = makeReallocControlBrowserRecipe(source,root,controlPath,control,stamp);
  const edits = [
    ['import {createReallocAbortCapture} from \\"/realloc-composite-abort-capture.mjs\\";',
      'import {createCompositeAllocationAbortCapture} from \\"/realloc-allocation-abort-capture.mjs\\";'],
    ['const capture=createReallocAbortCapture(', 'const capture=createCompositeAllocationAbortCapture('],
    ['"realloc-composite-abort-capture.mjs"].map',
      '"realloc-composite-abort-capture.mjs","realloc-allocation-abort-capture.mjs","realloc-aligned-attempt-snapshot.mjs","late-refstruct-abort-snapshot.mjs"].map'],
    ['assert.equal(terminal.emitted.maximumScalarWords,16);', 'assert.equal(terminal.emitted.maximumScalarWords,32);'],
    ['  assert.equal(terminal.emitted.allocatorFreeBlocksUnavailable,null);',
      '  assert.equal(terminal.emitted.actualAttemptSlotAddress,1918848);assert.equal(terminal.emitted.actualPoolSlotAddress,1918976);\n' +
      '  assert.equal(terminal.emitted.qualifiedPacketCallPath,false);assert.equal(terminal.emitted.qualifiedPoolCallPath,false);\n' +
      '  assert.equal(terminal.emitted.allocationAttempt,null);assert.equal(terminal.emitted.latePoolRequest,null);\n' +
      '  assert.equal(terminal.emitted.allocatorFreeBlocksUnavailable,null);'],
    [`evidence/${stamp}-realloc-abort-control.json`, `evidence/${stamp}-realloc-composite-control.json`],
    ['"realloc-abort-control-browser-"', '"realloc-composite-control-browser-"'],
  ];
  let generated = old.generated;
  for (const [before,after] of edits) generated = once(generated,before,after);
  let reversed = generated; for (const [before,after] of edits.toReversed()) reversed = once(reversed,after,before);
  assert.equal(reversed,old.generated,"Same fatal/birth/privacy/finally/heap/control gates; cap32 retains old combined bound");
  return { ...old, generated, generatedSha256:sha(generated), parentGeneratedSha256:old.generatedSha256, compositeEdits:edits };
}
export function makeCompositeReallocControlCaller(source,root) {
  assert.equal(sha(source),"85dde281c1bc0842727061bd8094c24289d859fe7131deec12c15808dbeec2b3");
  const edits = [
    ['const root = path.resolve(import.meta.dirname, ".."), read = file => readFile(path.join(root, file));',
      `const root = ${JSON.stringify(root)}, read = file => readFile(path.join(root, file));`],
    ['import { makeReallocControlBrowserRecipe, REALLOC_CONTROL_FILES } from "./lib/realloc-control-browser-recipe.mjs";',
      'import { makeCompositeReallocControlBrowserRecipe as makeReallocControlBrowserRecipe, COMPOSITE_REALLOC_FILES as REALLOC_CONTROL_FILES } from "./lib/realloc-composite-control-recipe.mjs";'],
    ['"realloc-abort-control-caller-"','"realloc-composite-control-caller-"'],
  ];
  let generated = source; for (const [before,after] of edits) generated = once(generated,before,after);
  const namespace = "${stamp}-realloc-abort-control", replacement = "${stamp}-realloc-composite-control";
  assert.equal(generated.split(namespace).length,4); generated = generated.replaceAll(namespace,replacement);
  let reversed = generated.replaceAll(replacement,namespace); for(const [before,after] of edits.toReversed()) reversed = once(reversed,after,before);
  assert.equal(reversed,source);
  generated = generated.replace(/from "(\.\/lib\/[^"\r\n]+)"/g,
    (_,name)=>`from ${JSON.stringify(pathToFileURL(path.resolve(root,"scripts",name)).href)}`);
  return { generated, generatedSha256:sha(generated), edits, parentSourceSha256:sha(source), publicAcceptance:false };
}
