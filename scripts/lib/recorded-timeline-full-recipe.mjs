import assert from "node:assert/strict";
import path from "node:path";
import {pathToFileURL} from "node:url";
import {exactPatch} from "./ebml-reuse-browser-components.mjs";
import {executedFrameTimesBody} from "./timestamp-csv-diagnostic.mjs";
import {deriveUpdatedChromeSupervisor,deriveUpdatedChromeFullStager} from "./updated-chrome-full-recipe.mjs";
import {TIMELINE_DIAGNOSTIC,TIMELINE_REFERENCE} from "./source-timeline-qualification.mjs";
export {deriveUpdatedChromeFullStager};
export function deriveRecordedTimelineDriver(source,root,wrapper,candidateName,extensionFiles) {
  assert.equal(path.dirname(wrapper),path.join(root,"work"));assert.match(path.basename(wrapper),/^recorded-timeline-full-wrapper-[A-Za-z0-9]+$/);
  assert.match(candidateName,/^allocation-attempt-media-[A-Za-z0-9]+$/);assert.ok(extensionFiles.length<=128&&new Set(extensionFiles).size===extensionFiles.length);
  const named=source.replaceAll("updated-chrome-full-wrapper-haSh5X",path.basename(wrapper)).replaceAll("allocation-attempt-media-VmKm1u",candidateName);
  const body=executedFrameTimesBody(source),uri=file=>pathToFileURL(path.join(root,"scripts/lib",file)).href;
  const oldSources="const fullSourceFiles=[...threadedParentSourceFiles,...updatedBrowserExtensionFiles];";
  const newSources=`const executed750ParentSources=[...threadedParentSourceFiles,...updatedBrowserExtensionFiles];assert.equal(executed750ParentSources.length,750);
const recordedTimelineExtensionFiles=${JSON.stringify(extensionFiles)};assert.ok(recordedTimelineExtensionFiles.length<=128);
assert.ok(recordedTimelineExtensionFiles.every(file=>!executed750ParentSources.includes(file)));
const fullSourceFiles=[...executed750ParentSources,...recordedTimelineExtensionFiles];`;
  const marker="const launchJournal=await createFullLaunchJournal({root,file:reportBase+'-launches.json',";
  const setup=`const sourceTimelineQualification=await loadSourceTimelineQualification(root);
frameTimes=createRecordedFrameValidator({root,source,diagnosticProof:sourceTimelineQualification.diagnostic,
  referenceProof:sourceTimelineQualification.reference,frameTimesBody:${JSON.stringify(body)},native,
  ffprobePath:"C:/ffmpeg/bin/ffprobe.exe",reportPrefix:reportBase});
`;
  return exactPatch(source,[[source,named],[oldSources,newSources],[body,"let frameTimes;\n"],
    ['const ownedLaunches = [];',`import {createRecordedFrameValidator} from ${JSON.stringify(uri("recorded-frame-validator.mjs"))};\nimport {loadSourceTimelineQualification} from ${JSON.stringify(uri("source-timeline-qualification.mjs"))};\nconst ownedLaunches = [];`],
    [marker,setup+marker],
    ["    browserVersion, manifest, actualWasmMemoryLimits, sourceHashes,","    sourceTimelineReference:sourceTimelineQualification.referenceBinding, browserVersion, manifest, actualWasmMemoryLimits, sourceHashes,"],
    ['nativeValidation:error.nativeValidation??null,code:error.code??null',
      'frameValidationReceipt:error.frameValidationReceipt??null,nativeValidation:error.nativeValidation??null,code:error.code??null'],
  ]);
}
export function deriveRecordedTimelineSupervisor(source,root) {
  const parent=deriveUpdatedChromeSupervisor(source,root);
  const named=parent.generated.replaceAll("scripts/run-updated-chrome-full.mjs","scripts/run-recorded-timeline-full.mjs")
    .replaceAll("updated-chrome-supervisor","recorded-timeline-supervisor");
  return exactPatch(source,[[source,named]]);
}
export function deriveRecordedTimelineCaller(source,root) {
  const uri=file=>pathToFileURL(path.join(root,"scripts/lib",file)).href;
  const relocated=source.replace(/from "(\.[^"\r\n]+)"/g,(_,file)=>`from ${JSON.stringify(pathToFileURL(path.resolve(root,"scripts",file)).href)}`)
    .replace('import "./lib/reliable-readonly-preflight.mjs";',`import ${JSON.stringify(uri("reliable-readonly-preflight.mjs"))};`);
  const named=relocated.replaceAll("${stamp}-updated-chrome-full-","${stamp}-recorded-timeline-full-")
    .replaceAll("/updated-chrome-full-(?:live|terminal)","/recorded-timeline-full-(?:live|terminal)")
    .replaceAll('"updated-chrome-full-wrapper-"','"recorded-timeline-full-wrapper-"')
    .replaceAll("previous.generated","previous.driver").replaceAll("previous.sourcePins).length,726","previous.pins).length,750")
    .replaceAll("allocation-attempt-full-wrapper-fZzR1b","updated-chrome-full-wrapper-haSh5X");
  return exactPatch(source,[[source,named],
    ['const root=path.resolve(import.meta.dirname,".."),read=',`const root=${JSON.stringify(root)},read=`],
    [`import {deriveUpdatedChromeFullDriver,deriveUpdatedChromeFullStager,deriveUpdatedChromeSupervisor} from ${JSON.stringify(uri("updated-chrome-full-recipe.mjs"))};`,
      `import {deriveRecordedTimelineDriver as deriveUpdatedChromeFullDriver,deriveUpdatedChromeFullStager,deriveRecordedTimelineSupervisor as deriveUpdatedChromeSupervisor} from ${JSON.stringify(uri("recorded-timeline-full-recipe.mjs"))};\nimport {loadSourceTimelineQualification,TIMELINE_RUNTIME_FILES} from ${JSON.stringify(uri("source-timeline-qualification.mjs"))};`],
    [uri("updated-chrome-full-sources.mjs"),uri("recorded-timeline-full-sources.mjs")],
    [`import {materializeLayeredFullSourceArchive} from ${JSON.stringify(uri("threaded-validation-full-sources.mjs"))};`,
      `import {materializeUpdatedFullArchive as materializeLayeredFullSourceArchive} from ${JSON.stringify(uri("updated-chrome-full-sources.mjs"))};`],
    ["  const qualified=await loadUpdatedChromeQualification(root),native=await verifyThreadValidatorQualification(root);",
      "  const qualified=await loadUpdatedChromeQualification(root),native=await verifyThreadValidatorQualification(root),timeline=await loadSourceTimelineQualification(root);"],
    ['  const ownFiles=[','  const ownFiles=[...timeline.files,...TIMELINE_RUNTIME_FILES,'],
    ['    qualifiedBrowser:qualified.reference,','    sourceTimelineReference:timeline.referenceBinding,callerRuntimeDirectory:process.env.WITHIN_RECORDED_TIMELINE_CALLER_DIRECTORY,qualifiedBrowser:qualified.reference,'],
    ['supervisor:supervisor.generated,edits:recipe.edits','supervisor:supervisor.generated,generatedCaller:await readFile(import.meta.filename,"utf8"),edits:recipe.edits'],
    ['    await attempt(async()=>{receipt.nativeQualificationAfter=',
      '    await attempt(async()=>{assert.deepEqual((await loadSourceTimelineQualification(root)).referenceBinding,timeline.referenceBinding);});\n    await attempt(async()=>{receipt.nativeQualificationAfter='],
  ]);
}
export const RECORDED_TIMELINE_PROOF_PATHS=[TIMELINE_DIAGNOSTIC,TIMELINE_REFERENCE];
