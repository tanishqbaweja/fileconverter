import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { readFile } from "node:fs/promises";
import test from "node:test";
import { makeBoundJsProgressLauncher } from "../scripts/lib/mpeg2-js-progress-launch-recipe.mjs";
test("Bound progress launcher checks the actual helper archive schema during preparation, without weakening it", async () => {
  const source = await readFile(new URL("../scripts/mpeg2-js-progress-original.mjs", import.meta.url), "utf8");
  const generated = makeBoundJsProgressLauncher(source, "H:\\Github Repositories\\fileconverter");
  assert.doesNotMatch(generated, /post-cancel-blink\.json/);
  assert.ok(generated.includes("check(preparedHelper)"));
  assert.ok(generated.includes("js-progress-partial-blink-trace.json.gz"));
  assert.ok(generated.includes('assert.equal(prior.nativePeakIncrementalMiB, 256.43359375)'));
  assert.ok(generated.includes("host.safeToStart")); assert.ok(generated.includes("finally {"));
  const syntax = spawnSync(process.execPath, ["--check", "--input-type=module"], { input: generated, encoding: "utf8", windowsHide: true });
  assert.equal(syntax.status, 0, syntax.stderr);
  assert.throws(() => makeBoundJsProgressLauncher(source + "\n", "H:\\Github Repositories\\fileconverter"));
});
