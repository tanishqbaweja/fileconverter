import assert from "node:assert/strict";
import {test} from "node:test";
import {readFile} from "node:fs/promises";
import {gunzipSync} from "node:zlib";
import {execFile} from "node:child_process";
import {promisify} from "node:util";
import path from "node:path";
import {makeVp9HttpSource} from "../scripts/lib/vp9-http-recipe.mjs";
const root=path.resolve(import.meta.dirname,".."),runId="42244170876";
for(const kind of ["qualification","original"]) {
  const parent=JSON.parse(await readFile(path.join(root,kind==="original"?"evidence/2026-11-06-vp9-original-cpu-startup-attempt8-recipe.json":
    "evidence/2026-11-06-vp9-token-packed-qualification-"+runId+"-recipe.json"))),source=gunzipSync(Buffer.from(parent.generatedSourceGzipBase64,"base64")).toString();
  test("HTTP-only recipe reverses actual "+kind+" source without native/input/settings/baseline or memory-gate changes",()=>{
    const r=makeVp9HttpSource(source,root,runId,kind);let reverse=r.generated;
    for(const [before,after]of r.edits.toReversed()){assert.equal(reverse.split(after).length,2);reverse=reverse.replace(after,before);}assert.equal(reverse,source);
    assert.equal(r.parentSha256,parent.generatedSha256);assert.equal(r.changesNativeBytes,false);assert.equal(r.changesInputOrEncodingSettings,false);
    assert.equal(r.changesMemoryFormulaOrLimit,false);assert.equal(r.changesBaselineWindowOrThreshold,false);assert.equal(r.forcesGc,false);assert.equal(r.publicAcceptance,false);
    assert.equal(r.generated.includes("createVp9DurationAssetResponder"),false);assert.ok(r.generated.includes("httpAssets.respond(route)"));
    assert.ok(r.generated.includes("await httpAssets.preflight(origin)"));assert.ok(r.generated.includes("await httpAssets.through()"));assert.ok(r.generated.includes("await httpAssets?.close()"));
    assert.ok(r.generated.indexOf("await httpAssets.preflight(origin)")<r.generated.indexOf("chrome = spawn("));
    if(kind==="original")assert.ok(r.generated.includes("selectExactLocalOriginal(page, fixture)"));
  });
  test("HTTP "+kind+" check-only authenticates complete retained ancestry without launching or writing recipe",async()=>{
    const {stdout}=await promisify(execFile)(process.execPath,["scripts/test-vp9-http-delivery.mjs",...(kind==="original"?["--original"]:[]),"--check-only"],
      {cwd:root,windowsHide:true,timeout:30000,maxBuffer:65536});const r=JSON.parse(stdout);assert.equal(r.browserLaunched,false);assert.equal(r.recipeWritten,false);assert.equal(r.kind,kind);
  });
}
