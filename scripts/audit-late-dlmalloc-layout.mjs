// Actual new core/map ABI, no browser/media/original/allocator calls.
import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { access, readFile, readdir, writeFile } from "node:fs/promises";
import path from "node:path";
import { pathToFileURL } from "node:url";
import { createOwnedRuntimeScratch } from "./lib/owned-runtime-scratch.mjs";
const root=path.resolve(import.meta.dirname,".."),sha=bytes=>createHash("sha256").update(bytes).digest("hex");
const proofPath=path.join(root,"evidence/mpeg2-late-dlmalloc-layout-2026-10-08.json");
await assert.rejects(access(proofPath),{code:"ENOENT"});
const build=JSON.parse(await readFile(path.join(root,"evidence/mpeg2-late-slot-build-2026-10-08.json")));
const mapBytes=await readFile(path.join(build.reusableToolDirectory,"decoder-link.map"));
assert.equal(sha(mapBytes),build.manifest.artifacts["decoder-link.map"]);
const matches=[...mapBytes.toString("utf8").matchAll(/^\s*([0-9a-f]+)\s+([0-9a-f]+)\s+([0-9a-f]+)\s+_gm_\s*$/gm)];
assert.equal(matches.length,1);const rootAddress=parseInt(matches[0][1],16);
assert.equal(parseInt(matches[0][3],16),496);assert.equal(rootAddress,1786520);
const source=await readFile(path.join(root,"scripts/audit-split-dlmalloc-static.mjs"),"utf8");
assert.equal(sha(source),"13fbb3db01d0dc6fd8412fec6bd31497357917379af3cafb49b7ce003e8259f1");
const outputRoot=path.join(root,"output/playwright"),beforeFiles=new Set(await readdir(outputRoot));
const patches=[
  ['const root = path.resolve(import.meta.dirname, ".."), exec =',`const root = ${JSON.stringify(root)}, exec =`],
  ["work/mpeg2-split-pipeline-37444860342/within-mpeg2-split.wasm","work/mpeg2-split-pipeline-37739125738/within-mpeg2-split.wasm"],
  ['const names = ["emscripten_builtin_malloc", "dlposix_memalign", "av_malloc"];','const names = ["emscripten_builtin_malloc", "av_malloc"];'],
  ["7b8a42b60efc439f0ceca045f4caaabfd4b0ebf0706397b6011cceedada4980c","3e744dc4c5083bcd22d779f705ab65a9ec7573e340f8ec0e17879ab382aa8c6c"],
  ["const rootAddress = 1786392;",`const rootAddress = ${rootAddress};`],
  ["i32\\.const 1786840",`i32\\.const ${rootAddress+448}`],
  ["-split-dlmalloc-static.json","-late-dlmalloc-static.json"],
];
let generated=source;
for(const [before,after]of patches){assert.ok(generated.includes(before));generated=generated.replaceAll(before,after);}
let reverse=generated;
for(const [before,after]of patches.toReversed())reverse=reverse.replaceAll(after,before);
assert.equal(reverse,source,"Same bounds/actual-code field checks/integrity/finally; no historical source edit");
generated=generated.replace(/from "(\.\/lib\/[^"]+)"/g,(_match,file)=>`from ${JSON.stringify(pathToFileURL(path.resolve(root,"scripts",file)).href)}`);
const runtime=await createOwnedRuntimeScratch("late-dlmalloc-layout-driver-");
try{const file=path.join(runtime.directory,"audit.mjs");await writeFile(file,generated,{flag:"wx"});await import(pathToFileURL(file).href);}
finally{await runtime.close();await assert.rejects(access(runtime.directory),{code:"ENOENT"});}
const output=(await readdir(outputRoot)).filter(file=>!beforeFiles.has(file)&&file.endsWith("-late-dlmalloc-static.json"));
assert.equal(output.length,1);const raw=await readFile(path.join(outputRoot,output[0])),report=JSON.parse(raw);
assert.equal(report.sourceSha256,sha(generated));assert.equal(report.failure,null);
assert.equal(report.inspection.allocatorRootAddress,rootAddress);assert.equal(report.cleanup.runtimeRemoved,true);
const proof={recordedAt:new Date().toISOString(),status:"actual-link-map-and-compiled-malloc-layout-verified-not-dynamic-free-capacity",
  mapSha256:sha(mapBytes),mapSymbolLine:matches[0][0].trim(),allocatorRootAddress:rootAddress,
  rawReport:{path:"output/playwright/"+output[0],bytes:raw.length,sha256:sha(raw)},
  allocatorLayoutReferences:report.inspection.allocatorLayoutReferences,
  binary:report.inspection.binary,disassembler:report.inspection.disassembler,
  sourceSha256:sha(await readFile(new URL(import.meta.url))),generatedSourceSha256:sha(generated),
  driverRuntime:runtime.directory,driverRemoved:true,disassemblerRuntime:report.runtimeDirectory,
  disassemblerRuntimeRemoved:true,actualAllocatorFreeCapacityMeasured:false,
  protectedOriginalRead:false,browserConversions:0,publicAcceptance:false};
await writeFile(proofPath,JSON.stringify(proof,null,2)+"\n",{flag:"wx"});
console.log(JSON.stringify({proofPath,rootAddress,staticLayoutVerified:true,dynamicFreeCapacityMeasured:false}));
