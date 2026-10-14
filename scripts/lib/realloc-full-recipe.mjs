// Fresh full-original harness, EXACT qualified249-source decoder/glue/observer.
// No changed input, codec/quality/settings/heap/IO/250MiB/repeat/cleanup gates.
import assert from "node:assert/strict";
import { copyFile,readFile,writeFile } from "node:fs/promises";
import path from "node:path";
import { pathToFileURL } from "node:url";
import { gunzipSync } from "node:zlib";
import { sha } from "./stable-ui-headless-baseline-recipe.mjs";
import { inspectReallocMediaReport } from "./realloc-media-report-inspector.mjs";
import { verifyReallocMediaCandidate } from "./realloc-media-recipe.mjs";
import { reallocMediaComponents } from "./realloc-media-components.mjs";
import { createAttemptPlaneCandidate as createPreviousCandidate,makeLargestIdleFullCaller,makeLargestIdleFullDriver } from "./packet-largest-idle-full-recipe.mjs";
import { REALLOC_FULL_MEDIA_RECEIPT,PREVIOUS_LARGEST_IDLE_FULL_RECEIPT,loadPreviousLargestIdleFullSources,SUPPLEMENTAL_LIMITS } from "./realloc-full-sources.mjs";
const rootDefault=path.resolve(import.meta.dirname,"../..");
export const REALLOC_FULL_FILES=["scripts/lib/realloc-full-recipe.mjs","scripts/lib/realloc-full-sources.mjs","scripts/lib/realloc-full-failure-record.mjs",
  "scripts/stage-realloc-full.mjs","scripts/run-realloc-original-full.mjs","scripts/launch-realloc-supervisor.mjs","scripts/lib/realloc-supervisor-recipe.mjs",
  "tests/realloc-full.test.mjs","tests/realloc-full-failure-record.test.mjs"];
function edit(parent,edits) {
  let generated=parent.generated;for(const [before,after,count=1] of edits){assert.notEqual(before,after);assert.equal(generated.split(before).length-1,count,before.slice(0,150));generated=generated.replaceAll(before,after);}
  let reverse=generated;for(const [before,after,count=1] of edits.toReversed()){assert.equal(reverse.split(after).length-1,count);reverse=reverse.replaceAll(after,before);}
  assert.equal(reverse,parent.generated,"Only real candidate/observer/source/identity edits; every original acceptance gate retained");
  return {...parent,generated,generatedSha256:sha(generated),parentGeneratedSha256:sha(parent.generated),reallocEdits:edits,
    originalConversionAcceptanceGatesByteExact:true,publicAcceptance:false,fullOriginalAcceptance:false,speedGainProven:false};
}
export async function loadQualifiedReallocMedia(root=rootDefault) {
  const read=file=>readFile(path.join(root,file)),bytes=await read(REALLOC_FULL_MEDIA_RECEIPT),proof=JSON.parse(bytes);
  assert.equal(sha(bytes),"2ebbeb5c9065683cf4f6a94c5343a76c6a12d75eea2dc6f5161e2fc77e8ed549");assert.equal(proof.failure,null);assert.equal(proof.analysis.genuineValidatedConversions,4);
  assert.equal(Object.keys(proof.sourcePins).length,249);assert.deepEqual(proof.sourcePins,proof.postSourcePins);
  const restore=async(row,maximum)=>{const zip=await read(row.path);assert.equal(zip.length,row.bytes);assert.equal(sha(zip),row.sha256);
    const raw=gunzipSync(zip,{maxOutputLength:maximum});assert.equal(raw.length,row.restoredBytes);assert.equal(sha(raw),row.restoredSha256);return JSON.parse(raw);};
  const archive=await restore(proof.generatedArchive,8388608),report=await restore(proof.report.archive,2097152);
  assert.deepEqual(archive.sourcePins,proof.sourcePins);for(const [file,hash] of Object.entries(proof.sourcePins)){assert.equal(sha(archive.sources[file]),hash,file);assert.equal(sha(await read(file)),hash,file);}
  const baseline=await read(proof.baseline.path),build=await read(proof.build.path);assert.equal(sha(baseline),proof.baseline.sha256);assert.equal(sha(build),proof.build.sha256);
  assert.deepEqual(inspectReallocMediaReport(report,JSON.parse(baseline).reports[0].report,JSON.parse(build)),proof.analysis);assert.deepEqual(archive.generated.composition.manifest,report.manifest);
  const parts=await reallocMediaComponents(root);assert.equal(report.manifest.artifacts["within-mpeg2-split.wasm"],parts.build.manifest.artifacts["within-mpeg2-split.wasm"]);
  const independentFile="evidence/2026-10-14T09-09-29-345Z-journaled-realloc-media-independent-qualification.json",independentBytes=await read(independentFile),independent=JSON.parse(independentBytes);
  assert.equal(sha(independentBytes),"0b65658817244df549b3c5046d814fb1fccc227482cb07a12d3f8759791bf838");assert.equal(independent.receipt.sha256,sha(bytes));assert.equal(independent.allEightIndependentOutputHashesMatch,true);
  assert.equal(sha(await read(independent.ownSource.path)),independent.ownSource.sha256);
  const stage=archive.generated.stage,start=stage.indexOf("const adapter = "),end=stage.indexOf(";\nconst replacing = ",start);assert.ok(start>=0&&end>start);
  const adapterSource=JSON.parse(stage.slice(start+"const adapter = ".length,end));
  for(const token of ["qualifiedReallocCallPath","createCompositeAllocationAbortCapture","originalBridge.read(offset, destination)","withinAsyncifyStorageClose",parts.build.manifest.artifacts["within-mpeg2-split.wasm"]])assert.ok(adapterSource.includes(token),token);
  return {proof,archive,report,adapter:{bytes:Buffer.byteLength(adapterSource),sha256:sha(adapterSource)},reference:{path:REALLOC_FULL_MEDIA_RECEIPT,sha256:sha(bytes),sourceCount:249}};
}
export const verifyAttemptPlaneCandidate=verifyReallocMediaCandidate;
export async function createAttemptPlaneCandidate(root,directory) {
  const qualified=await loadQualifiedReallocMedia(root),previous=await createPreviousCandidate(root,directory),composition=qualified.archive.generated.composition;
  for(const [file,row] of Object.entries(composition.files)) {
    const target=path.join(directory,file);assert.equal(sha(await readFile(target)),previous.manifest.artifacts[file],file);
    if(previous.manifest.artifacts[file]===row.sha256)continue;
    if(file==="within-mpeg2-split.mjs") {
      const glue=qualified.archive.generated.asyncifyGlueRecipe.generated;assert.equal(Buffer.byteLength(glue),row.bytes);assert.equal(sha(glue),row.sha256);await writeFile(target,glue);
    } else {assert.ok(row.path.startsWith("work/mpeg2-realloc-attempt-38526781934/"));const bytes=await readFile(path.join(root,row.path));
      assert.equal(bytes.length,row.bytes);assert.equal(sha(bytes),row.sha256);await copyFile(path.join(root,row.path),target);}
    assert.equal(sha(await readFile(target)),row.sha256);
  }
  await writeFile(path.join(directory,"build-manifest.json"),JSON.stringify(qualified.report.manifest,null,2)+"\n");
  assert.deepEqual(await verifyReallocMediaCandidate(root,directory),qualified.report.manifest);
  return {...composition,bytes:Object.values(composition.files).reduce((total,row)=>total+row.bytes,0),publicAcceptance:false};
}
export async function makeReallocFullStager(root,name) {
  assert.match(name,/^allocation-attempt-media-[A-Za-z0-9]+$/);const qualified=await loadQualifiedReallocMedia(root),oldName=qualified.archive.generated.candidateName;
  return {...edit({generated:qualified.archive.generated.stage},[[JSON.stringify(oldName),JSON.stringify(name)],[`/^${oldName}$/`,`/^${name}$/`]]),
    adapter:qualified.adapter,manifest:qualified.report.manifest,qualifiedMedia:qualified.reference};
}
export async function makeReallocFullDriver(root,runtime,name,files) {
  const parent=await makeLargestIdleFullDriver(root,runtime,name,files),qualified=await loadQualifiedReallocMedia(root),url=file=>pathToFileURL(path.join(root,"scripts/lib",file)).href;
  return {...edit(parent,[
    [url("packet-largest-idle-full-recipe.mjs"),url("realloc-full-recipe.mjs")],[url("packet-largest-idle-full-failure.mjs"),url("realloc-full-failure-record.mjs")],
    ['["scripts/stage-packet-largest-idle-full.mjs", "stage"]','["scripts/stage-realloc-full.mjs", "stage"]'],
    ['["scripts/stage-packet-largest-idle-full.mjs", "restore"]','["scripts/stage-realloc-full.mjs", "restore"]'],
    [`assert.equal((await stat(file)).size,${parent.adapter.bytes});`,`assert.equal((await stat(file)).size,${qualified.adapter.bytes});`],
    [JSON.stringify(parent.adapter.sha256),JSON.stringify(qualified.adapter.sha256),2],
    [`bytes:${parent.adapter.bytes},sha256:`,`bytes:${qualified.adapter.bytes},sha256:`],
    ["-private-mpeg2-packet-largest-idle-full-native-100ms","-private-mpeg2-realloc-full-native-100ms"],
  ]),adapter:qualified.adapter,manifest:qualified.report.manifest,qualifiedMedia:qualified.reference,sourceEnvelopeLimits:SUPPLEMENTAL_LIMITS};
}
export async function makeReallocFullCaller(root=rootDefault) {
  const parent=await makeLargestIdleFullCaller(root),previous=await loadPreviousLargestIdleFullSources(root),url=file=>pathToFileURL(path.join(root,"scripts/lib",file)).href;
  const extra=[...new Set([...parent.extraFiles,...Object.keys(previous.proof.sourcePins),...REALLOC_FULL_FILES,PREVIOUS_LARGEST_IDLE_FULL_RECEIPT,previous.proof.sourceArchive.path,
    "evidence/2026-10-14T09-09-29-345Z-journaled-realloc-media-independent-qualification.json","scripts/verify-journaled-realloc-media-evidence.mjs"] )];
  return {...edit(parent,[
    [url("packet-largest-idle-full-sources.mjs"),url("realloc-full-sources.mjs")],
    [`import { loadQualifiedLargestIdleMedia as loadQualifiedAttemptMediaSources } from ${JSON.stringify(url("packet-largest-idle-full-recipe.mjs"))};`,
      `import { loadQualifiedReallocMedia as loadQualifiedAttemptMediaSources } from ${JSON.stringify(url("realloc-full-recipe.mjs"))};`],
    [`import { makeLargestIdleFullDriver as makeAllocationAttemptFullDriver } from ${JSON.stringify(url("packet-largest-idle-full-recipe.mjs"))};`,
      `import { makeReallocFullDriver as makeAllocationAttemptFullDriver } from ${JSON.stringify(url("realloc-full-recipe.mjs"))};`],
    [`import { createAttemptPlaneCandidate, verifyAttemptPlaneCandidate } from ${JSON.stringify(url("packet-largest-idle-full-recipe.mjs"))};`,
      `import { createAttemptPlaneCandidate, verifyAttemptPlaneCandidate } from ${JSON.stringify(url("realloc-full-recipe.mjs"))};`],
    [url("packet-largest-idle-full-failure.mjs"),url("realloc-full-failure-record.mjs")],
    ["const callerFiles = [",`const callerFiles = [${extra.map(file=>JSON.stringify(file)).join(",")},`],
    ["|packet-largest-idle)-full-live","|packet-largest-idle|realloc)-full-live"],
    ["-packet-largest-idle-full-live.json","-realloc-full-live.json"],
    ["-private-mpeg2-packet-largest-idle-full-native-100ms.json","-private-mpeg2-realloc-full-native-100ms.json"],
    ["${stamp}-packet-largest-idle-original-full","${stamp}-realloc-original-full"],
  ]),extraFiles:extra};
}
