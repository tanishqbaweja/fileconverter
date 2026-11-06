// Exact derivation of the real positive-platform control, with strict validators.
import assert from "node:assert/strict";
import path from "node:path";
import {pathToFileURL} from "node:url";
import {createHash} from "node:crypto";
const sha=s=>createHash("sha256").update(s).digest("hex");
export function makeWebCodecsOriginalQualification(source,root,runId) {
  assert.ok(path.isAbsolute(root));assert.match(runId,/^\d{8,14}$/);assert.notEqual(runId,"41309113218");
  assert.equal(sha(source),"2e1f6315144c0eeb152edc4f46d838a83b66c98f6de1e8e7e3293b93f4091f80");
  const parentSha256=sha(source),edits=[],add=(before,after)=>{
    assert.equal(source.split(before).length,2,before.slice(0,128));source=source.replace(before,after);edits.push([before,after]);
  };
  for(const ending of [".json","-failure.zip"])add("2026-11-01-webcodecs-vp9-rebuilt-native"+ending,
    "2026-11-06-webcodecs-vp9-original-qualification-"+runId+ending);
  add("evidence/2026-11-01-webcodecs-vp9-native-41309113218.json","evidence/2026-11-06-webcodecs-vp9-original-native-"+runId+".json");
  add("work/webcodecs-vp9-input-41309113218","work/webcodecs-vp9-input-"+runId);
  add('  report.baselineAdjusted = false; report.baselineAvailable = report.blankBaseline?.stable === true;\n'+
    '  if (!report.baselineAvailable) report.failures.push("Earliest stable blank baseline unavailable; collect functional facts, retain overall failure and null incremental memory");',
    '  assert.equal(report.blankBaseline?.stable,true,"Same strict blank baseline required before app/conversion; no extension or inflation");\n'+
    '  report.baselineAdjusted = false; report.baselineAvailable = true;');
  const helpers={validateSmallVp9Fidelity:"small-vp9-fidelity",inspectSmallMatroskaTimingFile:"small-matroska-stored-timing",
    qualifyVp9Recovery:"vp9-recovery-qualification",assertPlatformVp9Terminal:"platform-vp9-terminal"};
  add('import { chromium } from "playwright";','import { chromium } from "playwright";\n'+Object.entries(helpers)
    .map(([name,file])=>'import { '+name+' } from '+JSON.stringify(pathToFileURL(path.join(root,"scripts/lib/"+file+".mjs")).href)+';').join("\n"));
  add('"workers/media-remux.ts",','"workers/media-remux.ts", '+Object.values(helpers).map(file=>JSON.stringify("scripts/lib/"+file+".mjs")).join(", ")+',');
  add('report.independentFullDecodePassed = true;','report.independentFullDecodePassed = true;\n'+
    '  report.outputSha256 = await hashFile(converted);\n'+
    '  report.independentFidelity = await validateSmallVp9Fidelity({root,source:fixture,output:converted,sourceProbe:report.sourceProbe,outputProbe:report.outputProbe,ffmpeg,ffprobe,env:runtime.env});\n'+
    '  assert.equal(report.independentFidelity.passed,true,JSON.stringify(report.independentFidelity.failures));\n'+
    '  report.storedTiming = {source:await inspectSmallMatroskaTimingFile(fixture),output:await inspectSmallMatroskaTimingFile(converted)};\n'+
    '  assert.equal(report.storedTiming.source.tracks[0].defaultDurationNs,41666666);\n'+
    '  assert.equal(report.storedTiming.output.tracks[0].defaultDurationNs,41666666);\n'+
    '  assert.equal(report.storedTiming.output.blocks.length,48);\n'+
    '  assert.ok(report.storedTiming.output.blocks.every(row=>row.kind==="SimpleBlock"&&!row.invisible));\n'+
    '  report.storedTiming.explicitDefaultDurationGatePassed = true;\n'+
    '  assertPlatformVp9Terminal(report.browserResult);');
  add('  report.status = "passed-one-small-private-browser-conversion-not-public-or-stress-acceptance";',
    '  report.recovery = {};report.initialMemory=report.memory;\n'+
    '  try {await qualifyVp9Recovery({page,observer,evidence:report.recovery,root,directory:runtime.directory,source:fixture,sourceProbe:report.sourceProbe,\n'+
    '    ffmpeg,ffprobe,env:runtime.env,blankBaseline:report.blankBaseline,loadedIdle:report.loadedIdle,sampleChromiumTree,chromePid:chrome.pid,\n'+
    '    initialOutputSha256:report.outputSha256,backend:"platform"});}\n'+
    '  finally {if(report.recovery.memory)report.memory=report.recovery.memory;}\n'+
    '  assert.equal(report.recovery.passed,true);report.platformEncoderOnly=true;\n'+
    '  report.status = "passed-private-vp9-recovery-sequence-not-large-or-public-acceptance";');
  let reverse=source;for(const [before,after]of edits.toReversed()){assert.equal(reverse.split(after).length,2);reverse=reverse.replace(after,before);}
  assert.equal(sha(reverse),parentSha256);
  return {generated:source,generatedSha256:sha(source),parentSha256,edits,reversible:true,nativeRunId:runId,
    sameStrictFidelityThresholds:true,baselineFormulaWindowOrThresholdChanged:false,
    cpuFallbackCanPass:false,originalOrLargeFileAcceptance:false,speedGainProven:false,publicAcceptance:false};
}
