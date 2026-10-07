import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { spawnSync } from "node:child_process";
import path from "node:path";
import test from "node:test";
import { extractPinnedSplitAdapter } from "../scripts/lib/mpeg2-abort-original-recipe.mjs";
import { makeStagedAbortOriginalDriver } from "../scripts/lib/mpeg2-staged-abort-original-recipe.mjs";
const root=path.resolve(import.meta.dirname,"..");
const source=await readFile(path.join(root,"scripts/mpeg2-split-single-navigation-memory.mjs"),"utf8");
const helper=await readFile(path.join(root,"scripts/lib/bounded-wasm-abort-capture.mjs"),"utf8");
const adapter=extractPinnedSplitAdapter(await readFile(path.join(root,"scripts/stage-mpeg2-split-direct.mjs"),"utf8"));
test("validated staging observer keeps every full-source/quality/memory/repeat/cleanup gate and never routes worker adapters",()=>{
  const generated=makeStagedAbortOriginalDriver(source,root,s=>import.meta.resolve(s),adapter,helper);
  for(const text of ['const diagnosticOnly = false;','number <= 3','6 * 60 * 60_000','minimumMs: 300000',
    'blankBaseline.privateBytes <= startupSettlement.earlyWindow.privateBytes','run.incrementalPrivateMiB <= 250',
    'assert.ok(ssim >= 0.98)','assert.equal(video.width, 1920)','assert.equal(video.height, 804)',
    'maximumTimestampErrorSeconds <= 0.001','await verifySource(); cleanup.protectedFixtureUnchanged = true;',
    'Exact controlled staged abort adapter','abortDiagnostic.stagedAdapters.length,3',
    '"scripts/stage-mpeg2-split-abort-diagnostic.mjs", "stage"','"scripts/stage-mpeg2-split-abort-diagnostic.mjs", "restore"',
    'records.length<8','text.length<=65536','stack.length<=8192','abortDiagnostic, failure,'])assert.ok(generated.includes(text),text);
  assert.ok(!generated.includes('abortDiagnostic.staticAssets'));
  assert.ok(!generated.includes('context.route(url =>'));
  assert.ok(!/Tracing.requestMemoryDump|Debugger.pause|collectGarbage|_malloc\(/.test(generated));
  const syntax=spawnSync(process.execPath,["--check","--input-type=module"],{input:generated,encoding:"utf8",windowsHide:true});
  assert.equal(syntax.status,0,syntax.stderr);
});
test("staged original rejects changed historical driver/helper and leaves failed route recipe separate",()=>{
  assert.throws(()=>makeStagedAbortOriginalDriver(source+"\n",root,s=>import.meta.resolve(s),adapter,helper));
  assert.throws(()=>makeStagedAbortOriginalDriver(source,root,s=>import.meta.resolve(s),adapter,helper+"\n"));
});
