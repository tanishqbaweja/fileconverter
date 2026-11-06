import assert from "node:assert/strict";
import {test} from "node:test";
import {readFile} from "node:fs/promises";
import {gunzipSync} from "node:zlib";
import {execFile} from "node:child_process";
import {promisify} from "node:util";
import path from "node:path";
import {makeWebCodecsOriginalStartup} from "../scripts/lib/webcodecs-original-startup-recipe.mjs";
const root=path.resolve(import.meta.dirname,".."),parent=JSON.parse(await readFile(path.join(root,"evidence/2026-11-01-webcodecs-vp9-rebuilt-native-recipe.json"))),
  source=gunzipSync(Buffer.from(parent.generatedSourceGzipBase64,"base64")).toString();
test("platform original startup supplies exact protected File via same-host CDP and never exports or fabricates completed output",()=>{
  const r=makeWebCodecsOriginalStartup(source,root,"12345678");let reverse=r.generated;
  for(const [before,after]of r.edits.toReversed())reverse=reverse.replace(after,before);assert.equal(reverse,source);
  assert.ok(r.generated.includes('selectExactLocalOriginal(page,fixture)'));assert.ok(r.generated.includes('backend:"platform"'));
  assert.ok(r.generated.includes('fixture=path.join(root,"test.mkv")'));
  assert.ok(r.generated.includes('generated:false,copied:false,truncated:false'));
  assert.doesNotMatch(r.generated,/\bconverted\b|testsrc2=size|__appendPrivateVp9Output/);
  assert.equal(r.startupOnly,true);assert.equal(r.fullOriginalConverted,false);assert.equal(r.memoryBaselineWindowOrThresholdChanged,false);
});
test("startup check-only verifies whole retained ancestry without browser or recipe creation",async()=>{
  const {stdout}=await promisify(execFile)(process.execPath,["scripts/test-webcodecs-original-startup.mjs","--check-only"],
    {cwd:root,windowsHide:true,timeout:30000,maxBuffer:65536});
  assert.equal(JSON.parse(stdout).browserLaunched,false);assert.equal(JSON.parse(stdout).recipeWritten,false);
});
