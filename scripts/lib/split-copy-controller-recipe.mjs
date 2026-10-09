// Exact derivative of the executed paired controller: same guards/native/finally.
import assert from "node:assert/strict";
import path from "node:path";
import { pathToFileURL } from "node:url";
import { sha } from "./stable-ui-headless-baseline-recipe.mjs";
export function makeSplitCopyController(source,root){
  const goldenLines=source.match(/^const goldenPath=.*\r?\nassert.equal\(golden.status,.*$/m);assert.ok(goldenLines);
  const buildLines=source.match(/^const build=JSON.parse.*\r?\nassert.equal\(candidateBinding.sha256,.*$/m);assert.ok(buildLines);
  const candidateBuild=source.match(/        if\(mode==="candidate"\)\{[\s\S]*?\n        \}/);assert.ok(candidateBuild);
  const patches=[
    [goldenLines[0],`const goldenPath="evidence/2026-10-09T04-15-41-611Z-split-copy-kernel-goldens.json.gz",golden=JSON.parse(gunzipSync(await read(goldenPath),{maxOutputLength:2097152}));
assert.equal(golden.status,"headless-changed-copy-kernel-five-goldens-passed");assert.equal(golden.executions,1);assert.equal(golden.failure,null);
const kernelReportBytes=gunzipSync(await read(golden.report.archivePath),{maxOutputLength:2097152});assert.equal(sha(kernelReportBytes),golden.report.rawSha256);
const kernelReport=JSON.parse(kernelReportBytes);assert.equal(kernelReport.rows.filter(row=>!row.kind&&row.status==="passed").length,3);
assert.ok(kernelReport.rows.filter(row=>row.kind==="actual-split-native-ownership").every(row=>row.samples[0].copyKernel.closed));`],
    [buildLines[0],"const candidateBinding=baselineBinding; // Same NORMAL UI: only native copy transport changes."],
    [candidateBuild[0],'        await verifyBinding(binding); // No UI rebuild/candidate stacking.'],
    ['const root=path.resolve(import.meta.dirname,".."),read=',`const root=${JSON.stringify(root)},read=`],
    ['`split-render-progress-${mode}-`','`split-copy-goldens-progress-${mode}-`'],
    ['WITHIN_MPEG2_SPLIT_CANDIDATE_DIR:"mpeg2-split-pipeline-37739125738"},windowsHide:',
      'WITHIN_MPEG2_SPLIT_CANDIDATE_DIR:"mpeg2-split-pipeline-37739125738",WITHIN_SPLIT_COPY_STATE_DIR:runtime.directory},windowsHide:'],
    ['const run={mode,actualExitCode:code,','const run={mode,copyOverlay:mode==="candidate"?JSON.parse(await readFile(path.join(runtime.directory,"copy-overlay.json"))):null,actualExitCode:code,'],
    ['for(const [file,hash] of Object.entries(sourcePins))',
      `for(const file of ["scripts/diagnose-split-copy-progress.mjs","scripts/lib/split-copy-controller-recipe.mjs","scripts/lib/split-copy-progress-recipe.mjs","scripts/lib/split-copy-work-checkpoints.mjs","scripts/lib/split-copy-layout-recipe.mjs","scripts/stage-split-copy-layout.mjs","scripts/stage-split-copy-kernel.mjs","scripts/lib/split-copy-kernel.mjs","scripts/lib/split-copy-kernel-recipe.mjs","tests/split-copy-progress.test.mjs","media/ffmpeg/mpeg2-split-copy.wat","media/ffmpeg/mpeg2-split-copy.wasm"])sourcePins[file]=sha(await read(file));
for(const [file,hash] of Object.entries(sourcePins))`],
  ];
  let generated=source;
  for(const[before,after]of patches){assert.equal(generated.split(before).length,2,before);generated=generated.replace(before,after);}
  let recovered=generated;for(const[before,after]of patches.toReversed())recovered=recovered.replace(after,before);assert.equal(recovered,source);
  // Each mechanical name replacement is itself reversible; no global source
  // rebase inside nested literals. Only ACTUAL top-level imports are relocated.
  const renames=[["split-render-progress","split-copy-progress"],["split-render-${mode}","split-copy-${mode}"],
    ["makeSplitRenderProgressDriver","makeSplitCopyProgressDriver"],["makeSplitRenderProgressTraceHelper","makeSplitCopyProgressTraceHelper"],
    ['"./lib/output-work-checkpoints.mjs"','"./lib/split-copy-work-checkpoints.mjs"']];
  for(const[before,after]of renames){assert.ok(!generated.includes(after)||before==="split-render-progress");generated=generated.replaceAll(before,after);}
  generated=generated.replace(/^import (.*) from "(\.\/lib\/[^\"]+)";$/gm,
    (_line,names,file)=>`import ${names} from ${JSON.stringify(pathToFileURL(path.resolve(root,"scripts",file)).href)};`);
  return {generated,originalSha256:sha(source),generatedSha256:sha(generated),patches,renames};
}
