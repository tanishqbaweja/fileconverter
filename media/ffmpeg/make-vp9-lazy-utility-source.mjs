// Owned private vendor sources, after diagnostics and before library compilation.
import assert from "node:assert/strict";
import { readFile,realpath,writeFile } from "node:fs/promises";
import path from "node:path";
import { makeVp9LazyUtilityEncoder,makeVp9LazyUtilityFilter } from "./vp9-lazy-utility-recipe.mjs";
import { runVp9LazyUtilityCUnit } from "./vp9-lazy-utility-c-unit.mjs";
assert.equal(process.argv.length,2);
const root=path.resolve(import.meta.dirname,"../.."),build=path.join(root,"work/vp9-duration-build");assert.equal(await realpath(build),build);
const encoderFile=path.join(build,"libvpx/vp9/encoder/vp9_encoder.c"),filterFile=path.join(build,"libvpx/vp9/encoder/vp9_picklpf.c");
for(const file of [encoderFile,filterFile])assert.equal(await realpath(file),file);
const encoder=makeVp9LazyUtilityEncoder(await readFile(encoderFile,"utf8")),filterBase=await readFile(filterFile,"utf8"),
  filter=makeVp9LazyUtilityFilter(filterBase),cUnit=await runVp9LazyUtilityCUnit(encoder.functionPreimages,filterBase);
const compact=({generated:_generated,functionPreimages:_preimages,...proof})=>{void _generated;void _preimages;return proof;};
for(const [name,content] of [["vp9_encoder.lazy.utility.c",encoder.generated],["vp9_picklpf.lazy.base.c",filterBase],["vp9_picklpf.lazy.utility.c",filter.generated]])
  await writeFile(path.join(build,name),content,{flag:"wx"});
await writeFile(path.join(build,"vp9-lazy-utility-proof.json"),JSON.stringify({encoder:compact(encoder),filter:compact(filter),cUnit,
  scope:"Private deferred utility storage, same algorithms/codec options/limits; native/browser acceptance still pending",
  actualMemorySavedBytes:null,browserValidated:false,publicAcceptance:false},null,2)+"\n",{flag:"wx"});
await writeFile(encoderFile,encoder.generated);await writeFile(filterFile,filter.generated);
assert.equal(await readFile(encoderFile,"utf8"),encoder.generated);assert.equal(await readFile(filterFile,"utf8"),filter.generated);
console.log(JSON.stringify({lazyUtilityStorage:true,encoderSha256:encoder.generatedSha256,filterSha256:filter.generatedSha256,publicAcceptance:false}));
