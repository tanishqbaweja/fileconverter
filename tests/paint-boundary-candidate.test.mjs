import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import path from "node:path";
import test from "node:test";
import { gunzipSync } from "node:zlib";
import { transform } from "esbuild";
import { PAINT_BOUNDARY_CSS, renderStatusPanels, derivePaintBoundaryDriver, derivePaintBoundaryCaller } from "../scripts/lib/paint-boundary-candidate.mjs";
const root = path.resolve(import.meta.dirname, ".."), read = file => readFile(path.join(root, file));
test("paint candidate preserves actual production progress/error/warning text and controls; no hidden/offscreen or codec rule", async () => {
  assert.ok(!/display|visibility|size|height|width|opacity|transform|position/.test(PAINT_BOUNDARY_CSS));
  const result = renderStatusPanels((await read("app/converter/ConverterApp.tsx")).toString(), { metrics: { inputBytes: 100, outputBytes: 200, elapsedMs: 300, queuedBytes: 0 },
    phase: "Actual component", progress: 25, throughput: 100, selectedProfile: { engine: "FFmpeg" }, estimatedRemainingMs: null, jobState: "error", peakJsHeap: null,
    warnings: ["Preserve café 音楽"], error: "Bounded write rejected" });
  for (const text of ["Preserve café 音楽", "Bounded write rejected", "Not applicable", "scaleX(0.25)"]) assert.ok(result.markup.includes(text), text);
});
test("only delivered static CSS binding changes; same six complete outputs/faults, lower blank/all-process guard and worker assets", async () => {
  const old = JSON.parse(gunzipSync(await read("outputs/reports/2026-10-16T17-01-47-260Z-updated-chrome-full-sources.json.gz")));
  const driver = derivePaintBoundaryDriver(old.driver, root, path.join(root, "work/recorded-timeline-full-wrapper-testABC"), "allocation-attempt-media-testABC", []);
  for (const token of ["minimumMs: 300000", "<=250", 'successfulFixtureValidations,6', 'row.event==="reused").length,16', "requestedCompletedConversions:0"]) assert.ok(driver.generated.includes(token), token);
  assert.equal(driver.cssBinding.bytes, 26354); assert.notEqual(driver.cssBinding.afterBytes, 27940);
  await transform(driver.generated, { loader: "js" });
  const caller = derivePaintBoundaryCaller((await read("scripts/run-updated-chrome-full.mjs")).toString(), root);
  assert.ok(caller.generated.includes('${stamp}-paint-boundary-control-live.json')); assert.ok(caller.generated.includes("await verifyStoppedTree()"));
  await transform(caller.generated, { loader: "js" });
});
