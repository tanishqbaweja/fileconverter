import assert from "node:assert/strict";
import {test} from "node:test";
import {readFile} from "node:fs/promises";
import {gunzipSync} from "node:zlib";
import {execFile} from "node:child_process";
import {promisify} from "node:util";
import path from "node:path";
import {makeWebCodecsOriginalAllocation} from "../scripts/lib/webcodecs-original-allocation-recipe.mjs";
import {makeWebCodecsOriginalStartup} from "../scripts/lib/webcodecs-original-startup-recipe.mjs";
import {assertReviewedVp9RecipeParent} from "../scripts/lib/reviewed-vp9-recipe-root.mjs";
const root=path.resolve(import.meta.dirname,".."),runId="42231818045",parent=JSON.parse(await readFile(path.join(root,"evidence/2026-11-06-webcodecs-vp9-original-startup-"+runId+"-recipe.json"))),
  source=gunzipSync(Buffer.from(parent.generatedSourceGzipBase64,"base64")).toString();
test("allocation recipe reverses exactly to actual failed original source and never changes baseline, geometry, settings or native core",()=>{
  const r=makeWebCodecsOriginalAllocation(source,root,runId);let reversed=r.generated;
  for(const [before,after]of r.edits.toReversed()){assert.equal(reversed.split(after).length,2);reversed=reversed.replace(after,before);}assert.equal(reversed,source);
  assert.equal(r.parentSha256,parent.generatedSha256);assert.equal(r.changesMemoryFormulaOrLimit,false);assert.equal(r.changesBaselineWindowOrThreshold,false);
  assert.equal(r.forcesGc,false);assert.equal(r.publicAcceptance,false);assert.equal(r.diagnosticOnly,true);assert.equal(r.fullOriginalConverted,false);
  assert.ok(r.generated.includes('selectExactLocalOriginal(page,fixture)'));assert.ok(r.generated.includes('diagnosticCapture:(label,metrics)=>platformDiagnostic.capture(label,metrics)'));
  assert.ok(r.generated.includes('platformDiagnostic?.close()'));assert.ok(r.generated.includes('await platformDiagnostic.capture("loaded-idle")'));
  assert.doesNotMatch(r.generated,/passed-private-platform-original-startup-only-not-completed-transcode|testsrc2=|collectGarbage|HeapProfiler/);
});
test("check-only authenticates whole source ancestry and parses without browser or evidence write",async()=>{
  const {stdout}=await promisify(execFile)(process.execPath,["scripts/test-webcodecs-original-allocation.mjs","--check-only"],{cwd:root,windowsHide:true,timeout:30000,maxBuffer:65536});
  const result=JSON.parse(stdout);assert.equal(result.browserLaunched,false);assert.equal(result.recipeWritten,false);assert.equal(result.reversible,true);
});
test("relocated allocation ancestry permits only reviewed import changes and never permits execution",async()=>{
  const ancestor=JSON.parse(await readFile(path.join(root,"evidence/2026-11-01-webcodecs-vp9-rebuilt-native-recipe.json")));
  const ancestorSource=gunzipSync(Buffer.from(ancestor.generatedSourceGzipBase64,"base64"),{maxOutputLength:1048576}).toString();
  const relocated=path.join(root,"work","nonexistent-recipe-checkout");
  const generated=makeWebCodecsOriginalStartup(ancestorSource,relocated,runId).generated;
  assert.notEqual(generated,source);
  assertReviewedVp9RecipeParent(generated,source,relocated,"allocation",true);
  assert.throws(()=>assertReviewedVp9RecipeParent(generated,source,relocated,"allocation",false));
  assert.throws(()=>assertReviewedVp9RecipeParent(generated+"// unrelated",source,relocated,"allocation",true));
});
