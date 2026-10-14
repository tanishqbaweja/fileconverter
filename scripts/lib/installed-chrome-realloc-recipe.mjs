// Fresh qualification on installed Chrome; ALL old executed sources immutable.
// Media imports are lazy: fatal control does not execute the media pipeline.
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import path from "node:path";
import { pathToFileURL } from "node:url";
import { sha } from "./stable-ui-headless-baseline-recipe.mjs";
import { validateInstalledChromePin } from "./installed-chrome-pin.mjs";
import { makeCompositeReallocControlCaller,makeCompositeReallocControlBrowserRecipe,COMPOSITE_REALLOC_FILES } from "./realloc-composite-control-recipe.mjs";
export const INSTALLED_CHROME_FILES=["scripts/lib/installed-chrome-pin.mjs","scripts/lib/installed-chrome-realloc-recipe.mjs",
  "scripts/qualify-installed-chrome-realloc.mjs","tests/installed-chrome-realloc.test.mjs"];
export const INSTALLED_CHROME_CONTROL_FILES=[...COMPOSITE_REALLOC_FILES,...INSTALLED_CHROME_FILES];
function once(source,before,after) {assert.equal(source.split(before).length,2,before.slice(0,120));return source.replace(before,after);}
function patch(source,edits) {let result=source;for(const [before,after] of edits)result=once(result,before,after);let reverse=result;
  for(const [before,after] of edits.toReversed())reverse=once(reverse,after,before);assert.equal(reverse,source);return result;}
export function makeInstalledChromeControlBrowserRecipe(source,root,controlPath,control,stamp,pin) {
  validateInstalledChromePin(pin);const old=makeCompositeReallocControlBrowserRecipe(source,root,controlPath,control,stamp);
  const edits=[
    ['browserVersion = browser.version(); const context = browser.contexts()[0]; page = context.pages()[0];',
      `browserVersion = browser.version(); assert.equal(browserVersion,${JSON.stringify(pin.version)},"Actual runtime browser must match qualified installed binary"); const context = browser.contexts()[0]; page = context.pages()[0];`],
    [`evidence/${stamp}-realloc-composite-control.json`,`evidence/${stamp}-installed-chrome-realloc-control.json`],
    ['"realloc-composite-control-browser-"','"installed-chrome-control-browser-"'],
  ];
  const generated=patch(old.generated,edits),start=generated.indexOf("const workerSource = "),end=generated.indexOf(";\nconst files = new Map([",start);
  assert.ok(start>0&&end>start);const worker=JSON.parse(generated.slice(start+"const workerSource = ".length,end));
  return {...old,generated,generatedSha256:sha(generated),installedChromeEdits:edits,browserPin:pin,worker,workerSha256:sha(worker),publicAcceptance:false};
}
export function makeInstalledChromeControlCaller(source,root) {
  const old=makeCompositeReallocControlCaller(source,root),url=pathToFileURL(path.join(root,"scripts/lib/installed-chrome-realloc-recipe.mjs")).href,
    pinUrl=pathToFileURL(path.join(root,"scripts/lib/installed-chrome-pin.mjs")).href;
  const before=`import { makeCompositeReallocControlBrowserRecipe as makeReallocControlBrowserRecipe, COMPOSITE_REALLOC_FILES as REALLOC_CONTROL_FILES } from ${JSON.stringify(pathToFileURL(path.join(root,"scripts/lib/realloc-composite-control-recipe.mjs")).href)};`;
  const edits=[
    [before,`import { makeInstalledChromeControlBrowserRecipe as makeReallocControlBrowserRecipe, INSTALLED_CHROME_CONTROL_FILES as REALLOC_CONTROL_FILES } from ${JSON.stringify(url)};\nimport { inspectInstalledChromePin, assertInstalledChromePinsEqual } from ${JSON.stringify(pinUrl)};`],
    ['const runtime = await createOwnedRuntimeScratch("realloc-composite-control-caller-"), stamp = new Date().toISOString().replaceAll(/[:.]/g,"-");',
      'const installedBrowserPin=await inspectInstalledChromePin();\nconst runtime = await createOwnedRuntimeScratch("installed-chrome-control-caller-"), stamp = new Date().toISOString().replaceAll(/[:.]/g,"-");'],
    ['root,controlPath,control,stamp);','root,controlPath,control,stamp,installedBrowserPin);'],
    ['receipt.syntheticExportOnlyBinaryRemovedWithCallerScratch=true;',`receipt.syntheticExportOnlyBinaryRemovedWithCallerScratch=true;
receipt.browserPinBefore=installedBrowserPin;receipt.browserPinAfter=await inspectInstalledChromePin();assertInstalledChromePinsEqual(receipt.browserPinBefore,receipt.browserPinAfter);
if(receipt.proof){receipt.actualRuntimeBrowserVersion=JSON.parse(await read(receipt.proof.path)).browserVersion;assert.equal(receipt.actualRuntimeBrowserVersion,installedBrowserPin.version);}`],
  ];
  let generated=patch(old.generated,edits);generated=generated.replaceAll("${stamp}-realloc-composite-control","${stamp}-installed-chrome-realloc-control");
  return {...old,generated,generatedSha256:sha(generated),installedChromeEdits:edits};
}
// Control receipt/witness argument is explicit, not inferred latest log/lock.
export async function installedChromeMediaSourceFiles(root) {
  const {journaledReallocMediaSourceFiles}=await import("./journaled-realloc-media-recipe.mjs");
  const file=process.env.WITHIN_INSTALLED_CHROME_CONTROL_RECEIPT;
  assert.match(file??"",/^evidence\/\d{4}-\d\d-\d\dT[\d-]+Z-installed-chrome-realloc-control-executed-sources\.json$/);
  const witness=JSON.parse(await readFile(path.join(root,file)));assert.equal(witness.failure,null);assert.equal(witness.proof.status,"passed-synthetic-abort-control");
  assert.deepEqual(witness.sourcePins,witness.postSourcePins);validateInstalledChromePin(witness.browserPinBefore);assert.deepEqual(witness.browserPinBefore,witness.browserPinAfter);
  assert.equal(witness.actualRuntimeBrowserVersion,witness.browserPinBefore.version);
  const proofBytes=await readFile(path.join(root,witness.proof.path));assert.equal(sha(proofBytes),witness.proof.sha256);
  const files=[...new Set([...await journaledReallocMediaSourceFiles(root),...INSTALLED_CHROME_FILES,...Object.keys(witness.sourcePins),file,witness.proof.path])];
  assert.ok(files.length<=256,"No evidence-source cap increase or source omission");return files;
}
export async function makeInstalledChromeMediaBrowserRecipe(sources,root,runtime,stamp,branch,build) {
  const {makeJournaledReallocMediaBrowserRecipe}=await import("./journaled-realloc-media-recipe.mjs");
  const old=await makeJournaledReallocMediaBrowserRecipe(sources,root,runtime,stamp,branch,build);
  const witness=JSON.parse(await readFile(path.join(root,process.env.WITHIN_INSTALLED_CHROME_CONTROL_RECEIPT)));
  const pin=witness.browserPinBefore;validateInstalledChromePin(pin);
  const edits=[['test.beforeEach(async ({ context, browser, page }) => {',
    `test.beforeEach(async ({ context, browser, page }) => {\n  const actualBrowserVersion=browser.version();expect(actualBrowserVersion).toBe(${JSON.stringify(pin.version)});\n  rows.push({kind:"actual-runtime-browser-version",version:actualBrowserVersion});`]];
  return {...old,spec:patch(old.spec,edits),installedChromeSpecEdits:edits,browserPin:pin,actualControlWitness:process.env.WITHIN_INSTALLED_CHROME_CONTROL_RECEIPT,publicAcceptance:false};
}
export function makeInstalledChromeMediaCallerFromJournaled(old,root) {
  const oldUrl=pathToFileURL(path.join(root,"scripts/lib/journaled-realloc-media-recipe.mjs")).href,
    newUrl=pathToFileURL(path.join(root,"scripts/lib/installed-chrome-realloc-recipe.mjs")).href,
    pinUrl=pathToFileURL(path.join(root,"scripts/lib/installed-chrome-pin.mjs")).href;
  const edits=[
    [`import { makeJournaledReallocMediaBrowserRecipe as makeSingleIdleBrowserRecipe, inspectReallocMediaReport as verifySingleIdleGoldenReport } from ${JSON.stringify(oldUrl)};`,
      `import { makeInstalledChromeMediaBrowserRecipe as makeSingleIdleBrowserRecipe } from ${JSON.stringify(newUrl)};\nimport { inspectReallocMediaReport as verifySingleIdleGoldenReport } from ${JSON.stringify(pathToFileURL(path.join(root,"scripts/lib/realloc-media-report-inspector.mjs")).href)};\nimport { inspectInstalledChromePin, assertInstalledChromePinsEqual } from ${JSON.stringify(pinUrl)};`],
    [`import { journaledReallocMediaSourceFiles as attemptMediaSourceFiles } from ${JSON.stringify(oldUrl)};`,
      `import { installedChromeMediaSourceFiles as attemptMediaSourceFiles } from ${JSON.stringify(newUrl)};`],
    ['const sources = {}, sourcePins = {};','const installedBrowserPinBefore=await inspectInstalledChromePin();\nconst sources = {}, sourcePins = {};'],
    ['    analysis = verifySingleIdleGoldenReport(report, baseline, build);',`    analysis = verifySingleIdleGoldenReport(report, baseline, build);
    const versions=report.rows.filter(row=>row.kind==="actual-runtime-browser-version");assert.equal(versions.length,4);
    for(const row of versions)assert.equal(row.version,installedBrowserPinBefore.version);
    assert.deepEqual(generated.browserPin,installedBrowserPinBefore);`],
    ['const proof = { recordedAt: new Date().toISOString(),', 'const installedBrowserPinAfter=await inspectInstalledChromePin();assertInstalledChromePinsEqual(installedBrowserPinBefore,installedBrowserPinAfter);\nconst proof = { browserPinBefore:installedBrowserPinBefore,browserPinAfter:installedBrowserPinAfter, recordedAt: new Date().toISOString(),'],
  ];
  let generated=patch(old.generated,edits);generated=generated.replaceAll("${stamp}-journaled-realloc-media","${stamp}-installed-chrome-realloc-media");
  return {...old,generated,generatedSha256:sha(generated),installedChromeEdits:edits};
}
