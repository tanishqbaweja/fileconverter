import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";
import { gunzipSync } from "node:zlib";
import { inspectWarmCacheFailure } from "../scripts/lib/warm-cache-observation.mjs";
import { PAINT_BOUNDARY_CSS, PAINT_VISUAL_PROOF } from "../scripts/lib/paint-boundary-candidate.mjs";
const terminal=JSON.parse(await readFile("evidence/2026-10-17T16-43-32-372Z-paint-boundary-control-terminal.json"));
const prior=JSON.parse(await readFile("evidence/2026-10-17T04-17-55-073Z-warm-cache-control-terminal.json"));
const report=JSON.parse(gunzipSync(await readFile(terminal.report.path))),oldReport=JSON.parse(gunzipSync(await readFile(prior.report.path)));
const build=JSON.parse(await readFile(terminal.build.path)),oldBuild=JSON.parse(await readFile(prior.build.path));
test("visually identical card layout still fails all-process budget; no accepted memory or speed fix",()=>{
  const result=inspectWarmCacheFailure(terminal,report,oldReport,build,oldBuild);
  assert.equal(result.peakIncrementalPrivateMiB,252.9921875);assert.equal(result.completedSmallOutputs,3);assert.equal(result.compiledCacheAloneSufficient,false);
  assert.equal(report.progressProbe.paintBoundaryCandidate.css,PAINT_BOUNDARY_CSS);assert.equal(result.publicAcceptance,false);assert.equal(result.completedOriginalConversions,0);
});
test("exact component pixels/geometry never certify a conversion or relax a memory gate",async()=>{
  const proof=JSON.parse(await readFile(PAINT_VISUAL_PROOF));assert.equal(proof.cases.length,12);assert.equal(proof.conversions,0);assert.equal(proof.memoryAcceptance,false);
  for(const row of proof.cases){assert.equal(row.exactPixels,true);assert.equal(row.exactGeometry,true);assert.equal(row.pngBeforeSha256,row.pngAfterSha256);}
  assert.equal(proof.runtimeRemoved,true);assert.deepEqual(proof.cleanupErrors,[]);
});
