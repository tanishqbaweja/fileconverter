// Fix ONLY nested source-generation import binding; preserve the executed failed source.
import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { access, readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import { pathToFileURL } from "node:url";
import { createOwnedRuntimeScratch } from "./lib/owned-runtime-scratch.mjs";
const root=path.resolve(import.meta.dirname,".."),sha=bytes=>createHash("sha256").update(bytes).digest("hex");
const sourcePath="scripts/validate-mpeg2-late-allocator-abort-goldens.mjs",source=await readFile(path.join(root,sourcePath),"utf8");
const failed=JSON.parse(await readFile(path.join(root,"evidence/mpeg2-late-allocator-abort-goldens-2026-10-08.json")));
assert.equal(failed.status,"failed-or-incomplete");assert.match(failed.failure,/ERR_MODULE_NOT_FOUND.*owned-runtime-scratch/);
assert.equal(sha(source),failed.sourcePins[sourcePath]);assert.equal(failed.reports.length,0);
const patches=[
  ['const root = path.resolve(import.meta.dirname,".."), sha =',`const root = ${JSON.stringify(root)}, sha =`],
  ["mpeg2-late-allocator-abort-goldens","mpeg2-late-allocator-abort-goldens-origin-bound"],
  [String.raw`generated=generated.replace(/from "(\.\/lib\/[^\"]+)"/g,`,
    String.raw`generated=generated.replace(/^(import[^\r\n]*from) "(\.\/lib\/[^\"]+)"/gm,`],
  ['(_match,file)=>`from ${JSON.stringify(pathToFileURL(path.resolve(root,"scripts",file)).href)}`',
    '(_match,prefix,file)=>`${prefix} ${JSON.stringify(pathToFileURL(path.resolve(root,"scripts",file)).href)}`'],
];
let generated=source;
for(const[before,after]of patches){assert.equal(generated.split(before).length,2,before);generated=generated.replace(before,after);}
let reverse=generated;
for(const[before,after]of patches.toReversed())reverse=reverse.replace(after,before);
assert.equal(reverse,source,"All actual browser/fidelity/host/memory/source-pin/finally checks unchanged");
generated=generated.replace(/^(import[^\r\n]*from) "(\.\/lib\/[^\"]+)"/gm,
  (_match,prefix,file)=>`${prefix} ${JSON.stringify(pathToFileURL(path.resolve(root,"scripts",file)).href)}`);
const runtime=await createOwnedRuntimeScratch("mpeg2-late-allocator-origin-bound-wrapper-");
try{
  const target=path.join(runtime.directory,"goldens.mjs");await writeFile(target,generated,{flag:"wx"});
  await import(pathToFileURL(target).href);
}finally{await runtime.close();await assert.rejects(access(runtime.directory),{code:"ENOENT"});}
