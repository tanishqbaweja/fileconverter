import assert from "node:assert/strict";
import { execFile } from "node:child_process";
import { promisify } from "node:util";
const execute=promisify(execFile);
export async function queryReliableProcessIdentity(pid,{query,pause=ms=>new Promise(resolve=>setTimeout(resolve,ms))}={}) {
  assert.ok(Number.isSafeInteger(pid)&&pid>0);
  const inspect=query??(async()=>{
    const script=`$ErrorActionPreference='Stop'; ConvertTo-Json -InputObject @(Get-CimInstance Win32_Process -Filter 'ProcessId = ${pid}' | ForEach-Object {@{pid=[int]$_.ProcessId;parentPid=[int]$_.ParentProcessId;createdAt=$_.CreationDate.ToUniversalTime().ToString('o')}}) -Compress`;
    const {stdout}=await execute("powershell.exe",["-NoProfile","-NonInteractive","-Command",script],{windowsHide:true,timeout:15000,maxBuffer:16384});
    const rows=JSON.parse(stdout);assert.ok(Array.isArray(rows)&&rows.length<=1);return rows[0]??null;
  });
  let failure;
  for(let attempt=0;attempt<3;attempt++) {
    try {
      const value=await inspect();assert.ok(value===null||(value.pid===pid&&Number.isSafeInteger(value.parentPid)&&Number.isFinite(Date.parse(value.createdAt))));
      return value;
    }catch(error){failure=error;if(attempt<2)await pause(250);}
  }
  throw failure; // Exhausted/unavailable is never absence or permission to kill.
}
