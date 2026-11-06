// Link-only compiler probes. Never run/instantiate a compiled Wasm or media codec.
import assert from "node:assert/strict";
import { readFile, writeFile, realpath } from "node:fs/promises";
import { execFile } from "node:child_process";
import { promisify } from "node:util";
import { createHash } from "node:crypto";
import path from "node:path";
import { createOwnedRuntimeScratch } from "../../scripts/lib/owned-runtime-scratch.mjs";
assert.equal(process.platform, "linux"); assert.equal(process.argv.length, 2);
const root = path.resolve(import.meta.dirname, "../.."), build = path.join(root, "work/vp9-duration-build");
assert.equal(await realpath(build), build);
const runtime = await createOwnedRuntimeScratch("vp9-allocation-link-"), execute = promisify(execFile), sha = value => createHash("sha256").update(value).digest("hex");
const report = { scope: "Two compile/link-only libvpx VP9 detection controls, NOT codec execution", cases: [],
  actualCompilerOutcomeRecorded: true, wasmInstantiated: false, mediaReadOrConverted: false, publicAcceptance: false };
try {
  const file = path.join(runtime.directory,"probe.c");
  await writeFile(file,'#include <vpx/vp8cx.h>\nint main(void) { return !vpx_codec_vp9_cx(); }\n',{flag:"wx"});
  for (const productionAllocator of [false,true]) {
    const args = ["-O3","-pthread","-msimd128","-I"+path.join(build,"install/include"),file,"-L"+path.join(build,"install/lib"),"-lvpx",
      ...(productionAllocator?["-sMALLOC=emmalloc"]:[]),"-o",path.join(runtime.directory,productionAllocator?"production.js":"default.js")];
    let code=0,stderr="";
    try { stderr=(await execute("emcc",args,{cwd:root,env:runtime.env,windowsHide:true,timeout:60000,maxBuffer:262144})).stderr; }
    catch(error) { assert.ok(Number.isInteger(error.code),"Link observation must be terminal, not timeout/spawn failure");code=error.code;stderr=String(error.stderr??""); }
    report.cases.push({ productionAllocator,code,stderrBytes:Buffer.byteLength(stderr),stderrSha256:sha(stderr),
      errorLines:stderr.split(/\r?\n/).filter(line=>/undefined|error:|emmalloc_/.test(line)).slice(0,24).map(line=>line.slice(0,512)) });
  }
  await writeFile(path.join(build,"vp9-allocation-link-proof.json"),JSON.stringify(report,null,2)+"\n",{flag:"wx"});
  console.log(JSON.stringify(report));
  assert.notEqual(report.cases[0].code,0,"Default-allocator probe unexpectedly succeeded; do not assume the suspected cause");
  assert.ok(report.cases[0].errorLines.some(line=>/undefined.*emmalloc_/.test(line)),"Default failure must identify the allocator dependency, not a different error");
  assert.equal(report.cases[1].code,0,"Same production allocator must link VP9 successfully");
  assert.equal(sha(await readFile(path.join(root,"media/ffmpeg/build-remux.sh"))),"904f06e36b2a3ee4509a7cb8faeda3a375314ffd5d1fd119017eb90ad0bb3a9e");
} finally { await runtime.close(); }
