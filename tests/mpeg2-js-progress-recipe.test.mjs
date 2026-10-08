import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { readFile } from "node:fs/promises";
import path from "node:path";
import test from "node:test";
import { extractPinnedSplitAdapter } from "../scripts/lib/mpeg2-abort-original-recipe.mjs";
import { makeLateAllocatorAbortAdapter } from "../scripts/lib/mpeg2-late-allocator-abort-adapter.mjs";
import { makeJsProgressOriginalDriver } from "../scripts/lib/mpeg2-js-progress-recipe.mjs";
const root = path.resolve(import.meta.dirname, ".."), read = file => readFile(path.join(root, file), "utf8"),
  json = async file => JSON.parse(await read(file));
test("JS actual-progress recipe preserves every full-original gate and captures BEFORE ordinary worker cancellation", async () => {
  const stager = await read("scripts/stage-mpeg2-split-direct.mjs"), stackHelper = await read("scripts/lib/bounded-wasm-abort-capture.mjs");
  const { adapter: lateAdapter } = makeLateAllocatorAbortAdapter({ stager, stackHelper,
    snapshotHelper: await read("scripts/lib/late-refstruct-abort-snapshot.mjs"), poolHelper: await read("scripts/lib/late-pool-abort-capture.mjs"),
    controlProof: await json("evidence/late-pool-abort-control-2026-10-08.json"),
    allocatorHelper: await read("scripts/lib/late-pool-allocator-abort-capture.mjs"), freeHeaderHelper: await read("scripts/lib/dlmalloc-free-header-inspection.mjs"),
    allocatorControlProof: await json("evidence/late-pool-allocator-abort-control-2026-10-08.json"), layoutProof: await json("evidence/mpeg2-late-dlmalloc-layout-2026-10-08.json") });
  const input = await read("scripts/mpeg2-split-single-navigation-memory.mjs");
  const source = makeJsProgressOriginalDriver(input, root, file => import.meta.resolve(file), extractPinnedSplitAdapter(stager),
    stackHelper, "file:///owned/trace-helper.mjs", lateAdapter);
  for (const text of ["minimumMs: 300000", "run.incrementalPrivateMiB <= 250", "for (let number = 1; number <= 3; number++)",
    '"test.mkv"', '"32GiB repository-local disk preflight required"', "48 * MiB", "ssim >= 0.98", "await verifySource()",
    "conversionJs.progress", "conversionJsReport", "failureBeforeCancellation", "js-progress-original-native-100ms"])
    assert.ok(source.includes(text), text);
  assert.ok(source.indexOf("conversionJs.failureBeforeCancellation") < source.indexOf("quiescedBudgetCapture.cancellation=await"));
  assert.ok(source.includes("const diagnosticOnly = false"));
  const syntax = spawnSync(process.execPath, ["--check", "--input-type=module"], { input: source, encoding: "utf8", windowsHide: true });
  assert.equal(syntax.status, 0, syntax.stderr);
});
