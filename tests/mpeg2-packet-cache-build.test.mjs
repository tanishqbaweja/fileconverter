import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { readFile } from "node:fs/promises";
import path from "node:path";
import test from "node:test";
import { makePacketCacheRecipe } from "../media/ffmpeg/mpeg2-packet-cache-recipe.mjs";
import { makeAlignment16Builder, makePacketCacheOuterBuilder, makePacketCachePipelineGenerator, makePacketCacheHevcWrapper } from "../media/ffmpeg/mpeg2-packet-cache-builder-recipe.mjs";
import { makePacketCacheWorkflow, makePacketCacheBranchCaller, makePacketCacheCollector } from "../scripts/lib/mpeg2-packet-cache-build-recipe.mjs";
const root = path.resolve(import.meta.dirname, ".."), read = file => readFile(path.join(root, file), "utf8");
function syntax(source) {
  const result = spawnSync(process.execPath, ["--check", "--input-type=module"], { input: source, encoding: "utf8", windowsHide: true, timeout: 5000 });
  assert.equal(result.status, 0, result.stderr);
}
test("real packet smoke precedes production link; qualified HEVC/SDK restoration/encoder/fixed heap and shell syntax unchanged", async () => {
  const generated = makePacketCacheRecipe(await read("media/ffmpeg/build-mpeg2-split-pipeline.sh"));
  const bash = process.platform === "win32" ? "D:/Program Files/Git/bin/bash.exe" : "bash";
  const result = spawnSync(bash, ["--noprofile", "--norc", "-n"], { input: generated, encoding: "utf8", windowsHide: true, timeout: 15000 }); assert.equal(result.status, 0, result.stderr);
  assert.ok(generated.indexOf("packet-cache-smoke.js") < generated.indexOf('emcc "${BUILD_ROOT}/within_split_pipeline.c"'));
  assert.ok(generated.indexOf("mpeg2-alignment16-sdk.mjs") < generated.indexOf('bash "${SCRIPT_DIR}/build-mpeg2-split-encoder.sh"'));
  for (const gate of ["patch-mpeg2-hevc-planes.mjs", '"${PREFIX}/lib/libavutil.a"', "-sALLOW_MEMORY_GROWTH=0", "-sINITIAL_MEMORY=33554432 -sMAXIMUM_MEMORY=33554432", "hevc-plane-smoke.js", "make-mpeg2-packet-cache-pipeline.mjs"])
    assert.ok(generated.includes(gate), gate);
});
test("all six actual nested derivatives parse/reverse; collector keeps20/8MiB/16MiB exclusive ownership and no acceptance", async () => {
  const recipes = [makeAlignment16Builder(await read("media/ffmpeg/build-mpeg2-allocation-attempt.mjs"), root),
    makePacketCacheOuterBuilder(await read("media/ffmpeg/build-mpeg2-alignment16.mjs"), root),
    makePacketCachePipelineGenerator(await read("media/ffmpeg/make-mpeg2-split-pipeline.mjs"), root),
    makePacketCacheHevcWrapper(await read("media/ffmpeg/build-mpeg2-hevc-planes.mjs"), root),
    makePacketCacheBranchCaller(await read("scripts/prepare-alignment16-build-branch.mjs"), root),
    makePacketCacheCollector(await read("scripts/collect-mpeg2-single-idle-build.mjs"), root)];
  for (const recipe of recipes) syntax(recipe.generated);
  for (const gate of ["names.length <= 20", "8 * 1024 ** 2", "16 * 1024 ** 2", "COPYFILE_EXCL", "await runtime.close()", "current.dev, identity.dev", "assert.equal(run.headSha, branch.commit)", "packetSmoke.reuseIterations, 200000", "packetSmoke.injectedFailureCases, 4", "heapLimitsRaised"])
    assert.ok(recipes[5].generated.includes(gate), gate);
  assert.ok(recipes[2].generated.includes("makePacketCacheKernel as makeMpeg2SplitKernel"));
  assert.ok(recipes[2].generated.includes('flag: "wx"'));
  const workflow = makePacketCacheWorkflow(await read(".github/workflows/reproduce-ffmpeg-nondocker.yml"));
  assert.ok(workflow.includes("node media/ffmpeg/build-mpeg2-packet-cache.mjs")); assert.ok(workflow.includes("if: always()"));
  assert.ok(workflow.includes("retention-days: 1")); assert.ok(workflow.includes("6.0.4"));
});
