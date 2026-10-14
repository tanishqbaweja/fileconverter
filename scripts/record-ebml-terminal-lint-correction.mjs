// Preserve the actually executed analyzer preimage and prove this post-execution
// lint-only transformation. Do not replay the analyzer or rewrite its evidence.
import assert from "node:assert/strict";
import { readFile,writeFile } from "node:fs/promises";
import path from "node:path";
import { sha } from "./lib/stable-ui-headless-baseline-recipe.mjs";
const root=path.resolve(import.meta.dirname,".."),proofPath="evidence/2026-10-14T19-03-00-388Z-ebml-reuse-full-terminal-analysis.json";
const proofBytes=await readFile(path.join(root,proofPath)),proof=JSON.parse(proofBytes),old=Buffer.from(proof.ownSource.preimage,"base64").toString();
assert.equal(sha(old),proof.ownSource.sha256);
const before="rows=>rows.map(({unavailableExamples,...row})=>row)",after='rows=>rows.map(row=>Object.fromEntries(Object.entries(row).filter(([key])=>key!=="unavailableExamples")))';
assert.equal(old.split(before).length,2);
const current=await readFile(path.join(root,proof.ownSource.path),"utf8");assert.equal(current,old.replace(before,after));assert.equal(current.replace(after,before),old);
const make=async expression=>(await import("data:text/javascript;base64,"+Buffer.from("export const compact="+expression+";").toString("base64"))).compact;
const prior=await make(before),updated=await make(after);assert.deepEqual(prior(proof.failedWindowMemory.phases),updated(proof.failedWindowMemory.phases));
const own="scripts/record-ebml-terminal-lint-correction.mjs",ownBytes=await readFile(path.join(root,own));
const output="evidence/ebml-terminal-post-execution-lint-correction-2026-10-15.json";
await writeFile(path.join(root,output),JSON.stringify({recordedAt:new Date().toISOString(),proof:{path:proofPath,sha256:sha(proofBytes)},
  analyzer:proof.ownSource.path,executedSourceSha256:sha(old),currentSourceSha256:sha(current),before,after,
  exactReversal:true,actualSixPhaseResultsEqual:true,executedSourcePreimageRetainedInOriginalProof:true,
  originalEvidenceUnmodified:true,analyzerReplayed:false,conversionReplayed:false,validationGatesChanged:false,
  publicAcceptance:false,ownSource:{path:own,sha256:sha(ownBytes),preimage:ownBytes.toString("base64")}},null,2)+"\n",{flag:"wx"});
console.log(JSON.stringify({output,executedSha256:sha(old),currentSha256:sha(current),analyzerReplayed:false}));
