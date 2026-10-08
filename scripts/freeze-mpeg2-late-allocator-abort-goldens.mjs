// Frozen previous validator: all exact output/fidelity/recovery checks unchanged.
import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { access, readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import { pathToFileURL } from "node:url";
import { createOwnedRuntimeScratch } from "./lib/owned-runtime-scratch.mjs";
const root=path.resolve(import.meta.dirname,".."),sha=bytes=>createHash("sha256").update(bytes).digest("hex");
const sourcePath="scripts/freeze-mpeg2-late-abort-goldens.mjs",source=await readFile(path.join(root,sourcePath),"utf8");
const prior=JSON.parse(await readFile(path.join(root,"evidence/mpeg2-late-abort-golden-validation-2026-10-08.json")));
assert.equal(sha(source),prior.freezerSourceSha256);
const ownSha=sha(await readFile(new URL(import.meta.url)));
const patches=[
  ['const root = path.resolve(import.meta.dirname, ".."), sha = bytes => createHash("sha256").update(bytes).digest("hex");',`const root = ${JSON.stringify(root)}, sha = bytes => createHash("sha256").update(bytes).digest("hex");`],
  ["evidence/mpeg2-late-abort-goldens-2026-10-08.json","evidence/mpeg2-late-allocator-abort-goldens-origin-bound-2026-10-08.json"],
  ["evidence/mpeg2-late-abort-golden-validation-2026-10-08.json","evidence/mpeg2-late-allocator-abort-golden-validation-2026-10-08.json"],
  ['"elapsedBrowserTestSeconds: 27.0"','"elapsedBrowserTestSeconds: null"'],
  ["Nine actual runner/stager/adapter/helper/test/App pins", "Thirteen actual runner/stager/adapter/helper/test/App pins"],
  ['sha(await readFile(new URL(import.meta.url)))',JSON.stringify(ownSha)],
  ["mpeg2-late-golden-freeze-","mpeg2-late-allocator-golden-freeze-"],
];
let generated=source;
for(const[before,after]of patches){assert.equal(generated.split(before).length,2,before);generated=generated.replace(before,after);}
let reverse=generated;
for(const[before,after]of patches.toReversed())reverse=reverse.replace(after,before);
assert.equal(reverse,source,"No golden/validation/cleanup/compiled-normal-core/export exclusion gate changed");
generated=generated.replace(/from "(\.\/lib\/[^\"]+)"/g,
  (_match,file)=>`from ${JSON.stringify(pathToFileURL(path.resolve(root,"scripts",file)).href)}`);
const runtime=await createOwnedRuntimeScratch("mpeg2-late-allocator-freeze-wrapper-");
try{
  const target=path.join(runtime.directory,"freeze.mjs");await writeFile(target,generated,{flag:"wx"});
  await import(pathToFileURL(target).href);
}finally{await runtime.close();await assert.rejects(access(runtime.directory),{code:"ENOENT"});}
