import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { readFile } from "node:fs/promises";
import path from "node:path";
import test from "node:test";
import { makeHevcPlaneRecipe } from "../media/ffmpeg/mpeg2-hevc-plane-recipe.mjs";
import { makeAlignment16BuilderForHevcPlanes, makeHevcPlaneOuterBuilder } from "../media/ffmpeg/mpeg2-hevc-plane-builder-recipe.mjs";
import { makeHevcPlaneWorkflow, makeHevcPlaneBranchCaller, makeHevcPlaneCollector } from "../scripts/lib/hevc-plane-build-recipe.mjs";
const root = path.resolve(import.meta.dirname, ".."), read = file => readFile(path.join(root, file), "utf8");
function syntax(source) {
  const result = spawnSync(process.execPath, ["--check", "--input-type=module"], { input: source, encoding: "utf8", windowsHide: true, timeout: 5000 });
  assert.equal(result.status, 0, result.stderr);
}
test("new decoder shell syntax keeps fixed32+16MiB and SDK restore before unchanged encoder; actual Wasm lifecycle precedes production linking", async () => {
  const generated = makeHevcPlaneRecipe(await read("media/ffmpeg/build-mpeg2-split-pipeline.sh"));
  const bash = process.platform === "win32" ? "D:/Program Files/Git/bin/bash.exe" : "bash";
  const result = spawnSync(bash, ["--noprofile", "--norc", "-n"], { input: generated, encoding: "utf8", windowsHide: true, timeout: 15000 }); assert.equal(result.status, 0, result.stderr);
  assert.ok(generated.indexOf("patch-mpeg2-hevc-planes.mjs") < generated.indexOf("emconfigure ./configure"));
  assert.ok(generated.indexOf("hevc-plane-smoke.js") < generated.indexOf('emcc "${BUILD_ROOT}/within_split_pipeline.c"'));
  // buffer_internal.h is not installed: the actual FFmpeg source/config tree
  // must be searched, not just PREFIX/include. Regression for run38182492577.
  const smokeCommand = generated.slice(generated.indexOf('emcc "${BUILD_ROOT}/hevc-plane-smoke.c"'), generated.indexOf('node "${BUILD_ROOT}/hevc-plane-smoke.js"'));
  assert.ok(smokeCommand.includes('-I"${BUILD_ROOT}/ffmpeg"'));
  assert.ok(smokeCommand.includes('"${PREFIX}/lib/libavutil.a"'));
  assert.ok(generated.indexOf("mpeg2-alignment16-sdk.mjs") < generated.indexOf('bash "${SCRIPT_DIR}/build-mpeg2-split-encoder.sh"'));
  assert.ok(generated.includes("-sINITIAL_MEMORY=33554432 -sMAXIMUM_MEMORY=33554432"));
  assert.ok(!generated.includes("-sALLOW_MEMORY_GROWTH=1"));
});
test("nested actual builder, branch and collector derivatives parse, qualify sources/artifacts and retain original caps/ownership gates", async () => {
  const recipes = [makeAlignment16BuilderForHevcPlanes(await read("media/ffmpeg/build-mpeg2-allocation-attempt.mjs"), root),
    makeHevcPlaneOuterBuilder(await read("media/ffmpeg/build-mpeg2-alignment16.mjs"), root),
    makeHevcPlaneBranchCaller(await read("scripts/prepare-alignment16-build-branch.mjs"), root),
    makeHevcPlaneCollector(await read("scripts/collect-mpeg2-single-idle-build.mjs"), root)];
  for (const recipe of recipes) syntax(recipe.generated);
  const collector = recipes[3].generated;
  for (const gate of ["names.length <= 20", "16 * 1024 ** 2", 'assert.equal(run.headSha, branch.commit)', 'assert.equal(run.conclusion, "success")',
    "constants.COPYFILE_EXCL", "await runtime.close()", "current.dev, identity.dev", "heapLimitsRaised", "sequentialReuses, 200000"])
    assert.ok(collector.includes(gate), gate);
  assert.ok(collector.includes("hevc-plane-(?:buffer|get-buffer)"));
  const workflow = makeHevcPlaneWorkflow(await read(".github/workflows/reproduce-ffmpeg-nondocker.yml"));
  assert.ok(workflow.includes("node media/ffmpeg/build-mpeg2-hevc-planes.mjs")); assert.ok(workflow.includes("if: always()"));
  assert.ok(workflow.includes("retention-days: 1")); assert.ok(workflow.includes("6.0.4"));
});
test("Windows refuses before SDK/source mutation; qualified decoder source has not been compiled by these preparation units", () => {
  if (process.platform !== "win32") return;
  const result = spawnSync(process.execPath, [path.join(root, "media/ffmpeg/build-mpeg2-hevc-planes.mjs")], { windowsHide: true, timeout: 10000, encoding: "utf8" });
  assert.equal(result.status, 1); assert.ok(result.stderr.includes("isolated no-Docker hosted builder"));
});
