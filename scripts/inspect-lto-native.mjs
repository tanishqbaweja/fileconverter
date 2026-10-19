// Read-only actual binary/map inspection before any adapter or browser use.
import { readFile } from "node:fs/promises";
import { sha } from "./lib/stable-ui-headless-baseline-recipe.mjs";
import { readWasmFunctionMetadata } from "./lib/wasm-function-metadata.mjs";
import { readWasmMemoryLimits } from "./lib/wasm-memory-limits.mjs";
const build=JSON.parse(await readFile("evidence/mpeg2-lto-build-39279724223.json"));
const directory="work/mpeg2-lto-39279724223",binary=await readFile(directory+"/within-mpeg2-split.wasm");
const names=["av_buffer_allocz","av_malloc","av_refstruct_pool_get","mpeg2_packets","__wrap_posix_memalign","sbrk","emscripten_builtin_malloc","emscripten_builtin_realloc","av_buffer_realloc","__wrap_av_realloc","__wrap_av_buffer_realloc"];
const functions=readWasmFunctionMetadata(binary,new Set(names));
const map=await readFile(directory+"/decoder-link.map","utf8"),layout={};
for(const symbol of ["_gm_","within_allocator_attempt_words","within_realloc_attempt_words","within_refstruct_abort_words"]){
  const matches=[...map.matchAll(new RegExp(`^\\s*([a-f0-9]+)\\s+[a-f0-9-]+\\s+([a-f0-9]+)\\s+${symbol}$`,"gm"))];
  layout[symbol]=matches.map(row=>({address:parseInt(row[1],16),bytes:parseInt(row[2],16)}));
}
console.log(JSON.stringify({ sourceCount:Object.keys(build.manifest.sources).length,binaryBytes:binary.length,sha256:sha(binary),
  memory:readWasmMemoryLimits(binary),functions:functions.map(({name,functionIndex,params,results})=>({name,functionIndex,params,results})),
  missing:names.filter(name=>!functions.some(row=>row.name===name)),layout,libraryLto:build.manifest.libraryLto },null,2));
