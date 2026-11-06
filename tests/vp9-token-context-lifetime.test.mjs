import assert from "node:assert/strict";
import {test} from "node:test";
import {readFile} from "node:fs/promises";
import {createHash} from "node:crypto";
import {VP9_TOKEN_CONTEXT_LIFETIME_PINS,verifyVp9TokenContextLifetime} from "../media/ffmpeg/vp9-token-context-lifetime.mjs";
const read=f=>readFile(new URL("../"+f,import.meta.url),"utf8");
test("pinned lifetime inventory includes context aliases, allocation macro, copies and whole-object initialization",async()=>{
  const r=JSON.parse(await read("evidence/2026-11-06-vp9-token-context-lifetime-audit.json"));
  assert.equal(r.cFiles,880);assert.equal(r.references.length,17);assert.equal(r.references.reduce((n,v)=>n+v.matches.length,0),133);
  for(const [file,pin]of Object.entries(VP9_TOKEN_CONTEXT_LIFETIME_PINS)) {
    const row=r.preimages[file]??r.references.find(v=>v.file===file);assert.equal(row.sha256,pin);
    if(row.exactSource)assert.equal(createHash("sha256").update(row.exactSource).digest("hex"),pin);
  }
  const actualOperations=r.wholeObjectOperations.flatMap(f=>f.matches.filter(m=>!m.text.match(/^(?:const )?(?:VP9_COMMON|struct VP9Common) \*cm =/)));
  assert.deepEqual(actualOperations.map(m=>m.text),["vp9_zero(*cpi);"]);
  const encoder=r.references.find(v=>v.file==="vp9/encoder/vp9_encoder.c");
  assert.equal(encoder.matches.filter(m=>m.text.includes("CHECK_MEM_ERROR(&cm->error, cm->fc,")).length,1);
  assert.deepEqual(encoder.matches.filter(m=>/cm->fc\s*=/.test(m.text)).map(m=>m.text),
    ["*cm->fc = cm->frame_contexts[cm->frame_context_idx];","*cm->fc = cc->fc;"]);
  assert.equal(r.semanticProofForArbitrarySources,false);assert.equal(r.actualSavedBytes,null);assert.equal(r.publicAcceptance,false);
});
test("missing or changed lifetime sources fail closed before patching",()=>{
  assert.throws(()=>verifyVp9TokenContextLifetime({},""),/Pinned context-lifetime source/);
  assert.throws(()=>verifyVp9TokenContextLifetime({"vp9/common/vp9_onyxc_int.h":"FRAME_CONTEXT *fc;"},""),/Pinned context-lifetime source/);
});
test("native generator checks lifetime before edits and obtains actual build layout after library configuration",async()=>{
  const script=await read("media/ffmpeg/make-vp9-token-context-source.mjs");
  assert.ok(script.indexOf("verifyVp9TokenContextLifetime(lifetimeSources,currentEncoder)")<script.indexOf("await writeFile(path.join(vendor,file),generated)"));
  assert.ok(script.includes("runVp9TokenContextCUnit(preimages)"));assert.ok(script.includes("actualLibraryConfiguration:true"));
  assert.ok(script.includes('readFile(path.join(vendor,"vpx_config.h")'));
  assert.ok(script.includes('windowsHide:true'));assert.ok(script.includes('codecInstantiated:false'));
});
