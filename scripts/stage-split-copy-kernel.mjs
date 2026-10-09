// Private generated-dist overlay around the exact existing codec/AVIO stager.
// A caller-owned fresh scratch directory retains only small restoration sources.
import assert from "node:assert/strict";
import { execFile } from "node:child_process";
import { access,lstat,readFile,realpath,rm,writeFile } from "node:fs/promises";
import path from "node:path";
import { promisify } from "node:util";
import { makeSplitCopyAdapter,makeSplitCopyFrameBridge,makeSplitCopySession,exposeSplitCodecMemory } from "./lib/split-copy-kernel-recipe.mjs";
import { sha } from "./lib/stable-ui-headless-baseline-recipe.mjs";
const root=path.resolve(import.meta.dirname,".."),action=process.argv[2];assert.equal(process.argv.length,3);assert.ok(["stage","restore"].includes(action));
assert.equal(process.env.WITHIN_MPEG2_SPLIT_CANDIDATE_DIR,"mpeg2-split-pipeline-37739125738");
const stateDirectory=path.resolve(process.env.WITHIN_SPLIT_COPY_STATE_DIR??"NOT_SET");
assert.ok(stateDirectory.startsWith(path.join(root,"work","split-copy-goldens-") ));
const directory=await lstat(stateDirectory);assert.ok(directory.isDirectory()&&!directory.isSymbolicLink());assert.equal(await realpath(stateDirectory),stateDirectory);
const statePath=path.join(stateDirectory,"copy-overlay.json"),dist=path.join(root,"dist/client/engines/remux");
const existing=new Map([["within-remux.mjs",makeSplitCopyAdapter],["within-mpeg4.mjs",makeSplitCopyAdapter],["within-direct.mjs",makeSplitCopyAdapter],
  ["_private_split_decoder.mjs",exposeSplitCodecMemory],["_private_split_encoder.mjs",exposeSplitCodecMemory],
  ["mpeg2-split-session.mjs",makeSplitCopySession],["mpeg2-split-frame-bridge.mjs",makeSplitCopyFrameBridge]]);
const additions=new Map([["split-copy-kernel.mjs","scripts/lib/split-copy-kernel.mjs"],["_private_split_copy.wasm","media/ffmpeg/mpeg2-split-copy.wasm"]]);
const delegate=mode=>promisify(execFile)(process.execPath,["scripts/stage-mpeg2-late-allocator-abort.mjs",mode],
  {cwd:root,env:process.env,windowsHide:true,timeout:30000,maxBuffer:131072});
async function restoreOverlay(state){
  assert.equal(state.root,root);assert.equal(state.stateDirectory,stateDirectory);
  assert.deepEqual(state.existing.map(row=>row.file),[...existing.keys()]);
  assert.deepEqual(state.additions.map(row=>row.file),[...additions.keys()]);
  for(const row of [...state.existing,...state.additions])assert.equal(sha(await readFile(path.join(dist,row.file))),row.generatedSha256,row.file);
  for(const row of state.existing){assert.equal(sha(row.original),row.originalSha256);await writeFile(path.join(dist,row.file),row.original);}
  for(const row of state.additions){const full=path.join(dist,row.file);assert.equal(await realpath(full),full);assert.ok((await lstat(full)).isFile());await rm(full);}
}
if(action==="stage"){
  await assert.rejects(access(statePath),{code:"ENOENT"});
  for(const file of additions.keys())await assert.rejects(access(path.join(dist,file)),{code:"ENOENT"});
  await delegate("stage");
  const state={root,stateDirectory,existing:[],additions:[]};
  // Prepare and validate every overlay before modifying any of the existing assets.
  try {
    for(const [file,make] of existing){const original=await readFile(path.join(dist,file),"utf8"),recipe=make(original);state.existing.push({file,original,...recipe});}
    for(const [file,source] of additions){const bytes=await readFile(path.join(root,source));state.additions.push({file,source,generatedSha256:sha(bytes)});}
  }catch(error){await delegate("restore");throw error;}
  await writeFile(statePath,JSON.stringify(state),{flag:"wx"});
  let changed=0,added=0;
  try {
    for(const row of state.existing){await writeFile(path.join(dist,row.file),row.generated);changed++;}
    for(const row of state.additions){await writeFile(path.join(dist,row.file),await readFile(path.join(root,row.source)),{flag:"wx"});added++;}
  }catch(error){
    for(const row of state.existing.slice(0,changed))await writeFile(path.join(dist,row.file),row.original);
    for(const row of state.additions.slice(0,added))await rm(path.join(dist,row.file));
    await delegate("restore");throw error;
  }
  console.log(JSON.stringify({scope:"private-copy-overlay-not-conversion-acceptance",statePath,existing:state.existing.map(({file,originalSha256,generatedSha256})=>({file,originalSha256,generatedSha256})),additions:state.additions}));
}else{
  const state=JSON.parse(await readFile(statePath));await restoreOverlay(state);await delegate("restore");
  console.log("Restored original codec stager; two private copy artifacts removed.");
}
