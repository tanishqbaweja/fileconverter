import assert from "node:assert/strict";
import path from "node:path";
import { pathToFileURL } from "node:url";
import { makeSplitRenderProgressDriver } from "./split-render-progress-recipe.mjs";
export { makeSplitRenderProgressTraceHelper as makeSplitCopyProgressTraceHelper } from "./split-render-progress-recipe.mjs";
import { sha,baselineBinding } from "./stable-ui-headless-baseline-recipe.mjs";
export function makeSplitCopyProgressDriver(source,root,helperUri,binding,mode){
  assert.deepEqual(binding,baselineBinding);
  const previous=makeSplitRenderProgressDriver(source,root,helperUri,baselineBinding,mode);
  const originalWorkUri=JSON.stringify(pathToFileURL(path.join(root,"scripts/lib/output-work-checkpoints.mjs")).href);
  const newWorkUri=JSON.stringify(pathToFileURL(path.join(root,"scripts/lib/split-copy-work-checkpoints.mjs")).href);
  const patches=[
    [originalWorkUri,newWorkUri],
    [`-private-mpeg2-split-render-${mode}-native-100ms`,`-private-mpeg2-split-copy-${mode}-native-100ms`],
    [`"mpeg2-split-render-${mode}-runtime-"`,`"mpeg2-split-copy-${mode}-runtime-"`],
    ['const sourceFiles = [','const sourceFiles = ["scripts/diagnose-split-copy-progress.mjs","scripts/lib/split-copy-progress-recipe.mjs","scripts/lib/split-copy-work-checkpoints.mjs","scripts/stage-split-copy-layout.mjs","scripts/stage-split-copy-kernel.mjs","scripts/lib/split-copy-layout-recipe.mjs","scripts/lib/split-copy-kernel-recipe.mjs","scripts/lib/split-copy-kernel.mjs","media/ffmpeg/mpeg2-split-copy.wat","media/ffmpeg/mpeg2-split-copy.wasm",'],
    ['scope: "Matched headless split-render UI diagnostic,','scope: "Matched headless COPY KERNEL diagnostic, same NORMAL UI; extra4/8MiB observations do not change64MiB stopping/full input/acceptance.'],
  ];
  // Replace actual old occurrences BEFORE adding source pins containing the new
  // name, so reverse reconstruction cannot rewrite the newly inserted pin list.
  if(mode==="candidate")patches.unshift(["scripts/stage-mpeg2-late-allocator-abort.mjs","scripts/stage-split-copy-layout.mjs"]);
  let generated=previous.generated;
  for(const[before,after]of patches){const count=before==="scripts/stage-mpeg2-late-allocator-abort.mjs"?4:1;
    assert.equal(generated.split(before).length,count+1,before);generated=generated.replaceAll(before,after);}
  let recovered=generated;for(const[before,after]of patches.toReversed())recovered=recovered.replaceAll(after,before);assert.equal(recovered,previous.generated);
  assert.ok(generated.includes('"--headless=new"')&&generated.includes('assert.equal(run.state.jobState, "complete"'));
  return {generated,previous,patches,generatedSha256:sha(generated),mode,expectedAsset:baselineBinding};
}
