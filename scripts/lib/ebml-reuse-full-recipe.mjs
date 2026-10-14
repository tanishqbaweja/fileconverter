// Changed decoder/full adapter with unchanged original acceptance and lifecycle.
import assert from "node:assert/strict";
import { copyFile,readFile,writeFile } from "node:fs/promises";
import path from "node:path";
import { pathToFileURL } from "node:url";
import { gunzipSync } from "node:zlib";
import { sha } from "./stable-ui-headless-baseline-recipe.mjs";
import { assertInstalledChromePinsEqual,inspectInstalledChromePin } from "./installed-chrome-pin.mjs";
import { ebmlMediaParts,inspectEbmlMediaReport,verifyEbmlMediaCandidate } from "./ebml-reuse-media-recipe.mjs";
import { createAttemptPlaneCandidate as createParentCandidate } from "./realloc-full-recipe.mjs";
import { makeInstalledChromeFullCaller as parentCaller,makeInstalledChromeFullDriver as parentDriver,
  makeInstalledChromeFullSupervisor as parentSupervisor } from "./installed-chrome-full-recipe.mjs";
import { exactPatch } from "./ebml-reuse-browser-components.mjs";
export const EBML_FULL_FILES=["scripts/lib/ebml-reuse-full-sources.mjs","scripts/lib/ebml-reuse-full-failure.mjs",
  "scripts/lib/ebml-reuse-full-recipe.mjs","scripts/stage-ebml-reuse-full.mjs","scripts/run-ebml-reuse-full.mjs","tests/ebml-reuse-full.test.mjs"];
const defaultRoot=path.resolve(import.meta.dirname,"../..");
export async function loadQualifiedEbmlMedia(root=defaultRoot) {
  const parts=await ebmlMediaParts(root),read=file=>readFile(path.join(root,file));
  const mediaPath="evidence/2026-10-14T18-18-41-950Z-ebml-reuse-media.json",mediaBytes=await read(mediaPath),proof=JSON.parse(mediaBytes);
  const sealPath="evidence/2026-10-14T18-18-41-950Z-ebml-reuse-independent-qualification.json",sealBytes=await read(sealPath),seal=JSON.parse(sealBytes);
  assert.equal(sha(mediaBytes),seal.media.sha256);assert.equal(proof.failure,null);assert.equal(proof.analysis.genuineValidatedConversions,4);
  assert.equal(seal.allEightOutputHashesMatchGolden,true);assert.equal(seal.fullOriginalAcceptance,false);
  assert.deepEqual(proof.sourcePins,proof.postSourcePins);assert.equal(Object.keys(proof.sourcePins).length,255);
  const restore=async(record,limit)=>{const zip=await read(record.path);assert.equal(zip.length,record.bytes);assert.equal(sha(zip),record.sha256);
    const raw=gunzipSync(zip,{maxOutputLength:limit});assert.equal(raw.length,record.restoredBytes);assert.equal(sha(raw),record.restoredSha256);return JSON.parse(raw);};
  const archive=await restore(proof.generatedArchive,8388608),report=await restore(proof.report.archive,2097152);
  assert.deepEqual(archive.sourcePins,proof.sourcePins);assert.deepEqual(report.manifest,archive.generated.composition.manifest);
  for(const [file,hash]of Object.entries(proof.sourcePins)){assert.equal(sha(archive.sources[file]),hash);assert.equal(sha(await read(file)),hash);}
  const baseline=await read(proof.baseline.path),build=await read(proof.build.path);assert.equal(sha(baseline),proof.baseline.sha256);assert.equal(sha(build),proof.build.sha256);
  assert.deepEqual(await inspectEbmlMediaReport(report,JSON.parse(baseline).reports[0].report,JSON.parse(build)),proof.analysis);
  const supplementPath="evidence/2026-10-14T18-18-41-941Z-ebml-reuse-media-supplement.json",supplementBytes=await read(supplementPath),supplement=JSON.parse(supplementBytes);
  assert.equal(supplement.failure,null);assert.deepEqual(supplement.sourcePins,supplement.postSourcePins);assert.equal(Object.keys(supplement.sourcePins).length,18);
  const extra=await restore(supplement.archive,2097152);assert.deepEqual(extra.sourcePins,supplement.sourcePins);
  for(const [file,hash]of Object.entries(supplement.sourcePins)){assert.equal(sha(Buffer.from(extra.preimages[file],"base64")),hash);assert.equal(sha(await read(file)),hash);}
  assert.deepEqual(archive.generated.ebmlNativeEnvelope,parts.native.envelope);assert.equal(archive.generated.actualEbmlControlWitness,parts.controlPath);
  assertInstalledChromePinsEqual(proof.browserPinBefore,proof.browserPinAfter);assertInstalledChromePinsEqual(proof.browserPinBefore,parts.control.browserPinBefore);
  assertInstalledChromePinsEqual(proof.browserPinBefore,await inspectInstalledChromePin());
  assert.equal(sha(await read(seal.ownSource.path)),seal.ownSource.sha256);
  const stage=archive.generated.stage,start=stage.indexOf("const adapter = "),end=stage.indexOf(";\nconst replacing = ",start);assert.ok(start>0&&end>start);
  const adapter=JSON.parse(stage.slice(start+"const adapter = ".length,end));
  for(const token of ["7037563225465b6bff6f3f17eccc9a2f42033e435d3473101efb631b6736fe25","[4475,4441,4438,4443]","originalBridge.read(offset, destination)","withinAsyncifyStorageClose"])
    assert.ok(adapter.includes(token));
  return {proof,archive,report,pin:proof.browserPinBefore,adapter:{bytes:Buffer.byteLength(adapter),sha256:sha(adapter)},
    allSourcePins:{...proof.sourcePins,...supplement.sourcePins},parts,supplementPath,supplement,
    reference:{path:mediaPath,sha256:sha(mediaBytes),sourceCount:273,independentSeal:{path:sealPath,sha256:sha(sealBytes)},
      supplemental:{path:supplementPath,sha256:sha(supplementBytes)},runtimeVersion:proof.browserPinBefore.version,
      nativeAllocationPolicyChanged:true,encodingIoQualityAndMemoryGatesUnchanged:true}};
}
export const verifyAttemptPlaneCandidate=verifyEbmlMediaCandidate;
export async function createAttemptPlaneCandidate(root,directory) {
  const qualified=await loadQualifiedEbmlMedia(root),previous=await createParentCandidate(root,directory),composition=qualified.archive.generated.composition;
  assert.deepEqual(previous.manifest,qualified.parts.baselineManifest);
  for(const [file,row]of Object.entries(composition.files)) {
    const target=path.join(directory,file);assert.equal(sha(await readFile(target)),previous.manifest.artifacts[file]);
    if(previous.manifest.artifacts[file]===row.sha256)continue;
    if(file==="within-mpeg2-split.mjs") {
      const glue=qualified.archive.generated.ebmlGlueRecipe.generated;assert.equal(Buffer.byteLength(glue),row.bytes);assert.equal(sha(glue),row.sha256);await writeFile(target,glue);
    } else {assert.ok(row.path.startsWith("work/mpeg2-ebml-reuse-38608791023/"));const bytes=await readFile(path.join(root,row.path));
      assert.equal(bytes.length,row.bytes);assert.equal(sha(bytes),row.sha256);await copyFile(path.join(root,row.path),target);}
    assert.equal(sha(await readFile(target)),row.sha256);
  }
  await writeFile(path.join(directory,"build-manifest.json"),JSON.stringify(qualified.report.manifest,null,2)+"\n");
  assert.deepEqual(await verifyEbmlMediaCandidate(root,directory),qualified.report.manifest);
  return {...composition,bytes:Object.values(composition.files).reduce((sum,row)=>sum+row.bytes,0),publicAcceptance:false};
}
export async function makeEbmlFullStager(root,name) {
  assert.match(name,/^allocation-attempt-media-[A-Za-z0-9]+$/);const qualified=await loadQualifiedEbmlMedia(root),oldName=qualified.archive.generated.candidateName;
  return {...exactPatch(qualified.archive.generated.stage,[[JSON.stringify(oldName),JSON.stringify(name)],[`/^${oldName}$/`,`/^${name}$/`]]),
    adapter:qualified.adapter,manifest:qualified.report.manifest,qualifiedMedia:qualified.reference};
}
export async function makeEbmlFullDriver(root,runtime,name,files) {
  const baseProof=JSON.parse(await readFile(path.join(root,"evidence/2026-10-14T16-27-26-406Z-installed-chrome-realloc-original-full-terminal.json")));
  const parentFiles=Object.keys(baseProof.sourcePins);assert.equal(parentFiles.length,508);
  for(const file of parentFiles)assert.ok(files.includes(file),"Retain parent file: "+file);
  const extensionFiles=[...new Set(files.filter(file=>!parentFiles.includes(file)))];assert.ok(extensionFiles.length<=128);
  const parent=await parentDriver(root,runtime,name,parentFiles),qualified=await loadQualifiedEbmlMedia(root),url=file=>pathToFileURL(path.join(root,"scripts/lib",file)).href;
  const beforeHash=JSON.stringify(parent.adapter.sha256),afterHash=JSON.stringify(qualified.adapter.sha256);
  let generated=parent.generated;assert.equal(generated.split(beforeHash).length,3);generated=generated.replaceAll(beforeHash,afterHash);
  const recipe=exactPatch(generated,[[url("realloc-full-recipe.mjs"),url("ebml-reuse-full-recipe.mjs")],
    [url("realloc-full-failure-record.mjs"),url("ebml-reuse-full-failure.mjs")],
    ['["scripts/stage-realloc-full.mjs", "stage"]','["scripts/stage-ebml-reuse-full.mjs", "stage"]'],
    ['["scripts/stage-realloc-full.mjs", "restore"]','["scripts/stage-ebml-reuse-full.mjs", "restore"]'],
    [`assert.equal((await stat(file)).size,${parent.adapter.bytes});`,`assert.equal((await stat(file)).size,${qualified.adapter.bytes});`],
    [`bytes:${parent.adapter.bytes},sha256:`,`bytes:${qualified.adapter.bytes},sha256:`],
    ["-private-mpeg2-installed-chrome-realloc-full-native-100ms","-private-mpeg2-ebml-reuse-full-native-100ms"],
    ["const fullSourceFiles = [...new Set([...sourceFiles,...historicalSourceFiles,...additiveSourceFiles,...legacySourceFiles,...supplementalSourceFiles])];\nassert.equal(fullSourceFiles.length,legacySourceFiles.length+supplementalSourceFiles.length);",
      `const extensionSourceFiles=${JSON.stringify(extensionFiles)};assert.ok(extensionSourceFiles.length<=128);\nconst fullSourceFiles = [...new Set([...sourceFiles,...historicalSourceFiles,...additiveSourceFiles,...legacySourceFiles,...supplementalSourceFiles,...extensionSourceFiles])];\nassert.equal(fullSourceFiles.length,legacySourceFiles.length+supplementalSourceFiles.length+extensionSourceFiles.length);`]]);
  assert.equal(recipe.generated.replaceAll(afterHash,beforeHash).includes(beforeHash),true);
  return {...parent,...recipe,adapter:qualified.adapter,manifest:qualified.report.manifest,qualifiedMedia:qualified.reference,
    codecIoQualityMemoryRepeatAndCleanupGatesChanged:false};
}
export async function makeEbmlFullCaller(root=defaultRoot) {
  const parent=await parentCaller(root),qualified=await loadQualifiedEbmlMedia(root),url=file=>pathToFileURL(path.join(root,"scripts/lib",file)).href;
  const extra=[...new Set([...parent.extraFiles,...Object.keys(qualified.allSourcePins),...EBML_FULL_FILES,
    qualified.reference.path,qualified.reference.independentSeal.path,qualified.supplementPath,qualified.proof.generatedArchive.path,qualified.proof.report.archive.path,
    qualified.supplement.archive.path,qualified.parts.native.proofPath,qualified.parts.native.buildPath,qualified.parts.native.branchPath,
    qualified.parts.native.envelope.archive.path,qualified.parts.controlPath,qualified.parts.control.proof.path,qualified.parts.control.archive.path])];
  let generated=parent.generated;
  const edits=[[url("installed-chrome-full-sources.mjs"),url("ebml-reuse-full-sources.mjs")],
    [`import { loadQualifiedReallocMedia as loadQualifiedAttemptMediaSources } from ${JSON.stringify(url("realloc-full-recipe.mjs"))};`,
      `import { loadQualifiedEbmlMedia as loadQualifiedAttemptMediaSources } from ${JSON.stringify(url("ebml-reuse-full-recipe.mjs"))};`],
    [`import { createAttemptPlaneCandidate, verifyAttemptPlaneCandidate } from ${JSON.stringify(url("realloc-full-recipe.mjs"))};`,
      `import { createAttemptPlaneCandidate, verifyAttemptPlaneCandidate } from ${JSON.stringify(url("ebml-reuse-full-recipe.mjs"))};`],
    [`import { makeInstalledChromeFullDriver as makeAllocationAttemptFullDriver, loadInstalledChromeFullQualification } from ${JSON.stringify(url("installed-chrome-full-recipe.mjs"))};`,
      `import { makeEbmlFullDriver as makeAllocationAttemptFullDriver, loadQualifiedEbmlMedia as loadInstalledChromeFullQualification } from ${JSON.stringify(url("ebml-reuse-full-recipe.mjs"))};`],
    [url("realloc-full-failure-record.mjs"),url("ebml-reuse-full-failure.mjs")],
    ["const callerFiles = [",`const callerFiles = [${extra.map(file=>JSON.stringify(file)).join(",")},`],
    ["historicalFilesRetained: 256, legacyFilesRetained: 380, supplementalFiles: snapshot.supplementalFiles.length, omittedLegacyFiles: 0",
      "historicalFilesRetained:256,parentFilesRetained:508,parentLegacyFilesRetained:380,parentSupplementalFilesRetained:128,extensionFiles:snapshot.extensionFiles.length,omittedLegacyFiles:0"],
    ["|installed-chrome-realloc)-full-live","|installed-chrome-realloc|ebml-reuse)-full-live"],
    ["-installed-chrome-realloc-full-live.json","-ebml-reuse-full-live.json"],
    ["-private-mpeg2-installed-chrome-realloc-full-native-100ms.json","-private-mpeg2-ebml-reuse-full-native-100ms.json"],
    ["${stamp}-installed-chrome-realloc-original-full","${stamp}-ebml-reuse-original-full"]];
  const recipe=exactPatch(generated,edits);
  return {...parent,...recipe,extraFiles:extra,qualifiedBrowser:qualified.reference,originalConversionAcceptanceGatesByteExact:true};
}
export function makeEbmlFullSupervisor(source,root) {
  const parent=parentSupervisor(source,root),before="scripts/run-installed-chrome-realloc-full.mjs",after="scripts/run-ebml-reuse-full.mjs";
  assert.equal(parent.generated.split(before).length-1,3);
  const generated=parent.generated.replaceAll(before,after).replaceAll("installed-chrome-realloc-supervisor","ebml-reuse-supervisor");
  assert.equal(generated.replaceAll(after,before).replaceAll("ebml-reuse-supervisor","installed-chrome-realloc-supervisor"),parent.generated);
  return {...parent,generated,generatedSha256:sha(generated),publicAcceptance:false};
}
