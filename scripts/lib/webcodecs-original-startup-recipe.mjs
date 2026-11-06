// Full protected File, platform-only bounded startup; never completed conversion.
import assert from "node:assert/strict";
import path from "node:path";
import {pathToFileURL} from "node:url";
import {createHash} from "node:crypto";
import {makeWebCodecsOriginalQualification} from "./webcodecs-original-qualification-recipe.mjs";
const sha=s=>createHash("sha256").update(s).digest("hex");
export function makeWebCodecsOriginalStartup(source,root,runId) {
  const qualified=makeWebCodecsOriginalQualification(source,root,runId),parentSha256=qualified.parentSha256,
    edits=[...qualified.edits],smallQualificationSha256=qualified.generatedSha256;
  source=qualified.generated;
  const add=(before,after)=>{assert.equal(source.split(before).length,2,before.slice(0,128));source=source.replace(before,after);edits.push([before,after]);};
  for(const ending of [".json","-failure.zip"])add("2026-11-06-webcodecs-vp9-original-qualification-"+runId+ending,
    "2026-11-06-webcodecs-vp9-original-startup-"+runId+ending);
  add('import { chromium } from "playwright";','import { chromium } from "playwright";\n'+
    'import { runVp9OriginalStartup } from '+JSON.stringify(pathToFileURL(path.join(root,"scripts/lib/vp9-original-startup.mjs")).href)+';\n'+
    'import { selectExactLocalOriginal } from '+JSON.stringify(pathToFileURL(path.join(root,"scripts/lib/mpeg2-original-gate.mjs")).href)+';');
  add('"workers/media-remux.ts",','"workers/media-remux.ts", "scripts/lib/vp9-original-startup.mjs", "scripts/lib/mpeg2-original-gate.mjs",');
  add('scope: "One genuine private VP9 small-worker OPFS conversion with native validation; NOT full production UI, direct picker, A/B speed or original/near10GB qualification",',
    'scope: "Full protected original File, platform encoder/fixed32MiB decoder, five-minute safety gate; NOT completed transcode/fidelity/public acceptance",');
  const first=source.indexOf('  const fixture = path.join(runtime.directory, "explicit-bt709.mkv"),'),last=source.indexOf('  await assert.rejects(access(stage)',first);
  assert.ok(first>0&&last>first);
  add(source.slice(first,last),'  const fixture=path.join(root,"test.mkv"),ffprobe="C:/ffmpeg/bin/ffprobe.exe";\n'+
    '  report.sourceProbe=JSON.parse((await execute(ffprobe,["-v","error","-show_streams","-show_format","-of","json",fixture],\n'+
    '    {cwd:root,env:runtime.env,windowsHide:true,timeout:30000,maxBuffer:1048576})).stdout);\n'+
    '  const videos=report.sourceProbe.streams.filter(s=>s.codec_type==="video"&&!s.disposition?.attached_pic);assert.equal(videos.length,1);\n'+
    '  assert.deepEqual([videos[0].codec_name,videos[0].width,videos[0].height,videos[0].avg_frame_rate],["hevc",1920,804,"24/1"]);\n'+
    '  assert.deepEqual([videos[0].color_primaries,videos[0].color_transfer,videos[0].color_space,videos[0].color_range],["bt709","bt709","bt709","tv"]);\n'+
    '  report.fixture={path:"test.mkv",...report.originalBefore,protectedOriginal:true,generated:false,copied:false,truncated:false};\n');
  add('  const disk = await statfs(root); assert.ok(disk.bavail * disk.bsize >= 1024 ** 3);',
    '  const disk=await statfs(root);report.diskPreflight={freeBytes:disk.bavail*disk.bsize,minimumBytes:2147483648};\n'+
    '  assert.ok(report.diskPreflight.freeBytes>=report.diskPreflight.minimumBytes);');
  add('await page.locator(\'input[type="file"]\').first().setInputFiles(fixture);','report.inputSelection=await selectExactLocalOriginal(page,fixture);');
  const start=source.indexOf('  outputFile = await open(converted, "wx");'),endText='  report.status = "passed-private-vp9-recovery-sequence-not-large-or-public-acceptance";',end=source.indexOf(endText,start);
  assert.ok(start>0&&end>start);
  add(source.slice(start,end+endText.length),'  report.originalStartup={};report.platformEncoderOnly=true;\n'+
    '  observer.setPhase("conversion");report.conversionStartedAt=new Date().toISOString();\n'+
    '  try {await runVp9OriginalStartup({page,observer,blankBaseline:report.blankBaseline,evidence:report.originalStartup,backend:"platform"});}\n'+
    '  finally {report.browserResult=report.originalStartup.result;report.memory=report.originalStartup.memory;report.conversionEndedAt=new Date().toISOString();}\n'+
    '  assert.deepEqual(report.forbiddenRequests,[]);\n'+
    '  report.status="passed-private-platform-original-startup-only-not-completed-transcode";');
  let reverse=source;for(const [before,after]of edits.toReversed()){assert.equal(reverse.split(after).length,2);reverse=reverse.replace(after,before);}assert.equal(sha(reverse),parentSha256);
  return {generated:source,generatedSha256:sha(source),parentSha256,edits,smallQualificationSha256,nativeRunId:runId,reversible:true,
    originalPassedWithoutCopyOrExcerpt:true,platformOnly:true,memoryBaselineWindowOrThresholdChanged:false,
    startupOnly:true,fullOriginalConverted:false,independentFullFidelityPassed:false,publicAcceptance:false};
}
