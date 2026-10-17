import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import path from "node:path";
import test from "node:test";
import { gunzipSync } from "node:zlib";
import { transform } from "esbuild";
import { deriveOriginalIdleCaller, deriveOriginalIdleDriver } from "../scripts/lib/original-idle-control.mjs";
import { deriveOriginalStartupDriver } from "../scripts/lib/original-startup-control.mjs";
const root = path.resolve(import.meta.dirname, ".."), read = file => readFile(path.join(root, file));
const archive = JSON.parse(gunzipSync(await read("outputs/reports/2026-10-16T17-01-47-260Z-updated-chrome-full-sources.json.gz"), { maxOutputLength: 8388608 }));
const args = [archive.driver, root, path.join(root, "work/recorded-timeline-full-wrapper-testABC"), "allocation-attempt-media-testABC", ["scripts/diagnose-original-idle.mjs"]];
test("only inserts bounded idle observation before restart; every startup/source/budget/cancellation byte stays exact", async () => {
  const parent = deriveOriginalStartupDriver(...args), result = deriveOriginalIdleDriver(...args);
  assert.equal(result.generated.replace(result.edits[0][1], result.edits[0][0]), parent.generated);
  assert.equal(result.idleMinimumMs, 1560000);
  for (const token of ['if(number===2)', 'minimumMs:1560000', 'page.workers()[0],idleWorker',
    'idleControl.observations<=192', 'resumeHost.safeToStart,true', 'noNativeValidationLoad:true',
    'lastState.metrics.scratchBytes,0', 'Idle complete-tree250MiB limit unchanged']) assert.ok(result.generated.includes(token), token);
  assert.equal(result.fullOriginalAcceptance, false); assert.equal(result.publicAcceptance, false);
  await transform(result.generated, { loader: "js" });
});
test("unique caller namespace preserves births, cleanup and actual source archive", async () => {
  const result = deriveOriginalIdleCaller((await read("scripts/run-updated-chrome-full.mjs")).toString(), root);
  assert.ok(result.generated.includes('${stamp}-original-idle-live.json'));
  assert.ok(result.generated.includes('row.progressProbe.idleControl.actualMs>=1560000'));
  assert.ok(result.generated.includes('await verifyStoppedTree()'));
  assert.ok(result.generated.includes('writeUpdatedFullArchive(root,stamp,snapshot,runtimeSources)'));
  assert.ok(result.generated.includes('completedRuns:row.runs.filter(run=>run.independentValidation!==null).length'));
  assert.equal(result.publicAcceptance, false);
  await transform(result.generated, { loader: "js" });
});
