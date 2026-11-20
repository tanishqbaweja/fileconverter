// Owned generated build files only; no media/native instance is opened.
import assert from "node:assert/strict";
import { readFile,realpath,writeFile } from "node:fs/promises";
import path from "node:path";
import { makeVp9CpuSpecialistLibraries,makeVp9CpuSpecialistWrapper } from "./vp9-cpu-specialist-recipe.mjs";
const root=path.resolve(import.meta.dirname,"../.."),build=path.join(root,"work/vp9-duration-build");
assert.equal(process.argv.length,3);assert.equal(await realpath(build),build);assert.equal(process.env.WITHIN_VP9_CPU_SPECIALIST,"1");
const mode=process.argv[2];assert.ok(["configure","wrapper"].includes(mode));
const file=path.join(build,mode==="configure"?"build-libraries.sh":"within_remux.duration.c");
assert.equal(await realpath(file),file);const before=await readFile(file,"utf8");
if(mode==="configure")assert.equal(before,await readFile(path.join(build,"build-libraries.allocation.diagnostic.sh"),"utf8"));
const proof=(mode==="configure"?makeVp9CpuSpecialistLibraries:makeVp9CpuSpecialistWrapper)(before);
const stem=mode==="configure"?"build-libraries.vp9-specialist":"within_remux.vp9-specialist";
await writeFile(path.join(build,stem+".base"),before,{flag:"wx"});
await writeFile(path.join(build,stem+".generated"),proof.generated,{flag:"wx"});
const {generated,...metadata}=proof;await writeFile(path.join(build,stem+".json"),JSON.stringify(metadata,null,2)+"\n",{flag:"wx"});
await writeFile(file,generated);console.log(JSON.stringify({mode,parentSha256:proof.parentSha256,generatedSha256:proof.generatedSha256,nativeBuildExecuted:false}));
