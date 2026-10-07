import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import path from "node:path";
import { spawnSync } from "node:child_process";
import test from "node:test";
import { makeQuiescedBudgetDriver } from "../scripts/lib/mpeg2-quiesced-budget-recipe.mjs";
import { extractPinnedSplitAdapter } from "../scripts/lib/mpeg2-abort-original-recipe.mjs";
const root=path.resolve(import.meta.dirname,".."),read=f=>readFile(path.join(root,f),"utf8");
test("post-failure production cancellation/dump preserves original full-source/fidelity/tree-memory/repeat gates",async()=>{
  const source=await read("scripts/mpeg2-split-single-navigation-memory.mjs"),helper=await read("scripts/lib/bounded-wasm-abort-capture.mjs");
  const adapter=extractPinnedSplitAdapter(await read("scripts/stage-mpeg2-split-direct.mjs"));
  const generated=makeQuiescedBudgetDriver(source,root,s=>import.meta.resolve(s),adapter,helper,"file:///owned/trace-helper.mjs");
  for(const token of['const diagnosticOnly = false','6 * 60 * 60_000','minimumMs: 300000',
    'run.incrementalPrivateMiB <= 250','"test.mkv"','48 * MiB','0.98','cancelBrowserConversionBeforeCleanup(page)',
    'workers[0].once("close"','noTestWorkerTermination:true','post-production-cancel-budget-failure-',
    'scripts/stage-mpeg2-split-abort-diagnostic.mjs','if(rendererAttribution)rendererAttributionResult=await rendererAttribution.stop()'])assert.ok(generated.includes(token),token);
  assert.ok(!generated.includes('workers[0].terminate('));
  const syntax=spawnSync(process.execPath,["--input-type=module","--check"],{input:generated,encoding:"utf8",windowsHide:true});
  assert.equal(syntax.status,0,syntax.stderr);
  assert.throws(()=>makeQuiescedBudgetDriver(source+"\n",root,s=>import.meta.resolve(s),adapter,helper,"file:///owned/helper.mjs"));
});
