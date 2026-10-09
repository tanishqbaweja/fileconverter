// One tiny reproducible transport module; no media, browser or native converter.
import assert from "node:assert/strict";
import { execFile } from "node:child_process";
import { createHash } from "node:crypto";
import { readFile,writeFile } from "node:fs/promises";
import path from "node:path";
import { promisify } from "node:util";
import { pathToFileURL } from "node:url";
import { createOwnedRuntimeScratch } from "./lib/owned-runtime-scratch.mjs";
const root=path.resolve(import.meta.dirname,".."),sha=b=>createHash("sha256").update(b).digest("hex");
const watPath="media/ffmpeg/mpeg2-split-copy.wat",output="media/ffmpeg/mpeg2-split-copy.wasm";
const runtime=await createOwnedRuntimeScratch("split-copy-kernel-build-");
let proof;
try {
  const response=await fetch("https://registry.npmjs.org/wabt/1.0.39",{signal:AbortSignal.timeout(30000)});assert.ok(response.ok);
  const metadata=await response.json();assert.equal(metadata.version,"1.0.39");assert.match(metadata.dist.integrity,/^sha512-/);
  await promisify(execFile)(process.execPath,["C:\\Program Files\\nodejs\\node_modules\\npm\\bin\\npm-cli.js",
    "install","--prefix",runtime.directory,"--ignore-scripts","--no-audit","--no-fund","--save-exact","wabt@1.0.39"],
  {cwd:runtime.directory,env:{...runtime.env,npm_config_cache:path.join(runtime.directory,"npm-cache")},windowsHide:true,timeout:60000,maxBuffer:16384});
  const lock=JSON.parse(await readFile(path.join(runtime.directory,"package-lock.json")));
  assert.equal(lock.packages["node_modules/wabt"].integrity,metadata.dist.integrity);
  const factory=(await import(pathToFileURL(path.join(runtime.directory,"node_modules/wabt/index.js")).href)).default,wabt=await factory();
  const wat=await readFile(path.join(root,watPath),"utf8"),options={threads:true,multi_memory:true,bulk_memory:true};
  const compile=()=>{
    const parsed=wabt.parseWat(watPath,wat,options);
    try {parsed.resolveNames();parsed.validate(options);return Buffer.from(parsed.toBinary({canonicalize_lebs:true,write_debug_names:false}).buffer);}
    finally {parsed.destroy();}
  };
  const bytes=compile();assert.deepEqual(bytes,compile());assert.ok(bytes.length<1024);
  assert.ok(WebAssembly.validate(bytes),"Actual runtime multi-memory/shared copy support unavailable");
  const compiled=await WebAssembly.compile(bytes);
  assert.deepEqual(WebAssembly.Module.imports(compiled),[{module:"heaps",name:"decoder",kind:"memory"},{module:"heaps",name:"encoder",kind:"memory"}]);
  assert.deepEqual(WebAssembly.Module.exports(compiled),[{name:"copy_rows",kind:"function"}]);
  // Refuse overwriting a different generated artifact; a source change needs a
  // distinct approved candidate rather than replacing a frozen binary silently.
  try {assert.deepEqual(await readFile(path.join(root,output)),bytes);}catch(error){if(error.code!=="ENOENT")throw error;await writeFile(path.join(root,output),bytes,{flag:"wx"});}
  proof={recordedAt:new Date().toISOString(),scope:"private-two-existing-heaps-copy-only-not-conversion-acceptance",
    source:{path:watPath,sha256:sha(wat)},artifact:{path:output,bytes:bytes.length,sha256:sha(bytes)},
    tool:{name:"wabt",version:"1.0.39",integrity:metadata.dist.integrity},twiceCompiledByteIdentical:true,
    importedMemories:[{initial:512,maximum:512,shared:true},{initial:256,maximum:256,shared:true}],
    additionalWasmMemoryBytes:0,codecChanges:false,conversionsPerformed:0,browserSupportVerified:false,publicAcceptance:false};
} finally {await runtime.close();}
proof.ownedBuildRuntimeRemoved=true;
const proofPath="evidence/"+new Date().toISOString().replaceAll(":","-").replace(".","-")+"-split-copy-kernel-build.json";
await writeFile(path.join(root,proofPath),JSON.stringify(proof,null,2)+"\n",{flag:"wx"});console.log(JSON.stringify({proofPath,...proof}));
