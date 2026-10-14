// Read-only installed browser identity; no launching/updating/killing browsers.
import assert from "node:assert/strict";
import { execFile } from "node:child_process";
import { createHash } from "node:crypto";
import { createReadStream } from "node:fs";
import { lstat,realpath } from "node:fs/promises";
import path from "node:path";
import { promisify } from "node:util";
const exec=promisify(execFile),launcher=path.resolve("C:/Program Files/Google/Chrome/Application/chrome.exe");
async function installedVersion() {
  const {stdout}=await exec("powershell.exe",["-NoProfile","-NonInteractive","-Command","$ErrorActionPreference='Stop'; (Get-Item -LiteralPath 'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe').VersionInfo.ProductVersion"],
    {windowsHide:true,timeout:5000,maxBuffer:16384});
  const version=stdout.trim();assert.match(version,/^\d+\.\d+\.\d+\.\d+$/);return version;
}
async function binary(file) {
  const before=await lstat(file,{bigint:true});assert.ok(before.isFile()&&!before.isSymbolicLink());
  assert.equal((await realpath(file)).toLowerCase(),file.toLowerCase());assert.ok(before.size>0n&&before.size<=1073741824n);
  const digest=createHash("sha256");for await(const chunk of createReadStream(file,{highWaterMark:1048576}))digest.update(chunk);
  const after=await lstat(file,{bigint:true});for(const key of ["dev","ino","size","birthtimeNs","mtimeNs"])assert.equal(after[key],before[key],"Browser binary changed while hashing");
  return {path:file,bytes:Number(before.size),sha256:digest.digest("hex"),identity:{dev:String(before.dev),ino:String(before.ino),birthtimeNs:String(before.birthtimeNs),mtimeNs:String(before.mtimeNs)}};
}
export async function inspectInstalledChromePin() {
  assert.equal(process.platform,"win32");
  const version=await installedVersion();
  const pin={version,launcher:await binary(launcher),library:await binary(path.join(path.dirname(launcher),version,"chrome.dll"))};
  assert.equal(await installedVersion(),version,"Browser version changed during binary snapshot");
  validateInstalledChromePin(pin);return pin;
}
export function validateInstalledChromePin(pin) {
  assert.match(pin.version,/^\d+\.\d+\.\d+\.\d+$/);assert.equal(pin.launcher.path,launcher);
  assert.equal(pin.library.path,path.join(path.dirname(launcher),pin.version,"chrome.dll"));
  for(const row of [pin.launcher,pin.library]){assert.ok(Number.isSafeInteger(row.bytes)&&row.bytes>0&&row.bytes<=1073741824);assert.match(row.sha256,/^[0-9a-f]{64}$/);
    assert.deepEqual(Object.keys(row.identity).sort(),["birthtimeNs","dev","ino","mtimeNs"]);
    for(const value of Object.values(row.identity))assert.match(value,/^[0-9]+$/);}
}
export function assertInstalledChromePinsEqual(before,after) {validateInstalledChromePin(before);validateInstalledChromePin(after);assert.deepEqual(after,before,"Installed browser version/bytes/identity changed during qualification");}
