import assert from "node:assert/strict";
import path from "node:path";
import { pathToFileURL } from "node:url";
import { makeHeroWidthOriginalDriver } from "./mpeg2-hero-width-original-recipe.mjs";
export function makeJsProgressOriginalDriver(...args) {
  const prior = makeHeroWidthOriginalDriver(...args);
  const helper = pathToFileURL(path.join(args[1], "scripts/lib/conversion-js-allocation.mjs")).href;
  const patches = [
    ['let rendererAttribution=null,rendererAttributionResult=null;',
      `import { createConversionJsAllocation } from ${JSON.stringify(helper)};
let conversionJs=null,conversionJsReport=null;
let rendererAttribution=null,rendererAttributionResult=null;`],
    ['quiescedBudgetCapture.stateBefore=await page.evaluate(()=>window.__WITHIN_TEST__?.getState()??null);',
      'quiescedBudgetCapture.stateBefore=await page.evaluate(()=>window.__WITHIN_TEST__?.getState()??null);\n      if(conversionJs)await conversionJs.failureBeforeCancellation(quiescedBudgetCapture.stateBefore,event);'],
    ['  observer.setPhase("loaded-navigation"); await page.goto(query);',
      `  conversionJs=await createConversionJsAllocation(domSession,{directory:reports,prefix:path.basename(reportBase),context,origin});
  observer.setPhase("loaded-navigation"); await page.goto(query);`],
    ['    const first = await takeSample(`pre-conversion-${number}`);',
      '    const first = await takeSample(`pre-conversion-${number}`);\n    if(number===1)await conversionJs.beforeConversion({jobState:lastState?.jobState??null,metrics:lastState?.metrics??null});'],
    ['      run.state = lastState;',
      '      run.state = lastState;\n      if(number===1)await conversionJs.progress({jobState:lastState?.jobState??null,metrics:lastState?.metrics??null});'],
    ['    if (observer) nativeFailureCapture = await observer.finishCapture();',
      '    if (observer) nativeFailureCapture = await observer.finishCapture();\n    if(conversionJs){await conversionJs.close();conversionJsReport=conversionJs.report();}'],
    ['nativeMemory, nativeFailureCapture, domSamplerReport, cssCandidate, abortDiagnostic, quiescedBudgetCapture, rendererAttributionResult, failure,',
      'nativeMemory, nativeFailureCapture, domSamplerReport, cssCandidate, abortDiagnostic, quiescedBudgetCapture, rendererAttributionResult, conversionJsReport, failure,'],
    ['const sourceFiles = ["scripts/mpeg2-hero-width-original-memory.mjs",',
      'const sourceFiles = ["scripts/mpeg2-js-progress-original.mjs","scripts/lib/mpeg2-js-progress-recipe.mjs","scripts/lib/conversion-js-allocation.mjs","scripts/lib/bounded-js-allocation.mjs","evidence/ui-js-allocation-tooling-2026-10-08.json","scripts/mpeg2-hero-width-original-memory.mjs",'],
    ['-private-mpeg2-hero-width-original-native-100ms', '-private-mpeg2-js-progress-original-native-100ms'],
    ['"mpeg2-hero-width-original-runtime-"', '"mpeg2-js-progress-original-runtime-"'],
  ];
  let result = prior;
  for (const [before, after] of patches) { assert.equal(result.split(before).length, 2, before); result = result.replace(before, after); }
  let reversed = result;
  for (const [before, after] of patches.toReversed()) reversed = reversed.replace(after, before);
  assert.equal(reversed, prior, "Only bounded JS measurement/actual static asset capture/provenance changed; full source/defaults/quality/250MiB/all-processes/blank/three repeats/independent validators/finally preserved");
  return result;
}
