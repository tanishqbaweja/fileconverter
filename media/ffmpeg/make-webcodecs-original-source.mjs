// Fresh owned build source only. Never write canonical wrapper or convert media.
import assert from "node:assert/strict";
import {readFile,realpath,writeFile} from "node:fs/promises";
import path from "node:path";
import {makeWebCodecsOriginalSource} from "./webcodecs-original-recipe.mjs";
assert.equal(process.argv.length,2);
const root=path.resolve(import.meta.dirname,"../.."),build=path.join(root,"work/webcodecs-vp9-build");
assert.equal(await realpath(build),build);
const {generated,...proof}=makeWebCodecsOriginalSource(await readFile(path.join(root,"media/ffmpeg/within_remux.c"),"utf8"));
await writeFile(path.join(build,"within_remux.original.c"),generated,{flag:"wx"});
await writeFile(path.join(build,"within-webcodecs-original-proof.json"),JSON.stringify(proof,null,2)+"\n",{flag:"wx"});
console.log(JSON.stringify({compiledWrapperSha256:proof.generatedSha256,decoderHeapBytes:33554432,publicAcceptance:false}));
