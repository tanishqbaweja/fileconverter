import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { readFile } from "node:fs/promises";
import path from "node:path";
import test from "node:test";
import { gunzipSync } from "node:zlib";
import { makeStableUiProgressProbe, REAL_OUTPUT_CHECKPOINT_BYTES, MAXIMUM_PROBE_CONVERSION_MS } from "../scripts/lib/stable-ui-progress-probe-recipe.mjs";
import { baselineBinding } from "../scripts/lib/stable-ui-headless-baseline-recipe.mjs";
const root = path.resolve(import.meta.dirname, ".."), archived = JSON.parse(gunzipSync(await readFile(path.join(root, "outputs/reports/2026-10-08T12-49-20-004Z-js-progress-executed-sources.json.gz"))));
test("Real-output probe is a separate headless bounded diagnostic, never a shortened full acceptance run", () => {
  const generated = makeStableUiProgressProbe(archived.generated, root, "file:///owned/trace-helper.mjs", baselineBinding, "baseline");
  const parsed = spawnSync(process.execPath, ["--check", "--input-type=module"], { input: generated, encoding: "utf8", windowsHide: true });
  assert.equal(parsed.status, 0, parsed.stderr);
  for (const anchor of ['source = path.join(root, "test.mkv")', 'assert.ok(run.incrementalPrivateMiB <= 250',
    'assert.equal(run.state.jobState, "complete"', 'startupSettlement.minimumMs', 'await verifySource()', 'await conversionJs.close()',
    'cancelBrowserConversionBeforeCleanup(page)', 'conversion-js-allocation-duration-bound.mjs', 'Performance.getMetrics', 'chromeLibrarySha256']) assert.ok(generated.includes(anchor), anchor);
  assert.equal(REAL_OUTPUT_CHECKPOINT_BYTES, 16777216); assert.equal(MAXIMUM_PROBE_CONVERSION_MS, 120000);
  assert.ok(generated.indexOf('assert.ok(run.incrementalPrivateMiB <= 250') < generated.indexOf('progressProbe.checkpointReached = true'));
  assert.throws(() => makeStableUiProgressProbe(archived.generated + "\n", root, "file:///owned/trace-helper.mjs", baselineBinding, "baseline"));
  assert.throws(() => makeStableUiProgressProbe(archived.generated, root, "file:///owned/trace-helper.mjs", baselineBinding, "unknown"));
});
