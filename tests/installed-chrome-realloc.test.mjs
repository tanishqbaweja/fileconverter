import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import path from "node:path";
import { spawnSync } from "node:child_process";
import test from "node:test";
import { assertInstalledChromePinsEqual,validateInstalledChromePin } from "../scripts/lib/installed-chrome-pin.mjs";
import { makeInstalledChromeControlCaller,makeInstalledChromeControlBrowserRecipe,makeInstalledChromeMediaCallerFromJournaled } from "../scripts/lib/installed-chrome-realloc-recipe.mjs";
const root=path.resolve(import.meta.dirname,".."),read=name=>readFile(path.join(root,name),"utf8");
const rejection=JSON.parse(await read("evidence/2026-10-14T15-12-33-678Z-realloc-chrome-pin-rejection.json"));
function pin() {const version=rejection.installed.version,base=path.resolve("C:/Program Files/Google/Chrome/Application");return {version,
  launcher:{path:path.join(base,"chrome.exe"),bytes:rejection.installed.bytes,sha256:rejection.installed.launcherSha256,identity:{dev:"1",ino:"2",birthtimeNs:"3",mtimeNs:"4"}},
  library:{path:path.join(base,version,"chrome.dll"),bytes:rejection.installed.libraryBytes,sha256:rejection.installed.librarySha256,identity:{dev:"1",ino:"5",birthtimeNs:"6",mtimeNs:"7"}}};}
function syntax(text) {const value=spawnSync(process.execPath,["--check","--input-type=module"],{input:text,encoding:"utf8",windowsHide:true,timeout:5000});assert.equal(value.status,0,value.stderr);}
test("exact before/after binary version/hash/identity guard rejects stale version, DLL path, SHA, size and replacement",()=>{
  const before=pin();validateInstalledChromePin(before);assertInstalledChromePinsEqual(before,structuredClone(before));
  for(const mutate of [value=>value.version="154.0.8037.98",value=>value.launcher.sha256="0".repeat(64),value=>value.library.bytes++,value=>value.library.identity.ino="8",value=>value.library.path=before.launcher.path]){
    const changed=structuredClone(before);mutate(changed);assert.throws(()=>assertInstalledChromePinsEqual(before,changed));}
});
test("fresh installed-Chrome actual fatal driver/worker/caller retain same native/128-source/privacy/birth/normal-close/finally gates",async()=>{
  const control={originalSha256:"eb45bb276b139f0c0404079c2087d06dfa0f629c400d3f18f5a28ead78521e3c",onlyExportSectionChanged:true,allCodeDataTypesImportsTablesMemoryExact:true,usableForMediaOrAcceptance:false};
  const recipe=makeInstalledChromeControlBrowserRecipe(await read("scripts/check-wasm-abort-capture-origin-checked.mjs"),root,path.join(root,"work/unit-control/control.wasm"),control,"2026-10-14T00-00-00-000Z",pin());
  syntax(recipe.generated);assert.ok(recipe.worker.includes("createCompositeAllocationAbortCapture"));assert.ok(recipe.generated.includes('Actual runtime browser must match qualified installed binary'));
  const caller=makeInstalledChromeControlCaller(await read("scripts/check-realloc-abort-control.mjs"),root);syntax(caller.generated);
  for(const gate of ["files.length<=128","raw.length<=2097152","postSourcePins[file],hash","receipt.nativeEnvelopePost","runtime.close()","assertInstalledChromePinsEqual","installed-chrome-realloc-control-executed-sources.json"])
    assert.ok(caller.generated.includes(gate),gate);
  for(const gate of ["--headless=new","windowsHide: true","worker.terminate()","owned-identity-absent","maximumScalarWords,32","primaryIncrementalPrivateMiB: null"])
    assert.ok(recipe.generated.includes(gate),gate);
});
test("fresh media caller retains every quality/IO/whole-original/256-source cleanup/recovery gate and actual runtime-version checks",async()=>{
  // Lazy imports are executed only for this MEDIA unit, never by actual fatal
  // control; its128-source closure does not pretend to execute the media suite.
  const {makeJournaledReallocMediaCaller}=await import("../scripts/lib/journaled-realloc-media-recipe.mjs");
  const old=makeJournaledReallocMediaCaller(await read("scripts/validate-mpeg2-encoder-plane-goldens.mjs"),root),recipe=makeInstalledChromeMediaCallerFromJournaled(old,root);syntax(recipe.generated);
  for(const gate of ["Keep2GiB host guard","diskBytes >= 2147483648","2958573265","postSourcePins, sourcePins","Preserve failure; no automatic retry","unexpectedFixtureDirs, []","originalFullSourceAcceptance: false","versions.length,4","assertInstalledChromePinsEqual"])
    assert.ok(recipe.generated.includes(gate),gate);
});
