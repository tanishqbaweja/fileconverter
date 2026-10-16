import assert from "node:assert/strict";
import {execFile} from "node:child_process";
import {access,readFile,rm,writeFile} from "node:fs/promises";
import path from "node:path";
import {promisify} from "node:util";
import {gzipSync,gunzipSync} from "node:zlib";
import test from "node:test";
import {createOwnedRuntimeScratch} from "../scripts/lib/owned-runtime-scratch.mjs";
import {deriveRecordedTimelineDriver,deriveRecordedTimelineCaller,deriveRecordedTimelineSupervisor} from "../scripts/lib/recorded-timeline-full-recipe.mjs";
import {captureUpdatedFullSources,writeUpdatedFullArchive,materializeUpdatedFullArchive} from "../scripts/lib/recorded-timeline-full-sources.mjs";
import {loadSourceTimelineQualification,TIMELINE_RUNTIME_FILES} from "../scripts/lib/source-timeline-qualification.mjs";
import {sha} from "../scripts/lib/stable-ui-headless-baseline-recipe.mjs";
const root=path.resolve(import.meta.dirname,".."),read=file=>readFile(path.join(root,file));
const parent=JSON.parse(await read("evidence/2026-10-16T17-01-47-260Z-updated-chrome-full-terminal.json"));
const zip=await read(parent.sourceArchive.path);assert.equal(sha(zip),parent.sourceArchive.sha256);const archive=JSON.parse(gunzipSync(zip,{maxOutputLength:8388608}));
test("driver/caller/supervisor derivations reverse exactly and keep full validation and memory gates",async()=>{
  const runtime=await createOwnedRuntimeScratch("recorded-timeline-full-wrapper-");
  try {
    const driver=deriveRecordedTimelineDriver(archive.driver,root,runtime.directory,"allocation-attempt-media-TESTabc",["scripts/run-recorded-timeline-full.mjs"]);
    const callerSource=(await read("scripts/run-updated-chrome-full.mjs")).toString(),caller=deriveRecordedTimelineCaller(callerSource,root);
    const supervisorSource=(await read("scripts/launch-packet-largest-idle-supervisor.mjs")).toString(),supervisor=deriveRecordedTimelineSupervisor(supervisorSource,root);
    for(const [source,recipe]of [[archive.driver,driver],[callerSource,caller],[supervisorSource,supervisor]]) {
      let reversed=recipe.generated;for(const [before,after]of recipe.edits.toReversed())reversed=reversed.replace(after,before);assert.equal(reversed,source);
    }
    for(const token of ["maximumTimestampErrorSeconds <= 0.001","assert.equal(ownership.frames, outputTimes.length)","assert.equal(ownership.packets, outputTimes.length)",
      "timeout:30*60_000,maxBuffer:32*MiB","requestedRuns: diagnosticOnly ? 1 : 3","limitMiB: 250","assert.equal(metrics.wasmMemoryBytes, 0)"])
      assert.ok(driver.generated.includes(token),token);
    assert.ok(driver.generated.includes("createRecordedFrameValidator({root,source"));assert.ok(driver.generated.includes("sourceTimelineReference:sourceTimelineQualification.referenceBinding"));
    assert.ok(driver.generated.includes("frameValidationReceipt:error.frameValidationReceipt??null"));
    assert.ok(caller.generated.includes("previous.pins).length,750"));assert.ok(caller.generated.includes("generatedCaller:await readFile(import.meta.filename"));
    assert.ok(supervisor.generated.includes("noAutomaticRestart: true"));
    for(const [name,recipe]of [["driver.mjs",driver],["caller.mjs",caller],["supervisor.mjs",supervisor]]) {
      const file=path.join(runtime.directory,name);await writeFile(file,recipe.generated,{flag:"wx"});
      await promisify(execFile)(process.execPath,["--check",file],{cwd:root,env:runtime.env,windowsHide:true,maxBuffer:16384});
    }
  }finally{await runtime.close();}
});
test("new source layer replays every750 parent source with unchanged additive caps",async()=>{
  const timeline=await loadSourceTimelineQualification(root),snapshot=await captureUpdatedFullSources(root,[...timeline.files,...TIMELINE_RUNTIME_FILES]);
  assert.equal(snapshot.limits.parentFiles,750);assert.equal(snapshot.limits.extensionFiles,128);assert.equal(snapshot.limits.extensionRestoredBytes,2097152);
  assert.equal(snapshot.all750ParentPreimagesRetained,true);for(const [file,hash]of Object.entries(parent.sourcePins))assert.equal(snapshot.pins[file],hash,file);
  const stamp=new Date().toISOString().replaceAll(/[:.]/g,"-"),runtime=await createOwnedRuntimeScratch("recorded-source-test-");let saved;
  try {
    saved=await writeUpdatedFullArchive(root,stamp,snapshot,{driver:archive.driver,stager:archive.stager,traceHelper:archive.traceHelper,supervisor:archive.supervisor,generatedCaller:archive.generatedCaller??"// synthetic zero-execution seal test"});
    const replay=await materializeUpdatedFullArchive(root,saved);assert.deepEqual(replay.pins,snapshot.pins);
    const changed=structuredClone(replay);changed.limits.extensionFiles=129;const raw=Buffer.from(JSON.stringify(changed)),zip=gzipSync(raw);
    const file=path.join(runtime.directory,"invalid.json.gz");await writeFile(file,zip,{flag:"wx"});
    await assert.rejects(materializeUpdatedFullArchive(root,{path:path.relative(root,file).replaceAll("\\","/"),bytes:zip.length,sha256:sha(zip),restoredBytes:raw.length,restoredSha256:sha(raw),sourceCount:Object.keys(snapshot.pins).length}));
  }finally{if(saved){const file=path.join(root,saved.path);assert.equal(sha(await readFile(file)),saved.sha256);await rm(file);await assert.rejects(access(file),{code:"ENOENT"});}await runtime.close();}
});
