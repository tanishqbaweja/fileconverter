import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { createRequire } from "node:module";
import path from "node:path";
import test from "node:test";
const requireYaml = createRequire(path.resolve("node_modules/@eslint/eslintrc/package.json"));
const load = async () => requireYaml("js-yaml").load(await readFile(".github/workflows/ci.yml", "utf8"));

test("terminal SDK result preserves successful jobs and incomplete/cancellation evidence", async () => {
  const value = JSON.parse(await readFile("evidence/2026-10-27-cloudflare-ci-terminal.json", "utf8"));
  assert.equal(value.status, "completed"); assert.equal(value.conclusion, "cancelled");
  assert.equal(value.verify.portableUnits.passed, 1782); assert.equal(value.verify.portableUnits.skipped, 1);
  assert.equal(value.verify.privacyOffline.passed, 19);
  assert.deepEqual(value.completedBrowserSuites.map(row => row.passed).sort((a, b) => a - b), [8, 9, 153]);
  assert.equal(value.incompleteBrowserSuites[0].testsReached, false);
  assert.equal(value.incompleteBrowserSuites[1].lastStartedCase, 142);
  assert.equal(value.incompleteBrowserSuites[1].completeSummaryAvailable, false);
  assert.equal(value.incompleteBrowserSuites[1].crashCauseConfirmed, false);
  assert.equal(value.fullBrowserMatrixPassed, false);
});
test("new recovery selector runs only two incomplete suites while normal selection keeps all five", async () => {
  const workflow = await load(), jobs = workflow.jobs;
  assert.ok(workflow.on.workflow_dispatch.inputs.engine.options.includes("browser-recovery"));
  assert.match(jobs["engine-matrix"].if, /inputs.engine != 'browser-recovery'/);
  assert.doesNotMatch(jobs.verify.if, /browser-recovery/);
  assert.match(jobs["browser-conversions"].if, /inputs.engine == 'browser-recovery'/);
  const matches = jobs["browser-conversions"].strategy.matrix.suite.match(/&& '([^']+)' \|\| '([^']+)'/); assert.ok(matches);
  assert.deepEqual(JSON.parse(matches[1]), ["media-remux", "streaming-conversions"]);
  assert.deepEqual(JSON.parse(matches[2]), ["image-conversions", "media-remux", "audio-source-metadata", "audio-destination-scopes", "streaming-conversions"]);
});
test("validator setup is finite/noninteractive and omits optional recommendations without removing tools, versions or tests", async () => {
  const workflow = await load(), job = workflow.jobs["browser-conversions"], step = job.steps.find(row => row.name === "Install independent native validators");
  assert.equal(job["timeout-minutes"], 45); assert.equal(step["timeout-minutes"], 12);
  assert.equal(step.env.DEBIAN_FRONTEND, "noninteractive");
  assert.match(step.run, /apt-get install -y --no-install-recommends ffmpeg libarchive-tools/);
  assert.match(step.run, /python -m pip install --disable-pip-version-check -r scripts\/requirements-ci-validators.txt/);
  const tests = job.steps.find(row => row.name === "Run browser conversions and independent validators");
  assert.match(tests.run, /npx playwright test tests\/browser\/\$\{\{ matrix.suite \}\}.spec.ts/);
  assert.doesNotMatch(tests.run, /--grep|--last-failed|--max-failures|--skip/);
});
