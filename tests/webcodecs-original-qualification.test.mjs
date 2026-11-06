import assert from "node:assert/strict";
import {test} from "node:test";
import {readFile} from "node:fs/promises";
import {gunzipSync} from "node:zlib";
import {execFile} from "node:child_process";
import {promisify} from "node:util";
import path from "node:path";
import {makeWebCodecsOriginalQualification} from "../scripts/lib/webcodecs-original-qualification-recipe.mjs";
const root=path.resolve(import.meta.dirname,".."),parent=JSON.parse(await readFile(path.join(root,"evidence/2026-11-01-webcodecs-vp9-rebuilt-native-recipe.json"))),
  source=gunzipSync(Buffer.from(parent.generatedSourceGzipBase64,"base64")).toString();
test("new platform control retains positive candidate-only input and adds strict independent fidelity, stored clock and recovery",()=>{
  const r=makeWebCodecsOriginalQualification(source,root,"12345678");let reverse=r.generated;
  for(const [before,after]of r.edits.toReversed())reverse=reverse.replace(after,before);assert.equal(reverse,source);
  assert.ok(r.generated.includes('implementation: "candidate"'));assert.ok(r.generated.includes('backend:"platform"'));
  assert.ok(r.generated.includes('assertPlatformVp9Terminal(report.browserResult)'));
  assert.ok(r.generated.includes('validateSmallVp9Fidelity('));assert.ok(r.generated.includes('defaultDurationNs,41666666'));
  assert.ok(r.generated.includes('Same strict blank baseline required before app/conversion'));
  assert.ok(r.generated.includes('2026-11-06-webcodecs-vp9-original-qualification-12345678.json'));
  assert.equal(r.baselineFormulaWindowOrThresholdChanged,false);assert.equal(r.cpuFallbackCanPass,false);assert.equal(r.publicAcceptance,false);
});
test("old native ID and changed parent fail closed; check-only never launches browser or writes recipe",async()=>{
  assert.throws(()=>makeWebCodecsOriginalQualification(source,root,"41309113218"));
  assert.throws(()=>makeWebCodecsOriginalQualification(source+" ",root,"12345678"));
  const {stdout}=await promisify(execFile)(process.execPath,["scripts/test-webcodecs-original-qualification.mjs","--check-only"],
    {cwd:root,windowsHide:true,timeout:30000,maxBuffer:65536});
  const result=JSON.parse(stdout);assert.equal(result.browserLaunched,false);assert.equal(result.recipeWritten,false);assert.equal(result.reversible,true);
});
