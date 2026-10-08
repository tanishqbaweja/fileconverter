import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { readFile } from "node:fs/promises";
import path from "node:path";
import test from "node:test";
import { makeLateAllocatorAbortAdapter } from "../scripts/lib/mpeg2-late-allocator-abort-adapter.mjs";
import { extractPinnedSplitAdapter } from "../scripts/lib/mpeg2-abort-original-recipe.mjs";
import { makeHeroWidthOriginalDriver } from "../scripts/lib/mpeg2-hero-width-original-recipe.mjs";
import { DYNAMIC_FLEX_CSS } from "../scripts/lib/ui-flex-layout-recipe.mjs";
import { MATRIX_FLEX_CSS } from "../scripts/lib/ui-matrix-flex-layout-recipe.mjs";
import { HERO_WIDTH_FLEX_CSS } from "../scripts/lib/ui-hero-width-flex-layout-recipe.mjs";
const root = path.resolve(import.meta.dirname, ".."), read = f => readFile(path.join(root, f), "utf8");
const json = async f => JSON.parse(await read(f));

test("full hero-width candidate preserves FULL original/defaults/quality/ALLprocess250MiB/three repeats and cleanup", async () => {
  const stager = await read("scripts/stage-mpeg2-split-direct.mjs"), stackHelper = await read("scripts/lib/bounded-wasm-abort-capture.mjs");
  const { adapter: lateAdapter } = makeLateAllocatorAbortAdapter({ stager, stackHelper,
    snapshotHelper: await read("scripts/lib/late-refstruct-abort-snapshot.mjs"), poolHelper: await read("scripts/lib/late-pool-abort-capture.mjs"),
    controlProof: await json("evidence/late-pool-abort-control-2026-10-08.json"),
    allocatorHelper: await read("scripts/lib/late-pool-allocator-abort-capture.mjs"), freeHeaderHelper: await read("scripts/lib/dlmalloc-free-header-inspection.mjs"),
    allocatorControlProof: await json("evidence/late-pool-allocator-abort-control-2026-10-08.json"), layoutProof: await json("evidence/mpeg2-late-dlmalloc-layout-2026-10-08.json") });
  const source = await read("scripts/mpeg2-split-single-navigation-memory.mjs");
  const args = [source, root, s => import.meta.resolve(s), extractPinnedSplitAdapter(stager), stackHelper, "file:///owned/helper.mjs", lateAdapter];
  const generated = makeHeroWidthOriginalDriver(...args);
  assert.ok(generated.includes(`css: ${JSON.stringify(DYNAMIC_FLEX_CSS + MATRIX_FLEX_CSS + HERO_WIDTH_FLEX_CSS)}`));
  for (const token of ['const diagnosticOnly = false', '6 * 60 * 60_000', 'minimumMs: 300000', 'run.incrementalPrivateMiB <= 250',
    '"test.mkv"', '48 * MiB', '0.98', 'cancelBrowserConversionBeforeCleanup(page)', 'workers[0].once("close"',
    'scripts/stage-mpeg2-late-allocator-abort.mjs', 'makeLateSlotBuildWorkflow(canonical)',
    'mpeg2-hero-width-golden-validation.json', 'private-mpeg2-hero-width-original-native-100ms']) assert.ok(generated.includes(token), token);
  const syntax = spawnSync(process.execPath, ["--input-type=module", "--check"], { input: generated, encoding: "utf8", windowsHide: true });
  assert.equal(syntax.status, 0, syntax.stderr);
  assert.throws(() => makeHeroWidthOriginalDriver(source + "\n", ...args.slice(1)));
});
