// Fresh genuine production media qualification; not the export-only control.
import assert from "node:assert/strict";
import { copyFile, readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import { pathToFileURL } from "node:url";
import { sha } from "./stable-ui-headless-baseline-recipe.mjs";
import { largestIdleMediaSourceFiles, makeLargestIdleMediaBrowserRecipe, makeLargestIdleMediaCaller, verifyLargestIdleMediaCandidate } from "./packet-largest-idle-media-recipe.mjs";
import { reallocMediaComponents, REALLOC_TOOL_DIRECTORY } from "./realloc-media-components.mjs";
import { REALLOC_DECODER_SHA256 } from "./realloc-attempt-abort-capture.mjs";
export { inspectReallocMediaReport } from "./realloc-media-report-inspector.mjs";
const oldSha="7bb58a363d81030d38a8dc3187dc0adf541b77385f06bc0c576225ba29f78439";
const excluded=new Set(["build-manifest.json","split-encoder.mjs","split-encoder.wasm","encoder-initialization.json","within-mpeg2-split.mjs"]);
function once(source,before,after) {assert.equal(source.split(before).length,2,before.slice(0,120));return source.replace(before,after);}
function inline(source) {return source.replace(/^import[^;]+;\n/gm,"").replaceAll("export function ","function ").replaceAll("export const ","const ");}
export async function reallocMediaSourceFiles(root) {
  const parts=await reallocMediaComponents(root);
  const files=[...new Set([...await largestIdleMediaSourceFiles(root),...Object.keys(parts.previous.sourcePins),...Object.keys(parts.witness.sourcePins),
    parts.previousPath,parts.witnessPath,parts.witness.proof.path,"scripts/lib/realloc-media-components.mjs","scripts/lib/realloc-media-report-inspector.mjs",
    "scripts/lib/realloc-media-recipe.mjs","scripts/qualify-realloc-media.mjs","tests/realloc-media.test.mjs"])];
  assert.ok(files.length<=256,"Retain previous and new executed closure; do not raise cap or drop sources");return files;
}
function expectedManifest(parts) {
  const {baselineManifest,build,glue,envelope}=parts,manifest=structuredClone(baselineManifest);
  assert.equal(manifest.artifacts["within-mpeg2-split.wasm"],oldSha);
  for(const file of build.files) if(!excluded.has(file.file))manifest.artifacts[file.file]=file.sha256;
  manifest.artifacts["within-mpeg2-split.mjs"]=glue.generatedSha256;
  for(const [file,hash] of Object.entries(build.manifest.sources)) {
    if(file===".github/workflows/reproduce-ffmpeg-nondocker.yml")continue;
    if(manifest.sources[file])assert.equal(manifest.sources[file],hash,file);manifest.sources[file]=hash;
  }
  // These two generated wrappers import the new diagnostic builder. All other
  // packet policy/kernel/native lifecycle bytes must remain identical.
  const expectedPacketCache=structuredClone(manifest.packetCache);
  for(const key of ["generatedOuterBuilder","generatedHevcWrapper"]) {
    const original=expectedPacketCache[key];assert.equal(original.split("mpeg2-packet-largest-idle-builder-recipe.mjs").length,2);
    expectedPacketCache[key]=original.replace("mpeg2-packet-largest-idle-builder-recipe.mjs","mpeg2-realloc-builder-recipe.mjs");
    expectedPacketCache[key+"Sha256"]=sha(expectedPacketCache[key]);
  }
  assert.deepEqual(expectedPacketCache,build.manifest.packetCache);manifest.packetCache=build.manifest.packetCache;
  assert.deepEqual(manifest.packetLargestIdle,build.manifest.packetLargestIdle);
  manifest.reallocAttempt=build.manifest.reallocAttempt;
  manifest.asyncifyStorage={...manifest.asyncifyStorage,originalGlueSha256:glue.originalSha256,generatedGlueSha256:glue.generatedSha256};
  manifest.provenance.decoder={run:build.run.databaseId,commit:build.run.headSha,workflowSha256:build.manifest.sources[".github/workflows/reproduce-ffmpeg-nondocker.yml"],
    buildPath:parts.buildPath,buildSha256:sha(parts.buildBytes)};
  manifest.componentProofs.decoder={path:parts.buildPath,sha256:sha(parts.buildBytes)};
  manifest.componentProofs.compositeObserver={...parts.witness.proof};manifest.componentProofs.nativeExecutedSources=envelope;
  manifest.reallocComposition={previousMedia:{path:parts.previousPath,sha256:sha(parts.previousBytes)},
    actualCompositeControl:{path:parts.witnessPath,sha256:sha(parts.witnessBytes)},glueRecipe:glue.recipeSource,
    observerTypedFunctions:parts.observerTypedFunctions,exportOnlyControlNotUsedForMedia:true,
    settingsEncoderHeapsIoQualityUnchanged:true,publicAcceptance:false};
  return manifest;
}
export async function verifyReallocMediaCandidate(root,directory) {
  assert.equal(path.dirname(directory),path.join(root,"work"));const parts=await reallocMediaComponents(root);
  const manifest=JSON.parse(await readFile(path.join(directory,"build-manifest.json")));assert.deepEqual(manifest,expectedManifest(parts));
  assert.equal(manifest.artifacts["within-mpeg2-split.wasm"],REALLOC_DECODER_SHA256);
  assert.equal(manifest.artifacts["split-encoder.wasm"],"a4ba6225414ca7a658d349ae81926e5ed040fa73be4540fe8a7adf7656fe1cee");
  assert.equal(manifest.asyncifyStorage.reservationBytes,262156);assert.equal(manifest.asyncifyStorage.maximumLeases,1);
  assert.equal(manifest.aggregateWasmMemoryBytes,50331648);assert.equal(manifest.allowMemoryGrowth,false);
  for(const [file,hash] of Object.entries(manifest.artifacts))assert.equal(sha(await readFile(path.join(directory,file))),hash,file);
  return manifest;
}
export async function makeReallocMediaBrowserRecipe(sources,root,runtime,stamp,branch,build) {
  const old=await makeLargestIdleMediaBrowserRecipe(sources,root,runtime,stamp,branch,build);
  await verifyLargestIdleMediaCandidate(root,runtime);const parts=await reallocMediaComponents(root);
  assert.deepEqual(old.composition.manifest,parts.baselineManifest);
  const manifest=expectedManifest(parts),files=structuredClone(old.composition.files);
  for(const row of parts.build.files) {
    if(excluded.has(row.file))continue;
    const target=path.join(runtime,row.file);assert.equal(sha(await readFile(target)),old.composition.manifest.artifacts[row.file]);
    await copyFile(path.join(root,REALLOC_TOOL_DIRECTORY,row.file),target);assert.equal(sha(await readFile(target)),row.sha256);
    files[row.file]={path:`${REALLOC_TOOL_DIRECTORY}/${row.file}`,bytes:row.bytes,sha256:row.sha256};
  }
  const glueTarget=path.join(runtime,"within-mpeg2-split.mjs");assert.equal(sha(await readFile(glueTarget)),old.composition.manifest.artifacts["within-mpeg2-split.mjs"]);
  await writeFile(glueTarget,parts.glue.generated);
  files["within-mpeg2-split.mjs"]={path:"derived-at-runtime",bytes:Buffer.byteLength(parts.glue.generated),sha256:parts.glue.generatedSha256};
  await writeFile(path.join(runtime,"build-manifest.json"),JSON.stringify(manifest,null,2)+"\n");await verifyReallocMediaCandidate(root,runtime);
  const read=name=>readFile(path.join(root,"scripts/lib",name),"utf8");
  const oldPrefix=inline(await read("packet-largest-idle-attempt-abort-capture.mjs"))+"\n"+inline(await read("packet-largest-idle-composite-abort-capture.mjs"))+"\n";
  const newPrefix=(await Promise.all(["realloc-aligned-attempt-snapshot.mjs","realloc-attempt-abort-capture.mjs","realloc-composite-abort-capture.mjs","realloc-allocation-abort-capture.mjs"].map(read))).map(inline).join("\n")+"\n";
  const start=old.stage.indexOf("const adapter = "),end=old.stage.indexOf(";\nconst replacing = ",start);assert.ok(start>0&&end>start);
  const literal=old.stage.slice(start+"const adapter = ".length,end),adapter=JSON.parse(literal);
  let updated=once(adapter,oldPrefix,newPrefix);updated=once(updated,`qualifiedBinarySha256: "${oldSha}"`,`qualifiedBinarySha256: "${REALLOC_DECODER_SHA256}"`);
  let stage=once(old.stage,literal,JSON.stringify(updated));
  const oldUrl=pathToFileURL(path.join(root,"scripts/lib/packet-largest-idle-media-recipe.mjs")).href,newUrl=pathToFileURL(path.join(root,"scripts/lib/realloc-media-recipe.mjs")).href;
  stage=once(stage,`import { verifyLargestIdleMediaCandidate } from ${JSON.stringify(oldUrl)};`,`import { verifyReallocMediaCandidate } from ${JSON.stringify(newUrl)};`);
  stage=once(stage,"await verifyLargestIdleMediaCandidate(root, source);","await verifyReallocMediaCandidate(root, source);");
  return {...old,stage,composition:{...old.composition,manifest,files},asyncifyGlueRecipe:parts.glue,
    unchangedNativeDecoderUsed:true,qualifiedReallocFailureCapture:true,publicAcceptance:false};
}
export function makeReallocMediaCaller(source,root) {
  const old=makeLargestIdleMediaCaller(source,root),oldUrl=pathToFileURL(path.join(root,"scripts/lib/packet-largest-idle-media-recipe.mjs")).href,
    newUrl=pathToFileURL(path.join(root,"scripts/lib/realloc-media-recipe.mjs")).href;
  let generated=once(old.generated,`import { makeLargestIdleMediaBrowserRecipe as makeSingleIdleBrowserRecipe, inspectLargestIdleMediaReport as verifySingleIdleGoldenReport } from ${JSON.stringify(oldUrl)};`,
    `import { makeReallocMediaBrowserRecipe as makeSingleIdleBrowserRecipe, inspectReallocMediaReport as verifySingleIdleGoldenReport } from ${JSON.stringify(newUrl)};`);
  generated=once(generated,`import { largestIdleMediaSourceFiles as attemptMediaSourceFiles } from ${JSON.stringify(oldUrl)};`,
    `import { reallocMediaSourceFiles as attemptMediaSourceFiles } from ${JSON.stringify(newUrl)};`);
  generated=generated.replaceAll("${stamp}-packet-largest-idle-media","${stamp}-realloc-media");
  return {generated,generatedSha256:sha(generated),previousCallerSha256:old.generatedSha256};
}
