// Actual headless synthetic fatal, no user file/conversion. Bound every source,
// exact native envelope and export-only sections before browser launch.
import assert from "node:assert/strict";
import { access, readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import { pathToFileURL } from "node:url";
import { gzipSync, gunzipSync } from "node:zlib";
import { createOwnedRuntimeScratch } from "./lib/owned-runtime-scratch.mjs";
import { inspectStressHostMemory } from "./lib/host-memory-preflight.mjs";
import { sha } from "./lib/stable-ui-headless-baseline-recipe.mjs";
import { verifyReallocNativeEnvelope } from "./lib/realloc-native-envelope.mjs";
import { REALLOC_DECODER_SHA256 } from "./lib/realloc-attempt-abort-capture.mjs";
import { makeReallocExportFactory } from "./lib/realloc-export-only-control.mjs";
import { makeReallocControlBrowserRecipe, REALLOC_CONTROL_FILES } from "./lib/realloc-control-browser-recipe.mjs";
assert.equal(process.argv.length, 2);
const root = path.resolve(import.meta.dirname, ".."), read = file => readFile(path.join(root, file));
const buildPath = "evidence/mpeg2-realloc-attempt-build-38526781934.json", buildBytes = await read(buildPath), build = JSON.parse(buildBytes);
const branchPath = "evidence/mpeg2-realloc-attempt-build-branch-2026-10-14-recursion-fix.json", branch = JSON.parse(await read(branchPath));
const nativeEnvelope = await verifyReallocNativeEnvelope(root, build, buildBytes, branch);
const candidate = "work/mpeg2-realloc-attempt-38526781934";
for (const row of build.files) { const bytes = await read(`${candidate}/${row.file}`); assert.equal(bytes.length,row.bytes);assert.equal(sha(bytes),row.sha256); }
const binary = await read(`${candidate}/within-mpeg2-split.wasm`);assert.equal(sha(binary),REALLOC_DECODER_SHA256);
const layoutBytes = await read("evidence/realloc-native-layout-38526781934.json"), layout = JSON.parse(layoutBytes);
assert.deepEqual(layout.nativeEnvelope,nativeEnvelope);assert.equal(layout.binary.sha256,REALLOC_DECODER_SHA256);
const factoryRecipe = makeReallocExportFactory((await read("scripts/lib/refstruct-export-only-control.mjs")).toString());
const factorySource = factoryRecipe.generated.replace(/from "(\.\/[^"\r\n]+)"/g, (_, file) => `from ${JSON.stringify(pathToFileURL(path.resolve(root,"scripts/lib",file)).href)}`);
const runtime = await createOwnedRuntimeScratch("realloc-abort-control-caller-"), stamp = new Date().toISOString().replaceAll(/[:.]/g,"-");
let receipt;
try {
  const file = path.join(runtime.directory,"export-factory.mjs");await writeFile(file,factorySource,{flag:"wx"});
  const { createReallocExportOnlyControl } = await import(pathToFileURL(file).href), control = createReallocExportOnlyControl(binary);
  assert.equal(control.originalSha256,REALLOC_DECODER_SHA256);assert.equal(control.additions.length,2);
  assert.equal(control.onlyExportSectionChanged,true);assert.equal(control.allCodeDataTypesImportsTablesMemoryExact,true);
  assert.equal(control.additions[0].functionIndex,4474);assert.equal(control.additions[1].functionIndex,4437);
  const controlPath = path.join(runtime.directory,"synthetic-export-only.wasm");await writeFile(controlPath,control.binary,{flag:"wx"});
  const recipe = makeReallocControlBrowserRecipe((await read("scripts/check-wasm-abort-capture-origin-checked.mjs")).toString(),root,controlPath,control,stamp);
  const files = [...new Set([...REALLOC_CONTROL_FILES,...Object.keys(build.manifest.sources),buildPath,branchPath,
    "evidence/realloc-native-layout-38526781934.json",nativeEnvelope.path,"scripts/retain-mpeg2-realloc-native-sources.mjs",
    "scripts/check-wasm-abort-capture-origin-checked.mjs","scripts/lib/refstruct-export-only-control.mjs","AGENTS.md","package.json","package-lock.json",
    "scripts/lib/private-browser-request.mjs","scripts/lib/owned-runtime-scratch.mjs","scripts/lib/host-memory-preflight.mjs",
    "scripts/lib/owned-process-exit-observation.mjs","scripts/lib/chromium-private-memory.mjs","scripts/lib/microsecond-native-type-join.mjs","scripts/lib/wasm-stack-symbols.mjs"])];
  for(let i=0;i<files.length;i++){
    assert.ok(files.length<=128);if(!files[i].endsWith(".mjs"))continue;
    for(const match of (await read(files[i])).toString().matchAll(/^import(?:(?!;)[\s\S])*?from\s+"(\.[^"]+)"\s*;/gm)){
      const relative=path.relative(root,path.resolve(root,path.dirname(files[i]),match[1])).replaceAll("\\","/");
      assert.ok(relative&&!relative.startsWith("../")&&!path.isAbsolute(relative));if(!files.includes(relative))files.push(relative);
    }
  }
  const sourcePins={},preimages={};
  for(const file of files){const bytes=await read(file);assert.ok(bytes.length<=2097152);sourcePins[file]=sha(bytes);preimages[file]=bytes.toString("base64");}
  const raw=Buffer.from(JSON.stringify({...recipe,factorySource,factoryRecipe,layout,nativeEnvelope,sourcePins,preimages}));assert.ok(raw.length<=2097152);
  const zipped=gzipSync(raw,{level:9});assert.deepEqual(gunzipSync(zipped),raw);
  const archivePath=`outputs/reports/${stamp}-realloc-abort-control-sources.json.gz`;await writeFile(path.join(root,archivePath),zipped,{flag:"wx"});
  receipt={recordedAt:new Date().toISOString(),status:"prepared-synthetic-realloc-control-not-executed",proof:null,failure:null,
    sourcePins,postSourcePins:null,nativeEnvelope,nativeEnvelopePost:null,layout:{path:"evidence/realloc-native-layout-38526781934.json",sha256:sha(layoutBytes)},
    archive:{path:archivePath,bytes:zipped.length,sha256:sha(zipped),restoredBytes:raw.length,restoredSha256:sha(raw)},
    ownedCaller:runtime.directory,syntheticExportOnlyBinaryRemovedWithCallerScratch:false,browserDriverImported:false,
    browserConversionsPerformed:0,protectedSourceRead:false,publicAcceptance:false};
  receipt.launchHostPreflight=await inspectStressHostMemory();
  if(!receipt.launchHostPreflight.safeToStart){receipt.status="held-before-browser-import-insufficient-host-memory";receipt.browsersLaunched=0;}
  else {
    receipt.browserDriverImported=true;const driver=path.join(runtime.directory,"driver.mjs");await writeFile(driver,recipe.generated,{flag:"wx"});
    try{await import(pathToFileURL(driver).href);const proofPath=`evidence/${stamp}-realloc-abort-control.json`,bytes=await read(proofPath);
      receipt.proof={path:proofPath,sha256:sha(bytes),status:JSON.parse(bytes).status};receipt.status="actual-headless-realloc-control-executed-sources-not-media-acceptance";}
    catch(error){receipt.failure=String(error.stack??error).slice(0,8192);receipt.status="failed-synthetic-realloc-control-driver-import";process.exitCode=1;}
  }
  receipt.postSourcePins={};for(const [file,hash] of Object.entries(sourcePins)){receipt.postSourcePins[file]=sha(await read(file));assert.equal(receipt.postSourcePins[file],hash,file);}
  receipt.nativeEnvelopePost=await verifyReallocNativeEnvelope(root,build,buildBytes,branch);assert.deepEqual(receipt.nativeEnvelopePost,nativeEnvelope);
}finally{await runtime.close();await assert.rejects(access(runtime.directory),{code:"ENOENT"});}
receipt.syntheticExportOnlyBinaryRemovedWithCallerScratch=true;
const output=`evidence/${stamp}-realloc-abort-control-executed-sources.json`;await writeFile(path.join(root,output),JSON.stringify(receipt,null,2)+"\n",{flag:"wx"});
console.log(JSON.stringify({output,status:receipt.status,proof:receipt.proof,sourceCount:Object.keys(receipt.sourcePins).length,browserConversionsPerformed:0}));
