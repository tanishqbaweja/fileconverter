// Harness-only opt-in. Exact read-only Windows identity queries, never codec/monitor/deadline changes.
import assert from "node:assert/strict";
import childProcess from "node:child_process";
import { syncBuiltinESMExports } from "node:module";
import { promisify } from "node:util";
import { pathToFileURL } from "node:url";
export const versionCommand="$ErrorActionPreference='Stop'; (Get-Item -LiteralPath 'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe').VersionInfo.ProductVersion";
export function isReadonlyPreflight(file,args,options) {
  if(file!=="powershell.exe"||!Array.isArray(args)||args.length!==4||args[0]!=="-NoProfile"||args[1]!=="-NonInteractive"||
    args[2]!=="-Command"||options?.windowsHide!==true||![3000,5000].includes(options.timeout)||options.maxBuffer!==16384)return false;
  if(args[3]===versionCommand)return true;
  return /^\$ErrorActionPreference = 'Stop'; ConvertTo-Json -InputObject @\(Get-CimInstance Win32_Process -Filter 'ProcessId = [1-9]\d*' \| ForEach-Object \{ @\{ pid = \[int\]\$_\.ProcessId; parentPid = \[int\]\$_\.ParentProcessId; createdAt = \$_\.CreationDate\.ToUniversalTime\(\)\.ToString\('o'\) \} \}\) -Compress$/.test(args[3]);
}
export async function retryReadonlyPreflight(operation,{pause=ms=>new Promise(resolve=>setTimeout(resolve,ms))}={}) {
  let failure;
  for(let attempt=0;attempt<3;attempt++) {
    try{return await operation(attempt);}
    catch(error){failure=error;if(attempt<2)await pause(250);}
  }
  throw failure; // Never invent a version, hash, PID identity or absence.
}
const original=childProcess.execFile,originalPromise=original[promisify.custom];assert.equal(typeof originalPromise,"function");
function scopedExecFile(file,args,options,...tail) {
  return original.call(this,file,args,isReadonlyPreflight(file,args,options)?{...options,timeout:15000}:options,...tail);
}
Object.defineProperty(scopedExecFile,promisify.custom,{value:function(file,args,options,...tail){
  if(!isReadonlyPreflight(file,args,options))return originalPromise.call(this,file,args,options,...tail);
  return retryReadonlyPreflight(()=>originalPromise.call(this,file,args,{...options,timeout:15000},...tail));
}});
childProcess.execFile=scopedExecFile;syncBuiltinESMExports();
// Propagate only to this opted-in test's Node descendants, including stagers and
// independent source-qualified helper scripts. Chromium does not consume this.
const option="--import="+pathToFileURL(import.meta.filename).href;
if(!(process.env.NODE_OPTIONS??"").includes(option))process.env.NODE_OPTIONS=[process.env.NODE_OPTIONS??"",option].filter(Boolean).join(" ");
