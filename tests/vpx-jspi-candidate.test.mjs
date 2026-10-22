import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";
import { makeVpxJspiLink, VPX_JSPI_IMPORTS } from "../media/ffmpeg/vpx-jspi-candidate.mjs";
import { makeVpxJspiRecipe, makeVpxJspiBuilder, makeVpxJspiWorkflow, VPX_JSPI_BUILD_FILES } from "../media/ffmpeg/vpx-jspi-build-recipe.mjs";
test("VPX JSPI candidate changes exactly suspension flags, preserving original codec/heap/I/O/thread settings", async () => {
  const source = await readFile("media/ffmpeg/build-remux.sh", "utf8"), result = makeVpxJspiLink(source);
  assert.equal(result.edits.length, 3); let restored = result.generated;
  for (const [before, after] of result.edits.toReversed()) restored = restored.replace(after, before);
  assert.equal(restored, source);
  assert.match(result.generated, /-sJSPI=1/);
  assert.match(result.generated, /-sJSPI_EXPORTS='\["within_remux"\]'/);
  assert.ok(result.generated.includes(`-sJSPI_IMPORTS='${JSON.stringify(VPX_JSPI_IMPORTS)}'`));
  assert.equal(VPX_JSPI_IMPORTS.length, 4);
  for (const key of ["codecSettingsChanged", "nativeWrapperChanged", "ioCallbacksChanged", "wasmMemoryLimitsChanged",
    "browserFlagsChanged", "browserFidelityVerified", "speedGainProven", "memoryAcceptance", "publicAcceptance"])
    assert.equal(result[key], false, key);
  assert.equal(result.engineManagedStackBytes, null);
  assert.equal(result.engineManagedMemoryIncludedInPrimaryMetric, true);
});
test("VPX JSPI link candidate refuses unpinned or modified parents", async () => {
  const source = await readFile("media/ffmpeg/build-remux.sh", "utf8");
  assert.throws(() => makeVpxJspiLink(source + "\n"));
  assert.throws(() => makeVpxJspiLink(source.replace("maximum_memory=100663296", "maximum_memory=201326592")));
});
test("JSPI build retains exact timeline wrapper/mux, SDK, component audit and owned cleanup", async () => {
  const recipe = makeVpxJspiRecipe(await readFile("media/ffmpeg/reproduce-nondocker.sh", "utf8"));
  assert.equal(recipe.edits.length, 1); assert.match(recipe.generated, /--timeline/); assert.match(recipe.generated, /--mux-timeline/);
  assert.match(recipe.generated, /make-vpx-jspi-candidate.mjs/); assert.match(recipe.generated, /build-remux.vpx-jspi.sh/);
  const source = await readFile("media/ffmpeg/build-vpx-aac-candidate.mjs", "utf8"), builder = makeVpxJspiBuilder(source);
  for (const file of VPX_JSPI_BUILD_FILES) assert.ok(builder.generated.includes(JSON.stringify(file)));
  assert.match(builder.generated, /assert.equal\(timeline, true\)/);
  assert.match(builder.generated, /within-remux-private-vpx-jspi/);
  assert.match(builder.generated, /WebAssembly.Suspending/);
  assert.match(builder.generated, /engineManagedStackBytes: null/);
  let reversed = builder.generated;
  for (const [before, after] of builder.edits.toReversed()) reversed = reversed.replace(after, before);
  assert.equal(reversed, source); assert.throws(() => makeVpxJspiBuilder(source + "\n"));
  const workflow = makeVpxJspiWorkflow(await readFile(".github/workflows/reproduce-ffmpeg-nondocker.yml", "utf8"));
  assert.match(workflow.generated, /private-vpx-jspi-/); assert.match(workflow.generated, /build-vpx-jspi-candidate.mjs/);
  assert.match(workflow.generated, /retention-days: 1/); assert.equal(workflow.publicAcceptance, false);
});
