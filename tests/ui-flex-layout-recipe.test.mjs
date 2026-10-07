import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import path from "node:path";
import { spawnSync } from "node:child_process";
import test from "node:test";
import { DYNAMIC_FLEX_CSS, makeUiFlexLayoutControl } from "../scripts/lib/ui-flex-layout-recipe.mjs";
test("paired dynamic flex/grid controls preserve real workflow, caps, visible markup and finally cleanup", async () => {
  const root = path.resolve(import.meta.dirname, ".."), source = await readFile(path.join(root, "scripts/diagnose-ui-native-allocation.mjs"), "utf8");
  for (const candidate of [false, true]) {
    const generated = makeUiFlexLayoutControl(source, root, "file:///helper.mjs", candidate);
    assert.ok(generated.includes('assert.equal(state.jobState, "idle"'));
    assert.ok(generated.includes("for (let i = 0; i < 60; i++)"));
    assert.ok(generated.includes('profileId of ["mkv-to-mp4", "mkv-to-mp4-mpeg4", "mkv-to-wav"]'));
    assert.ok(generated.includes('await verifySource(); cleanup.protectedFixtureUnchanged = true;'));
    assert.ok(generated.includes('traceReports.length < 2'));
    assert.ok(generated.indexOf('await recordGeometry(profileId, viewport)') > generated.indexOf('await snapshot("ui-control-settled-3s")'));
    const syntax = spawnSync(process.execPath, ["--check", "--input-type=module"], { input: generated, encoding: "utf8", windowsHide: true });
    assert.equal(syntax.status, 0, syntax.stderr);
  }
  assert.ok(!/content-visibility|visibility:hidden|display:none|order:/.test(DYNAMIC_FLEX_CSS));
  assert.ok(DYNAMIC_FLEX_CSS.includes("max-width:680px"));
  assert.throws(() => makeUiFlexLayoutControl(source + "\n", root, "file:///helper.mjs", true));
});
