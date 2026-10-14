// Preserve all four production conversion/validator/recovery cases. New decoder
// and actual typed observer only; same plane encoder, I/O, q4 and fixed heaps.
import assert from "node:assert/strict";
import { copyFile, readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import { pathToFileURL } from "node:url";
import { gunzipSync } from "node:zlib";
import { sha } from "./stable-ui-headless-baseline-recipe.mjs";
import { assertInstalledChromePinsEqual } from "./installed-chrome-pin.mjs";
import { makeInstalledChromeMediaBrowserRecipe } from "./installed-chrome-realloc-recipe.mjs";
import { REALLOC_MEDIA_INSPECTOR_SOURCE } from "./realloc-media-report-inspector.mjs";
import { exactPatch, verifyEbmlNative, makeEbmlObservers, EBML_DECODER_SHA256, EBML_TOOL_DIRECTORY } from "./ebml-reuse-browser-components.mjs";
const oldSha = "eb45bb276b139f0c0404079c2087d06dfa0f629c400d3f18f5a28ead78521e3c";
const exclude = new Set(["build-manifest.json","split-encoder.mjs","split-encoder.wasm","encoder-initialization.json","within-mpeg2-split.mjs"]);
const baselinePath = "evidence/2026-10-14T15-36-28-196Z-installed-chrome-realloc-media.json";
export async function ebmlMediaParts(root) {
  const read = file => readFile(path.join(root,file));
  const native = await verifyEbmlNative(root), observers = await makeEbmlObservers(root,native);
  const controlPath = process.env.WITHIN_EBML_REUSE_CONTROL_RECEIPT;
  assert.match(controlPath??"",/^evidence\/\d{4}-\d\d-\d\dT[\d-]+Z-ebml-reuse-browser-control-executed-sources\.json$/);
  const controlBytes=await read(controlPath), control=JSON.parse(controlBytes);
  assert.equal(control.failure,null);assert.equal(control.proof.status,"passed-synthetic-abort-control");
  assert.deepEqual(control.sourcePins,control.postSourcePins);assert.deepEqual(control.nativeEnvelope,native.envelope);
  assert.deepEqual(control.nativeEnvelopePost,native.envelope);assertInstalledChromePinsEqual(control.browserPinBefore,control.browserPinAfter);
  const controlProofBytes=await read(control.proof.path), controlProof=JSON.parse(controlProofBytes);
  assert.equal(sha(controlProofBytes),control.proof.sha256);assert.equal(controlProof.status,"passed-synthetic-abort-control");
  assert.equal(controlProof.browserVersion,control.browserPinBefore.version);assert.equal(controlProof.exportOnlyControl.originalSha256,EBML_DECODER_SHA256);
  assert.equal(controlProof.cleanup.allSampledNativeBirthsAbsent,true);assert.equal(controlProof.cleanup.runtimeProfileRemoved,true);
  const unpack=async record=>{const zipped=await read(record.path);assert.equal(zipped.length,record.bytes);assert.equal(sha(zipped),record.sha256);
    const raw=gunzipSync(zipped,{maxOutputLength:8388608});assert.equal(raw.length,record.restoredBytes);assert.equal(sha(raw),record.restoredSha256);return JSON.parse(raw);};
  const controlArchive=await unpack(control.archive);assert.deepEqual(controlArchive.sourcePins,control.sourcePins);
  for(const [file,hash]of Object.entries(control.sourcePins)) {assert.equal(sha(Buffer.from(controlArchive.preimages[file],"base64")),hash);assert.equal(sha(await read(file)),hash);}
  const baselineBytes=await read(baselinePath);assert.equal(sha(baselineBytes),"fbcea9865553d330e001acee987d2b9baf9df199a835fb275980e8dafdefe47c");
  const baseline=JSON.parse(baselineBytes);assert.equal(baseline.failure,null);assert.equal(baseline.analysis.genuineValidatedConversions,4);
  assert.deepEqual(baseline.sourcePins,baseline.postSourcePins);
  const baselineArchive=await unpack(baseline.generatedArchive);assert.deepEqual(baselineArchive.sourcePins,baseline.sourcePins);
  for(const [file,hash]of Object.entries(baseline.sourcePins)) {assert.equal(sha(baselineArchive.sources[file]),hash);assert.equal(sha(await read(file)),hash);}
  const baselineManifest=baselineArchive.generated.composition.manifest;
  assert.equal(baselineManifest.artifacts["within-mpeg2-split.wasm"],oldSha);
  const originalGlue=(await read(`${EBML_TOOL_DIRECTORY}/within-mpeg2-split.mjs`)).toString();
  const glueSource=(await read("scripts/lib/asyncify-storage-glue-recipe.mjs")).toString();
  assert.equal(sha(glueSource),"0d67de895ae2bb052fd9d1101a8723ce69f3828f8d9e1517ff75444bcfc468d0");
  const glueRecipe=exactPatch(glueSource,[["c819ad21398ebf90dac4b58588969221cdcf21ef0d208492cc43c81dd923f85a",sha(originalGlue)]]);
  const glueFactorySource=glueRecipe.generated.replace(/from "(\.[^"\r\n]+)"/g,(_,file)=>`from ${JSON.stringify(pathToFileURL(path.resolve(root,"scripts/lib",file)).href)}`);
  const glueFactory=await import("data:text/javascript;base64,"+Buffer.from(glueFactorySource).toString("base64"));
  const glue=glueFactory.makeAsyncifyStorageGlue(originalGlue);assert.equal(glue.edits.length,4);
  assert.equal(glue.originalSha256,native.build.manifest.artifacts["within-mpeg2-split.mjs"]);
  assert.equal(glue.heapLimitsChanged,false);assert.equal(glue.stackSizeChanged,false);assert.equal(glue.nativeWasmChanged,false);
  const inspectorRecipe=exactPatch(REALLOC_MEDIA_INSPECTOR_SOURCE,[[oldSha,EBML_DECODER_SHA256]]);
  const inspector=await import("data:text/javascript;base64,"+Buffer.from(inspectorRecipe.generated).toString("base64"));
  return {native,observers,controlPath,controlBytes,control,controlProof,baseline,baselinePath,baselineBytes,baselineManifest,
    glue,glueRecipe,glueFactorySource,inspectorRecipe,inspect:inspector.inspectLargestIdleMediaReport};
}
export function expectedEbmlManifest(parts) {
  const {native,baselineManifest,glue}=parts, manifest=structuredClone(baselineManifest);
  for(const row of native.build.files)if(!exclude.has(row.file))manifest.artifacts[row.file]=row.sha256;
  manifest.artifacts["within-mpeg2-split.mjs"]=glue.generatedSha256;
  for(const [file,hash]of Object.entries(native.build.manifest.sources)) {
    if(file===".github/workflows/reproduce-ffmpeg-nondocker.yml")continue;
    if(manifest.sources[file])assert.equal(manifest.sources[file],hash);manifest.sources[file]=hash;
  }
  const cache=structuredClone(manifest.packetCache);
  for(const key of ["generatedOuterBuilder","generatedHevcWrapper"]) {
    cache[key]=exactPatch(cache[key],[["mpeg2-realloc-builder-recipe.mjs","mpeg2-ebml-reuse-builder-recipe.mjs"]]).generated;
    cache[key+"Sha256"]=sha(cache[key]);
  }
  assert.deepEqual(cache,native.build.manifest.packetCache);manifest.packetCache=cache;
  assert.deepEqual(manifest.packetLargestIdle,native.build.manifest.packetLargestIdle);
  assert.deepEqual(manifest.reallocAttempt,native.build.manifest.reallocAttempt);
  manifest.ebmlReuse=native.build.manifest.ebmlReuse;
  manifest.asyncifyStorage={...manifest.asyncifyStorage,originalGlueSha256:glue.originalSha256,generatedGlueSha256:glue.generatedSha256};
  manifest.provenance.decoder={run:native.build.run.databaseId,commit:native.build.run.headSha,
    workflowSha256:native.build.manifest.sources[".github/workflows/reproduce-ffmpeg-nondocker.yml"],buildPath:native.buildPath,buildSha256:sha(native.buildBytes)};
  manifest.componentProofs.decoder={path:native.buildPath,sha256:sha(native.buildBytes)};
  manifest.componentProofs.compositeObserver=parts.control.proof;manifest.componentProofs.nativeExecutedSources=native.envelope;
  manifest.reallocComposition={...manifest.reallocComposition,actualCompositeControl:{path:parts.controlPath,sha256:sha(parts.controlBytes)},
    observerTypedFunctions:native.functions};
  manifest.ebmlReuseComposition={previousMedia:{path:baselinePath,sha256:sha(parts.baselineBytes)},actualControl:parts.control.proof,
    nativeEnvelope:native.envelope,observerRecipes:parts.observers.recipes,glueRecipe:parts.glueRecipe,
    settingsEncoderHeapsIoQualityUnchanged:true,exportOnlyControlNotUsedForMedia:true,publicAcceptance:false};
  return manifest;
}
export async function verifyEbmlMediaCandidate(root,directory) {
  assert.equal(path.dirname(directory),path.join(root,"work"));const parts=await ebmlMediaParts(root);
  const manifest=JSON.parse(await readFile(path.join(directory,"build-manifest.json")));assert.deepEqual(manifest,expectedEbmlManifest(parts));
  assert.equal(manifest.artifacts["within-mpeg2-split.wasm"],EBML_DECODER_SHA256);
  assert.equal(manifest.artifacts["split-encoder.wasm"],"a4ba6225414ca7a658d349ae81926e5ed040fa73be4540fe8a7adf7656fe1cee");
  assert.equal(manifest.aggregateWasmMemoryBytes,50331648);assert.equal(manifest.allowMemoryGrowth,false);
  assert.equal(manifest.asyncifyStorage.reservationBytes,262156);assert.equal(manifest.asyncifyStorage.maximumLeases,1);
  for(const [file,hash]of Object.entries(manifest.artifacts))assert.equal(sha(await readFile(path.join(directory,file))),hash);
  return manifest;
}
function inline(source) {return source.replace(/^import[^;]+;\n/gm,"").replaceAll("export function ","function ").replaceAll("export const ","const ");}
export async function makeEbmlMediaBrowserRecipe(sources,root,runtime,stamp,branch,build) {
  const parts=await ebmlMediaParts(root),old=await makeInstalledChromeMediaBrowserRecipe(sources,root,runtime,stamp,branch,build);
  assert.deepEqual(old.composition.manifest,parts.baselineManifest);assertInstalledChromePinsEqual(old.browserPin,parts.control.browserPinBefore);
  const manifest=expectedEbmlManifest(parts),files=structuredClone(old.composition.files);
  for(const row of parts.native.build.files) {
    if(exclude.has(row.file))continue;const target=path.join(runtime,row.file);
    assert.equal(sha(await readFile(target)),old.composition.manifest.artifacts[row.file]);
    await copyFile(path.join(root,EBML_TOOL_DIRECTORY,row.file),target);assert.equal(sha(await readFile(target)),row.sha256);
    files[row.file]={path:`${EBML_TOOL_DIRECTORY}/${row.file}`,bytes:row.bytes,sha256:row.sha256};
  }
  const glueTarget=path.join(runtime,"within-mpeg2-split.mjs");assert.equal(sha(await readFile(glueTarget)),old.composition.manifest.artifacts["within-mpeg2-split.mjs"]);
  await writeFile(glueTarget,parts.glue.generated);files["within-mpeg2-split.mjs"]={path:"derived-at-runtime",bytes:Buffer.byteLength(parts.glue.generated),sha256:parts.glue.generatedSha256};
  await writeFile(path.join(runtime,"build-manifest.json"),JSON.stringify(manifest,null,2)+"\n");await verifyEbmlMediaCandidate(root,runtime);
  const names=Object.keys(parts.observers.files);
  const oldPrefix=(await Promise.all(names.map(file=>readFile(path.join(root,"scripts/lib",file),"utf8")))).map(inline).join("\n")+"\n";
  // Match the qualified parent's explicit order, not object insertion order.
  const order=["realloc-aligned-attempt-snapshot.mjs","realloc-attempt-abort-capture.mjs","realloc-composite-abort-capture.mjs","realloc-allocation-abort-capture.mjs"];
  const priorPrefix=(await Promise.all(order.map(file=>readFile(path.join(root,"scripts/lib",file),"utf8")))).map(inline).join("\n")+"\n";
  assert.ok(oldPrefix.length===priorPrefix.length);
  const newPrefix=order.map(file=>inline(parts.observers.files[file])).join("\n")+"\n";
  const start=old.stage.indexOf("const adapter = "),end=old.stage.indexOf(";\nconst replacing = ",start);assert.ok(start>0&&end>start);
  const literal=old.stage.slice(start+"const adapter = ".length,end),adapter=JSON.parse(literal);
  let updated=exactPatch(adapter,[[priorPrefix,newPrefix],[`qualifiedBinarySha256: "${oldSha}"`,`qualifiedBinarySha256: "${EBML_DECODER_SHA256}"`]]).generated;
  let stage=exactPatch(old.stage,[[literal,JSON.stringify(updated)],
    [`import { verifyReallocMediaCandidate } from ${JSON.stringify(pathToFileURL(path.join(root,"scripts/lib/realloc-media-recipe.mjs")).href)};`,
      `import { verifyEbmlMediaCandidate } from ${JSON.stringify(pathToFileURL(path.join(root,"scripts/lib/ebml-reuse-media-recipe.mjs")).href)};`],
    ["await verifyReallocMediaCandidate(root, source);","await verifyEbmlMediaCandidate(root, source);"]]).generated;
  return {...old,stage,composition:{...old.composition,manifest,files},ebmlNativeEnvelope:parts.native.envelope,
    actualEbmlControlWitness:parts.controlPath,observerRecipes:parts.observers.recipes,ebmlGlueRecipe:parts.glue,
    publicAcceptance:false};
}
export async function inspectEbmlMediaReport(report,baseline,build) {
  const parts=await ebmlMediaParts(path.resolve(import.meta.dirname,"../.."));
  return parts.inspect(report,baseline,build);
}
