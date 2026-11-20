import assert from "node:assert/strict";
import { test } from "node:test";
import { readFile } from "node:fs/promises";
import { gunzipSync } from "node:zlib";
import path from "node:path";
import { transform } from "esbuild";
import { makeVp9CpuSpecialistOriginalSource } from "../scripts/lib/vp9-cpu-specialist-original-recipe.mjs";
import { VP9_ORIGINAL_STARTUP } from "../scripts/lib/vp9-original-startup.mjs";
const p=JSON.parse(await readFile("evidence/2026-11-06-vp9-token-packed-http-qualification-42244170876-attempt2-recipe.json")),
  parent=gunzipSync(Buffer.from(p.generatedSourceGzipBase64,"base64")).toString(),root=path.resolve(import.meta.dirname,".."),runId="44735542199";
test("specialist original gate reverses completely and keeps exact original dimensions/settings/window/limit",async()=>{
  const r=makeVp9CpuSpecialistOriginalSource(parent,root,runId);let back=r.generated;
  for(const [before,after]of r.edits.toReversed()){assert.equal(back.split(after).length,2);back=back.replace(after,before);}assert.equal(back,parent);
  await transform(r.generated,{loader:"js",format:"esm"});
  assert.deepEqual(VP9_ORIGINAL_STARTUP,{windowMs:300000,cancellationGraceMs:30000,maximumIncrementalMiB:250,width:1920,height:804,frameRate:24,bitRateBps:4000000,minimumDiskBytes:2147483648});
  assert.ok(r.generated.includes('runVp9OriginalStartup({page,observer,blankBaseline:report.blankBaseline,evidence:report.originalStartup})'));
  assert.ok(r.generated.includes('selectExactLocalOriginal(page,fixture)'));assert.ok(r.generated.includes('fixture=path.join(root,"test.mkv")'));
  assert.equal(r.generated.includes('copyFile(path.join(root, "fixtures/media/'),false);
  assert.equal(r.generated.includes('qualifyVp9Recovery({ page, observer'),false);
  for(const key of ["baselineChanged","servicesDisabled","speedGainProven","fullFileAcceptance","publicAcceptance"])assert.equal(r[key],false);
});
test("raw100ms journal and contemporary role capture preserve primary samples and birth-aware finally cleanup",()=>{
  const r=makeVp9CpuSpecialistOriginalSource(parent,root,runId);
  for(const text of ['startClassifiedChromiumMemoryMonitor(...args)','await journal.appendBatch','journalTransitions.findLast',
    'return batch;','const at=originalSetPhase(phase)','compactLosslessNativeMemoryJournal(raw)',
    'scripts/lib/birth-type-capture.mjs','browserIdentitiesAbsent()&&report.processCleanup.every',
    'Native failed journal retention: ','javascript:1,wasm:1'])assert.ok(r.generated.includes(text),text);
  assert.equal(r.fullNativeJournalRequired,true);assert.equal(r.contemporaryBirthRoleCapture,true);
});
test("changed parent or old native baseline cannot be silently substituted",()=>{
  assert.throws(()=>makeVp9CpuSpecialistOriginalSource(parent+"\n",root,runId));
  assert.throws(()=>makeVp9CpuSpecialistOriginalSource(parent,root,"42244170876"));
});
