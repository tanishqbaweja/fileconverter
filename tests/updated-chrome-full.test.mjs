import assert from "node:assert/strict";
import {readFile,writeFile} from "node:fs/promises";
import {execFile} from "node:child_process";
import path from "node:path";
import {promisify} from "node:util";
import {gunzipSync} from "node:zlib";
import test from "node:test";
import {deriveUpdatedChromeFullDriver,deriveUpdatedChromeFullStager,deriveUpdatedChromeSupervisor} from "../scripts/lib/updated-chrome-full-recipe.mjs";
import {createOwnedRuntimeScratch} from "../scripts/lib/owned-runtime-scratch.mjs";
import {sha} from "../scripts/lib/stable-ui-headless-baseline-recipe.mjs";
const root=path.resolve(import.meta.dirname,".."),read=file=>readFile(path.join(root,file));
const parent=JSON.parse(await read("evidence/2026-10-15T22-27-06-823Z-threaded-validation-full-live.json"));
const zip=await read(parent.sourceArchive.path);assert.equal(sha(zip),parent.sourceArchive.sha256);
const archived=JSON.parse(gunzipSync(zip,{maxOutputLength:8388608}));
const media=JSON.parse(await read("evidence/2026-10-16T16-41-46-137Z-updated-chrome-media.json"));
const updated=JSON.parse(gunzipSync(await read(media.sourceArchive.path),{maxOutputLength:2097152}));
test("full actual parent derivation is reversible; every conversion and native validation gate stays byte exact",async()=>{
  const wrapper=await createOwnedRuntimeScratch("updated-chrome-full-wrapper-");
  try {
    const recipe=deriveUpdatedChromeFullDriver(archived.generated,root,wrapper.directory,"allocation-attempt-media-TESTabc",["scripts/run-updated-chrome-full.mjs"],media.browserPinBefore);
    let reversed=recipe.generated;for(const [before,after]of recipe.edits.toReversed())reversed=reversed.replace(after,before);
    assert.equal(reversed,archived.generated);
    for(const token of ['file===source?"4":"1"','timeout:30*60_000,maxBuffer:32*MiB',"requestedRuns: diagnosticOnly ? 1 : 3",'limitMiB: 250',"assert.equal(metrics.wasmMemoryBytes, 0)","assert.equal(metrics.sharedArrayBufferBytes,4)"])
      assert.ok(recipe.generated.includes(token),token);
    assert.ok(recipe.generated.includes("await launchJournal.record(role,identity)"));
    assert.ok(recipe.generated.includes('assert.equal(browserVersion,"155.0.8059.80")'));
    const driver=path.join(wrapper.directory,"probe.mjs");await writeFile(driver,recipe.generated,{flag:"wx"});
    await promisify(execFile)(process.execPath,["--check",driver],{cwd:root,env:wrapper.env,windowsHide:true,maxBuffer:16384});
  }finally{await wrapper.close();}
});
test("new full stager and supervisor preserve old verified semantics and hidden no-restart launches",async()=>{
  const old=updated.recipe.generated,stager=deriveUpdatedChromeFullStager(old.stage,old.candidateName,"allocation-attempt-media-TESTabc");
  assert.equal(stager.generated.replaceAll("allocation-attempt-media-TESTabc",old.candidateName),old.stage);
  const source=(await read("scripts/launch-packet-largest-idle-supervisor.mjs")).toString(),supervisor=deriveUpdatedChromeSupervisor(source,root);
  assert.ok(supervisor.generated.includes('own = "scripts/run-updated-chrome-full.mjs"'));
  assert.ok(supervisor.generated.includes("windowsHide: true"));assert.ok(supervisor.generated.includes("noAutomaticRestart: true"));
  const runtime=await createOwnedRuntimeScratch("updated-supervisor-check-");
  try {const file=path.join(runtime.directory,"supervisor.mjs");await writeFile(file,supervisor.generated,{flag:"wx"});
    await promisify(execFile)(process.execPath,["--check",file],{cwd:root,env:runtime.env,windowsHide:true,maxBuffer:16384});
  }finally{await runtime.close();}
});
