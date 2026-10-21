import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";
import { makeFocusedMediaRegressionWorkflow, FOCUSED_MEDIA_GREP } from "../scripts/lib/focused-media-regression-workflow.mjs";
const source = await readFile("tests/browser/media-remux.spec.ts", "utf8");
test("media completion polling requires an actual terminal state, never initial idle/running/unknown", () => {
  const waits = [...source.matchAll(/\.toMatch\((\/\^\(complete\|error\|cancelled\)\$\/)\)/g)];
  assert.equal(waits.length, 4); assert.ok(!source.includes('.not.toBe("running")'));
  for (const [, literal] of waits) {
    const expression = new RegExp(literal.slice(1, -1));
    for (const value of ["idle", "running", "queued", "complete-extra", "unknown"]) assert.equal(expression.test(value), false);
    for (const value of ["complete", "error", "cancelled"]) assert.equal(expression.test(value), true);
  }
  assert.equal([...source.matchAll(/expect\(state.jobState, state.error \?\? state.phase\).toBe\("complete"\)/g)].length, 4);
  assert.match(source, /getByTestId\("automatic-route-notice"\)\)\.toContainText/);
});
test("private focus preserves the five failed cases plus three positive direct-save controls and all original assertions", async () => {
  const selected = new RegExp(FOCUSED_MEDIA_GREP);
  for (const title of [
    "browser FFmpeg coalesces PCM packets for a bounded direct WAV save",
    "browser FFmpeg flushes coalesced AIFF PCM through a bounded direct save",
    "browser FFmpeg flushes bounded MP3 packets through a direct save",
    "browser FFmpeg flushes a bounded direct M4A save correctly",
    "browser FFmpeg flushes a bounded direct FLAC save correctly",
    "browser FFmpeg flushes bounded AMR-NB packets through a direct save",
    "browser planner automatically replaces incompatible MP4 copy with its certified encode fallback",
    "browser planner automatically replaces incompatible AV1 WebM copy with its certified encode fallback",
  ]) assert.ok(selected.test(title), title);
  assert.equal(selected.test("browser FFmpeg unrelated route"), false);
  const workflow = makeFocusedMediaRegressionWorkflow(await readFile(".github/workflows/ci.yml", "utf8"));
  assert.equal(workflow.edits.length, 4); assert.equal(workflow.selectedCases, 8); assert.equal(workflow.publicAcceptance, false);
  assert.match(workflow.generated, /not full CI/); assert.match(workflow.generated, /retention-days: 1/);
  assert.match(workflow.generated, /ffmpeg/); assert.match(workflow.generated, /task_browser_tmp/);
  assert.throws(() => makeFocusedMediaRegressionWorkflow("changed"));
});
