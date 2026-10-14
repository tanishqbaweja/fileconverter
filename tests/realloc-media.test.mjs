import assert from "node:assert/strict";
import { access, readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import { spawnSync } from "node:child_process";
import test from "node:test";
import { createOwnedRuntimeScratch } from "../scripts/lib/owned-runtime-scratch.mjs";
import { FROZEN_BROWSER_SOURCES } from "../scripts/lib/single-idle-browser-recipe.mjs";
import { REALLOC_DECODER_SHA256 } from "../scripts/lib/realloc-attempt-abort-capture.mjs";
import { reallocMediaSourceFiles,makeReallocMediaBrowserRecipe,makeReallocMediaCaller,verifyReallocMediaCandidate } from "../scripts/lib/realloc-media-recipe.mjs";
import { REALLOC_MEDIA_INSPECTOR_SOURCE } from "../scripts/lib/realloc-media-report-inspector.mjs";
const root=path.resolve(import.meta.dirname,".."),read=file=>readFile(path.join(root,file),"utf8"),json=async file=>JSON.parse(await read(file));
test("new unchanged decoder joins old210/new121/native86 closure without cap increase; same four conversion/fidelity/recovery gates",async()=>{
  const files=await reallocMediaSourceFiles(root);assert.ok(files.length<=256);for(const file of files)await access(path.join(root,file));
  const runtime=await createOwnedRuntimeScratch("packet-cache-media-");
  try {
    const sources={};for(const file of Object.keys(FROZEN_BROWSER_SOURCES))sources[file]=await read(file);
    const recipe=await makeReallocMediaBrowserRecipe(sources,root,runtime.directory,"2026-10-14T00-00-00-000Z",
      await json("evidence/mpeg2-encoder-plane-prototype-build-branch-2026-10-10.json"),await json("evidence/mpeg2-encoder-plane-build-38044000567.json"));
    const manifest=recipe.composition.manifest;assert.equal(manifest.artifacts["within-mpeg2-split.wasm"],REALLOC_DECODER_SHA256);
    assert.equal(manifest.artifacts["split-encoder.wasm"],"a4ba6225414ca7a658d349ae81926e5ed040fa73be4540fe8a7adf7656fe1cee");
    assert.equal(manifest.aggregateWasmMemoryBytes,50331648);assert.equal(manifest.asyncifyStorage.maximumLeases,1);
    for(const gate of ["toBeGreaterThanOrEqual(0.98)","retiredWorkerAbsent","productionReplacementWorkerUsed","forbiddenRequests","partialBytes","actual-asyncify-storage-lifecycle","input-read-control-start","NotReadableError"])
      assert.ok(recipe.spec.includes(gate),gate);
    assert.ok(recipe.stage.includes("originalBridge.read(offset, destination)"));assert.ok(recipe.stage.includes("qualifiedReallocCallPath"));
    const start=recipe.stage.indexOf("const adapter = "),end=recipe.stage.indexOf(";\nconst replacing = ",start),adapter=JSON.parse(recipe.stage.slice(start+"const adapter = ".length,end));
    const file=path.join(runtime.directory,"adapter.mjs");await writeFile(file,adapter);
    const checked=spawnSync(process.execPath,["--check",file],{encoding:"utf8",windowsHide:true,timeout:5000});assert.equal(checked.status,0,checked.stderr);
    const config=await import("data:text/javascript;base64,"+Buffer.from(recipe.config).toString("base64"));assert.equal(config.default.use.headless,true);assert.equal(config.default.retries,0);
    for(const mutate of [value=>value.asyncifyStorage.stackBytes++,value=>value.allowMemoryGrowth=true,value=>value.artifacts["within-mpeg2-split.wasm"]="29652ed98ff2b20d553431b78b3cf020c72d3ed30dacd4e306f6b3fc59ddaae5"]){
      const altered=structuredClone(manifest);mutate(altered);await writeFile(path.join(runtime.directory,"build-manifest.json"),JSON.stringify(altered));await assert.rejects(verifyReallocMediaCandidate(root,runtime.directory));
    }
  }finally{await runtime.close();await assert.rejects(access(runtime.directory),{code:"ENOENT"});}
});
test("caller retains original whole-file SHA/safety/native-fixture-only/archive/cleanup gates; inspector-only derivative retains every assertion",async()=>{
  const recipe=makeReallocMediaCaller(await read("scripts/validate-mpeg2-encoder-plane-goldens.mjs"),root);
  for(const gate of ["Keep2GiB host guard","diskBytes >= 2147483648","2958573265","postSourcePins, sourcePins","bytes.length <= 8388608","runtime.close()","Preserve failure; no automatic retry","originalFullSourceAcceptance: false","realloc-media.json"])
    assert.ok(recipe.generated.includes(gate),gate);
  const old=await read("scripts/lib/packet-largest-idle-media-recipe.mjs"),body=old.slice(old.indexOf("function inspectBase("),old.indexOf("export function makeLargestIdleMediaCaller("));
  assert.ok(REALLOC_MEDIA_INSPECTOR_SOURCE.endsWith(body));assert.ok(REALLOC_MEDIA_INSPECTOR_SOURCE.includes(REALLOC_DECODER_SHA256));
});
