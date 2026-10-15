import assert from "node:assert/strict";
import { test } from "node:test";
import { promisify } from "node:util";
import { execFile } from "node:child_process";
import { versionCommand,isReadonlyPreflight,retryReadonlyPreflight } from "../scripts/lib/reliable-readonly-preflight.mjs";
import { inspectInstalledChromePin } from "../scripts/lib/installed-chrome-pin.mjs";
test("retry is bounded, unavailable stays failure, and only exact headless readonly preflight commands qualify",async()=>{
  const options={windowsHide:true,timeout:5000,maxBuffer:16384},args=["-NoProfile","-NonInteractive","-Command",versionCommand];
  assert.equal(isReadonlyPreflight("powershell.exe",args,options),true);
  for(const [file,changed,opts]of [["ffmpeg",args,options],["powershell.exe",[...args,"extra"],options],
    ["powershell.exe",args,{...options,windowsHide:false}],["powershell.exe",args,{...options,timeout:21600000}],
    ["powershell.exe",[...args.slice(0,3),versionCommand+";Remove-Item x"],options]])assert.equal(isReadonlyPreflight(file,changed,opts),false);
  let attempts=0;assert.equal(await retryReadonlyPreflight(async()=>{if(++attempts<3)throw new Error("query timeout");return"actual";},{pause:async()=>{}}),"actual");
  assert.equal(attempts,3);attempts=0;
  await assert.rejects(retryReadonlyPreflight(async()=>{attempts++;throw new Error("unavailable");},{pause:async()=>{}}),/unavailable/);assert.equal(attempts,3);
});
test("ordinary subprocess/promise semantics and actual full binary version/hash pin remain unchanged",async()=>{
  const {stdout,stderr}=await promisify(execFile)(process.execPath,["-e","process.stdout.write('bounded');process.stderr.write('diagnostic')"],{windowsHide:true,timeout:5000,maxBuffer:16384});
  assert.equal(stdout,"bounded");assert.equal(stderr,"diagnostic");
  const pin=await inspectInstalledChromePin();assert.equal(pin.version,"155.0.8059.40");
  assert.equal(pin.launcher.sha256,"f76f0234efb271041dc84f9f38fb858e01859d5da6f775f5108668eb3ae80975");
  assert.equal(pin.library.sha256,"b3d501c2e9af53f3e9e5d44c006aa42ed137cfb2d1dc161e3eca77cfbd48ea21");
});
test("full retry caller retains all708 previous paths within original128-file/2MiB layer",async()=>{
  const {default:path}=await import("node:path"),{readFile}=await import("node:fs/promises"),{spawnSync}=await import("node:child_process");
  const {makeEbmlFullCaller}=await import("../scripts/lib/preflight-handoff-full-recipe.mjs");
  const {captureLayeredFullSourcePins}=await import("../scripts/lib/composited-handoff-full-sources.mjs");
  const root=path.resolve(import.meta.dirname,"..");
  process.env.WITHIN_DURATION_DRAIN_CONTROL_RECEIPT="evidence/2026-10-15T10-37-24-961Z-duration-drain-browser-control-executed-sources.json";
  process.env.WITHIN_COMPOSITED_HANDOFF_MEDIA="evidence/2026-10-15T17-20-01-310Z-composited-handoff-media.json";
  const caller=await makeEbmlFullCaller(root),snapshot=await captureLayeredFullSourcePins(root,caller.extraFiles);
  const previous=JSON.parse(await readFile(path.join(root,"evidence/2026-10-15T17-32-47-545Z-composited-handoff-original-full-terminal.json")));
  for(const [file,hash]of Object.entries(previous.sourcePins))assert.equal(snapshot.pins[file],hash,file);
  assert.equal(snapshot.files.length,714);assert.equal(snapshot.extensionFiles.length,126);assert.ok(snapshot.supplementalRestoredBytes<=2097152);
  const syntax=spawnSync(process.execPath,["--check","--input-type=module"],{input:caller.generated,encoding:"utf8",windowsHide:true,timeout:5000});assert.equal(syntax.status,0,syntax.stderr);
  assert.ok(caller.generated.includes('readonlyPreflight:{source:"scripts/lib/reliable-readonly-preflight.mjs"'));
  assert.ok(caller.generated.includes("primaryLimitMiB: 250"));assert.ok(caller.generated.includes("requestedRuns: 3"));
});
