// Same original CPU1920/24fps/4Mbps guard, composed with qualified HTTP delivery
// and identity cleanup. No excerpt, settings change or full-file acceptance.
import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import path from "node:path";
import { pathToFileURL } from "node:url";
import { makeVp9CpuSpecialistQualificationSource } from "./vp9-cpu-specialist-qualification-recipe.mjs";
const sha=s=>createHash("sha256").update(s).digest("hex");
export function makeVp9CpuSpecialistOriginalSource(parent,root,runId){
  const qualified=makeVp9CpuSpecialistQualificationSource(parent,root,runId);
  let source=qualified.generated;const edits=[],prefix="2026-11-20-vp9-cpu-specialist-original-startup-"+runId;
  const add=(before,after)=>{assert.equal(source.split(before).length,2,before.slice(0,160));source=source.replace(before,after);edits.push([before,after]);};
  const all=(before,after,count)=>{assert.equal(source.split(before).length,count+1);const prior=source;add(prior,prior.replaceAll(before,after));};
  const url=file=>JSON.stringify(pathToFileURL(path.join(root,"scripts/lib",file)).href);
  all("2026-11-20-vp9-cpu-specialist-qualification-"+runId,prefix,3);
  add('import { chromium } from "playwright";', 'import { chromium } from "playwright";\n'+
    'import {runVp9OriginalStartup} from '+url("vp9-original-startup.mjs")+';\n'+
    'import {selectExactLocalOriginal} from '+url("mpeg2-original-gate.mjs")+';\n'+
    'import {parseVp9AllocationFailure} from '+url("vp9-allocation-failure.mjs")+';\n'+
    'import {startClassifiedChromiumMemoryMonitor} from '+url("birth-type-capture.mjs")+';\n'+
    'import {createLosslessNativeMemoryJournal,compactLosslessNativeMemoryJournal} from '+url("lossless-native-memory-journal.mjs")+';');
  add('scope: "One genuine private VP9 small-worker OPFS conversion with native validation; NOT full production UI, direct picker, A/B speed or original/near10GB qualification",',
    'scope: "Untouched full original input, explicit CPU1920x804/24fps/4Mbps five-minute startup safety gate; NOT completed full-file conversion/fidelity/public acceptance",');
  add('let httpAssets;', 'let httpAssets,journal;\nconst journalTransitions=[{at:0,phase:"blank-baseline"}];');
  add('"scripts/lib/vp9-http-recipe.mjs",', '"scripts/lib/vp9-http-recipe.mjs", '+[
    "scripts/lib/vp9-cpu-specialist-original-recipe.mjs","scripts/test-vp9-cpu-specialist-original.mjs",
    "scripts/lib/vp9-original-startup.mjs","scripts/lib/mpeg2-original-gate.mjs","scripts/lib/vp9-allocation-failure.mjs",
    "scripts/lib/birth-type-capture.mjs","scripts/lib/lossless-native-memory-journal.mjs","scripts/lib/persistent-chromium-memory.mjs",
    "evidence/2026-11-20-vp9-cpu-specialist-qualification-"+runId+".json",
  ].map(JSON.stringify).join(", ")+",");
  add('  const disk = await statfs(root); assert.ok(disk.bavail * disk.bsize >= 1024 ** 3);',
    '  const disk = await statfs(root);report.diskPreflight={freeBytes:disk.bavail*disk.bsize,minimumBytes:2147483648};\n'+
    '  assert.ok(report.diskPreflight.freeBytes>=report.diskPreflight.minimumBytes);');
  const start=source.indexOf('  const fixture = path.join(runtime.directory, "explicit-bt709.mkv"),'),end=source.indexOf('  await assert.rejects(access(stage)',start);
  assert.ok(start>0&&end>start);
  add(source.slice(start,end),'  const fixture=path.join(root,"test.mkv"),ffprobe="C:/ffmpeg/bin/ffprobe.exe";\n'+
    '  report.sourceProbe=JSON.parse((await execute(ffprobe,["-v","error","-show_streams","-show_format","-of","json",fixture],{cwd:root,env:runtime.env,windowsHide:true,timeout:30000,maxBuffer:1048576})).stdout);\n'+
    '  const video=report.sourceProbe.streams.filter(s=>s.codec_type==="video"&&!s.disposition?.attached_pic);\n'+
    '  assert.equal(video.length,1);assert.deepEqual([video[0].codec_name,video[0].width,video[0].height,video[0].avg_frame_rate],["hevc",1920,804,"24/1"]);\n'+
    '  report.fixture={path:"test.mkv",...report.originalBefore,protectedOriginal:true,generated:false,copied:false,truncated:false};\n');
  add('    nativeMonitor = await startChromiumMemoryMonitor(...args); return nativeMonitor;',
    '    const file=path.join(root,"output/playwright/'+prefix+'-native.ndjson");await mkdir(path.dirname(file),{recursive:true});\n'+
    '    journal=await createLosslessNativeMemoryJournal(chrome.pid,file);\n'+
    '    nativeMonitor=await startClassifiedChromiumMemoryMonitor(...args);\n'+
    '    return {...nativeMonitor,async drain(){const batch=await nativeMonitor.drain();\n'+
    '      await journal.appendBatch({...batch,samples:batch.samples.map(s=>({...s,phase:journalTransitions.findLast(t=>t.at<=Date.parse(s.timestamp)).phase}))});return batch;}};');
  add('  } }); observerBirth = await queryReliableProcessIdentity(observer.pid); assert.ok(observerBirth);',
    '  } }); observerBirth = await queryReliableProcessIdentity(observer.pid); assert.ok(observerBirth);\n'+
    '  const originalSetPhase=observer.setPhase;observer.setPhase=phase=>{const at=originalSetPhase(phase);assert.ok(journalTransitions.length<256);journalTransitions.push({at,phase});return at;};');
  add('await page.locator(\'input[type="file"]\').first().setInputFiles(fixture);', 'report.inputSelection=await selectExactLocalOriginal(page,fixture);');
  const conversionStart=source.indexOf('  outputFile = await open(converted, "wx");'),terminal='  report.status = "passed-private-vp9-recovery-sequence-not-large-or-public-acceptance";',conversionEnd=source.indexOf(terminal,conversionStart);
  assert.ok(conversionStart>0&&conversionEnd>conversionStart);
  add(source.slice(conversionStart,conversionEnd+terminal.length),
    '  report.workerIsolation=false;report.explicitCpuWorker=true;report.originalStartup={};\n'+
    '  observer.setPhase("conversion");report.conversionStartedAt=new Date().toISOString();\n'+
    '  try {await runVp9OriginalStartup({page,observer,blankBaseline:report.blankBaseline,evidence:report.originalStartup});}\n'+
    '  finally {report.browserResult=report.originalStartup.result;report.memory=report.originalStartup.memory;report.conversionEndedAt=new Date().toISOString();report.allocationDiagnostics=parseVp9AllocationFailure(report.browserResult?.message);}\n'+
    '  await httpAssets.through();assert.deepEqual(report.privateCpuOverride.served,{javascript:1,wasm:1});assert.equal(report.privateAssetErrorCount,0);assert.deepEqual(report.forbiddenRequests,[]);\n'+
    '  report.status="passed-private-original-startup-only-not-completed-transcode";');
  add('  catch (error) { report.failures.push("Memory observer: " + error); }',
    '  catch (error) { report.failures.push("Memory observer: " + error); }\n'+
    '  if(journal){try{const raw=await journal.close();report.nativeJournal=await compactLosslessNativeMemoryJournal(raw);}\n'+
    '    catch(error){report.failures.push("Native journal: "+error);try{report.nativeJournal=await compactLosslessNativeMemoryJournal(await journal.failedReceipt());}catch(retentionError){report.failures.push("Native failed journal retention: "+retentionError);}}}');
  let reversed=source;for(const [before,after]of [...qualified.edits,...edits].toReversed()){assert.equal(reversed.split(after).length,2);reversed=reversed.replace(after,before);}assert.equal(reversed,parent);
  return {generated:source,parentSha256:sha(parent),generatedSha256:sha(source),edits:[...qualified.edits,...edits],reversible:true,nativeRunId:runId,
    fullProtectedOriginalWithoutCopyOrExcerpt:true,unchangedOriginalStartupSettings:true,wholeTreeLimitMiB:250,baselineChanged:false,
    fullNativeJournalRequired:true,contemporaryBirthRoleCapture:true,servicesDisabled:false,speedGainProven:false,
    startupOnly:true,fullFileAcceptance:false,publicAcceptance:false};
}
