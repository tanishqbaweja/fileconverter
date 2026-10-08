// Verify retained actual build bytes, not simulated browser or conversion acceptance.
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import path from "node:path";
import { gunzipSync } from "node:zlib";
import test from "node:test";
import ts from "typescript";
import { makeSplitRenderUiSource, baselineBinding } from "../scripts/lib/split-render-ui-recipe.mjs";
import { sha } from "../scripts/lib/stable-ui-headless-baseline-recipe.mjs";
const root=path.resolve(import.meta.dirname,".."),read=file=>readFile(path.join(root,file));
const proof=JSON.parse(await read("evidence/2026-10-08T23-13-16-883Z-split-render-ui-build.json"));
const restore=async archive=>{
  const gzip=await read(archive.path);assert.equal(gzip.length,archive.bytes);assert.equal(sha(gzip),archive.sha256);
  const raw=gunzipSync(gzip);assert.equal(raw.length,archive.restoredBytes);assert.equal(sha(raw),archive.restoredSha256);
  assert.equal(archive.roundTripVerified,true);return raw;
};
test("Actual private production source overlay is exact, type/lint clean, hash-bound and not promoted",async()=>{
  assert.equal(proof.status,"private-production-split-render-built-not-browser-acceptance");
  const source=await read("app/converter/ConverterApp.tsx"),recipe=makeSplitRenderUiSource(source.toString(),root);
  assert.equal(sha(source),proof.recipe.baselineSha256);
  assert.equal((await restore(proof.sourceArchive)).toString(),recipe.source);
  assert.equal(recipe.candidateSha256,proof.recipe.candidateSha256);
  assert.deepEqual(recipe.snapshotFields,proof.recipe.snapshotFields);
  assert.deepEqual(recipe.sections,proof.recipe.sections);assert.equal(recipe.sections.length,15);
  assert.equal(proof.recipe.hooksHandlersAndLifecycleUnchanged,true);assert.equal(proof.recipe.newReactComponentBoundaries,0);
  assert.equal(proof.candidateLintErrors,0);assert.equal(proof.candidateLintWarnings,0);assert.equal(proof.candidateTypeDiagnostics,0);
  assert.ok(proof.loads.some(row=>row.environment==="client"));assert.ok(proof.loads.length<=16);
  assert.equal(proof.sourcePins.length,8);
  for(const pin of proof.sourcePins){const bytes=await read(pin.path);assert.equal(bytes.length,pin.bytes,pin.path);assert.equal(sha(bytes),pin.sha256,pin.path);}
  for(const field of ["engineChanged","cssChanged","limitsChanged","forBrowser","publicAcceptance","nativeAllocationCauseProven",
    "conversionSpeedAcceptance","completeChromiumMemoryAcceptance"])assert.equal(proof[field],false,field);
  assert.equal(proof.publishedSourceUnchanged,true);assert.equal(proof.normalProductionRestored,true);
});
test("Actual compiled function decomposition survived production optimizer; larger bundle is not a memory or speed claim",async()=>{
  const candidate=await restore(proof.assetArchive),baseline=await read("dist/client"+baselineBinding.url);
  assert.equal(sha(baseline),baselineBinding.sha256);assert.equal(sha(candidate),proof.asset.sha256);assert.equal(candidate.length,proof.asset.bytes);
  const sizes=bytes=>{
    const file=ts.createSourceFile("built.js",bytes.toString(),ts.ScriptTarget.Latest,true,ts.ScriptKind.JS),rows=[];
    const visit=node=>{if(ts.isFunctionLike(node)&&node.body)rows.push({name:node.name?.getText(file)??null,bytes:node.getEnd()-node.getStart(file)});ts.forEachChild(node,visit);};
    visit(file);return rows.sort((a,b)=>b.bytes-a.bytes).slice(0,12);
  };
  assert.deepEqual(sizes(baseline),proof.baselineLargestBuiltFunctions);assert.deepEqual(sizes(candidate),proof.candidateLargestBuiltFunctions);
  assert.equal(proof.baselineLargestBuiltFunctions[0].bytes,39778);assert.equal(proof.candidateLargestBuiltFunctions[0].bytes,15917);
  // Frozen builder's `bytes` fields used AST UTF-16 offsets. Verify true UTF-8
  // source lengths separately; neither quantity is allocated native memory.
  const largestUtf8=bytes=>{
    const file=ts.createSourceFile("built.js",bytes.toString(),ts.ScriptTarget.Latest,true,ts.ScriptKind.JS),functions=[];
    const visit=node=>{if(ts.isFunctionLike(node)&&node.body)functions.push(node.getText(file));ts.forEachChild(node,visit);};visit(file);
    return Buffer.byteLength(functions.sort((a,b)=>b.length-a.length)[0]);
  };
  assert.equal(largestUtf8(baseline),39792);assert.equal(largestUtf8(candidate),15920);
  assert.ok(candidate.length>baseline.length,"do not mislabel larger total client bundle as a size saving");
});
