import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { spawnSync } from "node:child_process";
import path from "node:path";
import test from "node:test";
import { gunzipSync } from "node:zlib";
import { makeLiveMemoryProbe } from "../scripts/lib/live-memory-probe-recipe.mjs";
test("Live diagnostic recipe moves budget dump before production cancellation without weakening original acceptance",async()=>{
  const root=path.resolve(import.meta.dirname,".."),executed=JSON.parse(gunzipSync(await readFile(path.join(root,
    "outputs/reports/2026-10-08T22-04-15-944Z-ui-progress-baseline-executed-sources.json.gz")))).generated;
  const generated=makeLiveMemoryProbe(executed,root,"2026-10-09T00-00-00-000Z");
  const callback=generated.slice(generated.indexOf("onFailure: async event"),generated.indexOf("const debugPort ="));
  assert.ok(callback.indexOf('captureLive("native-budget-')<callback.indexOf("cancelBrowserConversionBeforeCleanup"));
  assert.ok(generated.includes('assert.ok(run.incrementalPrivateMiB <= 250'));
  assert.ok(generated.includes('assert.equal(run.state.jobState, "complete"'));
  assert.ok(generated.includes('"checkpointOutputBytes":67108864'));
  assert.ok(generated.includes('captureLive("before-conversion"'));
  assert.ok(generated.includes('captureLive("running-output-8388608"'));
  const checked=spawnSync(process.execPath,["--check","--input-type=module"],{input:generated,encoding:"utf8",windowsHide:true});
  assert.equal(checked.status,0,checked.stderr);
});
