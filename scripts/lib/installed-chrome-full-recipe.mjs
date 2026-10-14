// New qualified browser pin, EXACT same native composition/stager/acceptance.
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import path from "node:path";
import { pathToFileURL } from "node:url";
import { gunzipSync } from "node:zlib";
import { sha } from "./stable-ui-headless-baseline-recipe.mjs";
import { assertInstalledChromePinsEqual,inspectInstalledChromePin } from "./installed-chrome-pin.mjs";
import { inspectReallocMediaReport } from "./realloc-media-report-inspector.mjs";
import { loadQualifiedReallocMedia,makeReallocFullCaller,makeReallocFullDriver } from "./realloc-full-recipe.mjs";
import { makeReallocSupervisorRecipe } from "./realloc-supervisor-recipe.mjs";
import { INSTALLED_CHROME_MEDIA_RECEIPT,INSTALLED_CHROME_QUALIFICATION } from "./installed-chrome-full-sources.mjs";
const rootDefault=path.resolve(import.meta.dirname,"../..");
export const INSTALLED_CHROME_FULL_FILES=["scripts/lib/installed-chrome-full-sources.mjs","scripts/lib/installed-chrome-full-recipe.mjs",
  "scripts/run-installed-chrome-realloc-full.mjs","tests/installed-chrome-full.test.mjs"];
function edit(parent,edits) {let generated=parent.generated;for(const [before,after,count=1] of edits){assert.equal(generated.split(before).length-1,count,before.slice(0,120));generated=generated.replaceAll(before,after);}
  let reverse=generated;for(const [before,after] of edits.toReversed())reverse=reverse.replaceAll(after,before);assert.equal(reverse,parent.generated);
  return {...parent,generated,generatedSha256:sha(generated),parentGeneratedSha256:sha(parent.generated),installedChromeFullEdits:edits,conversionAcceptanceGatesChanged:false,publicAcceptance:false};}
export async function loadInstalledChromeFullQualification(root=rootDefault) {
  const read=file=>readFile(path.join(root,file)),sealBytes=await read(INSTALLED_CHROME_QUALIFICATION),seal=JSON.parse(sealBytes);
  assert.equal(sha(sealBytes),"49ddd14334e771b9f61dbb8158e4692f383b4a6ff19bd25c777d9066e48fa567");assert.equal(seal.beforeAfterCurrentPinsEqual,true);
  const mediaBytes=await read(INSTALLED_CHROME_MEDIA_RECEIPT);assert.equal(sha(mediaBytes),seal.media.sha256);const media=JSON.parse(mediaBytes);
  assert.equal(media.failure,null);assert.equal(media.analysis.genuineValidatedConversions,4);assert.deepEqual(media.sourcePins,media.postSourcePins);
  assert.equal(Object.keys(media.sourcePins).length,255);assertInstalledChromePinsEqual(seal.browserPin,media.browserPinBefore);assertInstalledChromePinsEqual(media.browserPinBefore,media.browserPinAfter);
  const restore=async(record,limit)=>{const zip=await read(record.path);assert.equal(zip.length,record.bytes);assert.equal(sha(zip),record.sha256);
    const raw=gunzipSync(zip,{maxOutputLength:limit});assert.equal(raw.length,record.restoredBytes);assert.equal(sha(raw),record.restoredSha256);return JSON.parse(raw);};
  const archive=await restore(media.generatedArchive,8388608),report=await restore(media.report.archive,2097152);assert.deepEqual(archive.sourcePins,media.sourcePins);
  for(const [file,hash] of Object.entries(media.sourcePins)){assert.equal(sha(archive.sources[file]),hash,file);assert.equal(sha(await read(file)),hash,file);}
  assert.deepEqual(inspectReallocMediaReport(report,JSON.parse(await read(media.baseline.path)).reports[0].report,JSON.parse(await read(media.build.path))),media.analysis);
  const versions=report.rows.filter(row=>row.kind==="actual-runtime-browser-version");assert.equal(versions.length,4);for(const row of versions)assert.equal(row.version,seal.browserPin.version);
  const witnessBytes=await read(seal.controlWitness.path);assert.equal(sha(witnessBytes),seal.controlWitness.sha256);const witness=JSON.parse(witnessBytes),controlBytes=await read(witness.proof.path),control=JSON.parse(controlBytes);
  assert.equal(sha(controlBytes),seal.control.sha256);assert.equal(witness.failure,null);assert.equal(control.status,"passed-synthetic-abort-control");assert.equal(control.browserVersion,seal.browserPin.version);
  assertInstalledChromePinsEqual(witness.browserPinBefore,witness.browserPinAfter);assertInstalledChromePinsEqual(witness.browserPinBefore,seal.browserPin);
  const controlArchive=await restore(witness.archive,2097152);assert.equal(Object.keys(witness.sourcePins).length,125);assert.deepEqual(witness.sourcePins,witness.postSourcePins);
  for(const [file,hash] of Object.entries(witness.sourcePins)){assert.equal(sha(Buffer.from(controlArchive.preimages[file],"base64")),hash,file);assert.equal(sha(await read(file)),hash,file);}
  const original=await loadQualifiedReallocMedia(root);assert.deepEqual(report.manifest,original.report.manifest);
  assert.equal(archive.generated.stage.replaceAll(archive.generated.candidateName,"QUALIFIED_CANDIDATE"),original.archive.generated.stage.replaceAll(original.archive.generated.candidateName,"QUALIFIED_CANDIDATE"),"Same actual production stager/native adapter; browser-version hook only in short spec");
  assert.equal(sha(await read(seal.ownSource.path)),seal.ownSource.sha256);assertInstalledChromePinsEqual(seal.browserPin,await inspectInstalledChromePin());
  return {seal,media,archive,report,pin:seal.browserPin,nativeQualification:original,originalAdapter:original.adapter,reference:{path:INSTALLED_CHROME_QUALIFICATION,sha256:sha(sealBytes),sourceCount:255,runtimeVersion:seal.browserPin.version,unchangedNativeProductionAdapter:true}};
}
export async function makeInstalledChromeFullDriver(root,runtime,name,files) {
  const parent=await makeReallocFullDriver(root,runtime,name,files);
  return edit(parent,[["-private-mpeg2-realloc-full-native-100ms","-private-mpeg2-installed-chrome-realloc-full-native-100ms"]]);
}
export async function makeInstalledChromeFullCaller(root=rootDefault) {
  const parent=await makeReallocFullCaller(root),qualified=await loadInstalledChromeFullQualification(root),url=file=>pathToFileURL(path.join(root,"scripts/lib",file)).href;
  const extra=[...new Set([...parent.extraFiles,...Object.keys(qualified.media.sourcePins),...INSTALLED_CHROME_FULL_FILES,INSTALLED_CHROME_MEDIA_RECEIPT,INSTALLED_CHROME_QUALIFICATION,
    qualified.media.generatedArchive.path,qualified.media.report.archive.path,qualified.seal.ownSource.path,
    qualified.nativeQualification.reference.path,qualified.nativeQualification.proof.generatedArchive.path,qualified.nativeQualification.proof.report.archive.path])];
  return {...edit(parent,[
    [url("realloc-full-sources.mjs"),url("installed-chrome-full-sources.mjs")],
    [`import { makeReallocFullDriver as makeAllocationAttemptFullDriver } from ${JSON.stringify(url("realloc-full-recipe.mjs"))};`,
      `import { makeInstalledChromeFullDriver as makeAllocationAttemptFullDriver, loadInstalledChromeFullQualification } from ${JSON.stringify(url("installed-chrome-full-recipe.mjs"))};\nimport { inspectInstalledChromePin, assertInstalledChromePinsEqual } from ${JSON.stringify(url("installed-chrome-pin.mjs"))};`],
    ["const base = await loadHistoricalFullSourceBase(root), media = await loadQualifiedAttemptMediaSources(root);",
      "const browserQualification=await loadInstalledChromeFullQualification(root);\nconst base = await loadHistoricalFullSourceBase(root), media = await loadQualifiedAttemptMediaSources(root);"],
    ["const callerFiles = [",`const callerFiles = [${extra.map(file=>JSON.stringify(file)).join(",")},`],
    ['qualifiedMedia: media.reference, previousTerminal: base.reference.receipt, prerequisites,',
      'qualifiedBrowser:browserQualification.reference,browserPinBefore:browserQualification.pin,browserPinAfter:null,qualifiedMedia: media.reference, previousTerminal: base.reference.receipt, prerequisites,'],
    ['assert.equal(await hashFile("C:/Program Files/Google/Chrome/Application/chrome.exe"), oldRaw.progressProbe.chromeLauncherSha256);',
      'assert.equal(await hashFile("C:/Program Files/Google/Chrome/Application/chrome.exe"), browserQualification.pin.launcher.sha256);'],
    ['assert.equal(await hashFile(`C:/Program Files/Google/Chrome/Application/${oldRaw.browserVersion}/chrome.dll`), oldRaw.progressProbe.chromeLibrarySha256);',
      'assert.equal(await hashFile(`C:/Program Files/Google/Chrome/Application/${browserQualification.pin.version}/chrome.dll`), browserQualification.pin.library.sha256);\n    assertInstalledChromePinsEqual(browserQualification.pin,await inspectInstalledChromePin());'],
    ['assert.deepEqual(raw.manifest, media.report.manifest); assert.equal(raw.limitMiB, 250); assert.equal(raw.requestedRuns, 3);',
      'assert.deepEqual(raw.manifest, media.report.manifest); assert.equal(raw.limitMiB, 250); assert.equal(raw.requestedRuns, 3);\n    assert.equal(raw.browserVersion,browserQualification.pin.version);assert.equal(raw.progressProbe.chromeLauncherSha256,browserQualification.pin.launcher.sha256);assert.equal(raw.progressProbe.chromeLibrarySha256,browserQualification.pin.library.sha256);'],
    ['  const actions = [async () => { if (proof.protectedBefore)',
      '  const actions = [async () => { proof.browserPinAfter=await inspectInstalledChromePin();assertInstalledChromePinsEqual(proof.browserPinBefore,proof.browserPinAfter); },async () => { if (proof.protectedBefore)'],
    ["|realloc)-full-live","|realloc|installed-chrome-realloc)-full-live"],
    ["-realloc-full-live.json","-installed-chrome-realloc-full-live.json"],
    ["-private-mpeg2-realloc-full-native-100ms.json","-private-mpeg2-installed-chrome-realloc-full-native-100ms.json"],
    ["${stamp}-realloc-original-full","${stamp}-installed-chrome-realloc-original-full"],
  ]),extraFiles:extra,qualifiedBrowser:qualified.reference};
}
export function makeInstalledChromeFullSupervisor(source,root) {
  const parent=makeReallocSupervisorRecipe(source,root),target="scripts/run-installed-chrome-realloc-full.mjs";
  return edit(parent,[['own = "scripts/launch-realloc-supervisor.mjs";',`own = ${JSON.stringify(target)};`],
    ['["scripts/run-realloc-original-full.mjs", ...(mode ===',`[${JSON.stringify(target)}, ...(mode ===`],
    ['"scripts/lib/bounded-supervisor-journal.mjs", "scripts/run-realloc-original-full.mjs",',`"scripts/lib/bounded-supervisor-journal.mjs", ${JSON.stringify(target)},`],
    ["realloc-supervisor","installed-chrome-realloc-supervisor",2]]);
}
