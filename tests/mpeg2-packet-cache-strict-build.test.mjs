import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { readFile } from "node:fs/promises";
import path from "node:path";
import test from "node:test";
import { makePacketCacheWorkflow } from "../scripts/lib/mpeg2-packet-cache-build-recipe.mjs";
import { makePacketCacheStrictWorkflow, makePacketCacheStrictBranchCaller, makePacketCacheStrictCollector } from "../scripts/lib/mpeg2-packet-cache-strict-build-recipe.mjs";
const root = path.resolve(import.meta.dirname, ".."), read = file => readFile(path.join(root, file), "utf8");
test("corrected isolated workflow selects only strict actual builder and retains cleanup/source/retention gates", async () => {
  const source = await read(".github/workflows/reproduce-ffmpeg-nondocker.yml"), generated = makePacketCacheStrictWorkflow(source);
  assert.equal(generated.replace("node media/ffmpeg/build-mpeg2-packet-cache-strict.mjs", "node media/ffmpeg/build-mpeg2-packet-cache.mjs"), makePacketCacheWorkflow(source));
  assert.ok(generated.includes("retention-days: 1")); assert.ok(generated.includes("if: always()"));
});
test("new source-bound branch and collector target warning-fix head only; limits, lifetime tests and exclusive ownership unchanged", async () => {
  const recipes = [makePacketCacheStrictBranchCaller(await read("scripts/prepare-alignment16-build-branch.mjs"), root),
    makePacketCacheStrictCollector(await read("scripts/collect-mpeg2-single-idle-build.mjs"), root)];
  for (const recipe of recipes) {
    const result = spawnSync(process.execPath, ["--check", "--input-type=module"], { input: recipe.generated, encoding: "utf8", windowsHide: true, timeout: 5000 });
    assert.equal(result.status, 0, result.stderr);
  }
  assert.ok(recipes[0].generated.includes("codex/mpeg2-packet-cache-20261012-warning-fix"));
  assert.ok(recipes[0].generated.includes("mpeg2-packet-cache-strict-build-recipe.mjs"));
  for (const gate of ["names.length <= 20", "8 * 1024 ** 2", "16 * 1024 ** 2", "COPYFILE_EXCL", "packetSmoke.reuseIterations, 200000", "packetSmoke.injectedFailureCases, 4", "heapLimitsRaised", "assert.equal(run.headSha, branch.commit)", "build-branch-2026-10-12-warning-fix.json"])
    assert.ok(recipes[1].generated.includes(gate), gate);
});
