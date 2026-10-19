import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import path from "node:path";
import test from "node:test";
import { transform } from "esbuild";
import { makeJspiShellRecipe } from "../media/ffmpeg/mpeg2-jspi-builder-recipe.mjs";
import { makeLtoShellRecipe, makeLtoHostedBuilder, makeAlignment16Builder, makePacketCacheOuterBuilder, makePacketCacheHevcWrapper, JSPI_IMPORTS } from "../media/ffmpeg/mpeg2-lto-builder-recipe.mjs";
import { makeLtoBranchCaller, makeLtoCollector, makeAlignment16Workflow } from "../scripts/lib/lto-build-recipe.mjs";
const root=process.cwd(),read=file=>readFile(path.join(root,file),"utf8");
test("decoder library LTO adds only compile/link flags, reverses exactly, and commutes with JSPI",async()=>{
  const source=await read("media/ffmpeg/build-mpeg2-split-pipeline.sh"),parent=makeJspiShellRecipe(source),recipe=makeLtoShellRecipe(source);
  let restored=recipe.generated;for(const [before,after]of recipe.libraryLto.libraryEdits.toReversed())restored=restored.replace(after,before);
  assert.equal(restored,parent.generated);assert.equal(recipe.libraryLto.libraryEdits.length,2);
  assert.equal(recipe.libraryLto.separateEncoderChanged,false);assert.equal(recipe.codecSettingsChanged,false);
  assert.equal(recipe.heapLimitsChanged,false);assert.equal(recipe.libraryLto.stackGuardsChanged,false);assert.equal(recipe.libraryLto.speedGainProven,false);
  for(const token of ["-sINITIAL_MEMORY=33554432","-sMAXIMUM_MEMORY=33554432","-sSTACK_SIZE=262144","-sSTACK_OVERFLOW_CHECK=2","-sJSPI=1","-sPTHREAD_POOL_SIZE=0"])
    assert.ok(recipe.generated.includes(token),token);
  assert.doesNotMatch(recipe.generated,/-ffast-math|-Ofast|flto=thin/);assert.equal(JSPI_IMPORTS.length,5);
});
test("all nested builders route to the new compiler recipe without changing quality/ownership validators",async()=>{
  const recipes=[
    makeAlignment16Builder(await read("media/ffmpeg/build-mpeg2-allocation-attempt.mjs"),root),
    makePacketCacheOuterBuilder(await read("media/ffmpeg/build-mpeg2-alignment16.mjs"),root),
    makePacketCacheHevcWrapper(await read("media/ffmpeg/build-mpeg2-hevc-planes.mjs"),root),
    makeLtoHostedBuilder(await read("media/ffmpeg/build-mpeg2-packet-largest-idle.mjs"),root),
  ];
  for(const recipe of recipes){assert.ok(recipe.generated.includes("mpeg2-lto-builder-recipe.mjs"));await transform(recipe.generated,{loader:"js",format:"esm"});}
  const hosted=recipes.at(-1).generated;
  assert.ok(hosted.includes("manifest.libraryLto = jspiShell.libraryLto"));assert.ok(hosted.includes("50331648"));
  assert.match(await read("media/ffmpeg/build-mpeg2-split-encoder.sh"),/-sINITIAL_MEMORY=16777216 -sMAXIMUM_MEMORY=16777216/);
  assert.ok(hosted.includes("8b2fd64d3205143971d451f0ed562039d98fbac9f276d6cbb3c8898d889f4242"));
});
test("isolated workflow/caller/collector preserve no-checkout, fixed heap, source hashes and artifact cleanup gates",async()=>{
  const workflow=makeAlignment16Workflow(await read(".github/workflows/reproduce-ffmpeg-nondocker.yml"));
  assert.ok(workflow.includes("node media/ffmpeg/build-mpeg2-lto.mjs"));assert.ok(workflow.includes("emsdk install 6.0.4"));
  const caller=makeLtoBranchCaller(await read("scripts/prepare-alignment16-build-branch.mjs"),root);
  const collector=makeLtoCollector(await read("scripts/collect-mpeg2-single-idle-build.mjs"),root);
  for(const token of ["codex/mpeg2-library-lto-20261019","GIT_INDEX_FILE","noCheckoutOrMediaCopyCreated","windowsHide: true"])
    assert.ok(caller.generated.includes(token),token);
  for(const token of ["work/mpeg2-lto-${runId}","manifest.libraryLto","manifest.libraryLto.speedGainProven,false","initialPages: 512","finally"])
    assert.ok(collector.generated.includes(token),token);
  for(const recipe of [caller,collector])await transform(recipe.generated,{loader:"js",format:"esm"});
});
