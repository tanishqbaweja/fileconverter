import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import path from "node:path";
import test from "node:test";
import { gunzipSync } from "node:zlib";
import { inspectMemoizedHandoffCandidate } from "../scripts/lib/memoized-handoff-observation.mjs";
const root = path.resolve(import.meta.dirname, ".."), read = file => readFile(path.join(root, file));
const terminal = JSON.parse(await read("evidence/2026-10-17T03-35-55-302Z-memoized-handoff-control-terminal.json"));
const baseline = JSON.parse(await read("evidence/2026-10-17T03-13-05-207Z-save-handoff-control-terminal.json"));
const report = JSON.parse(gunzipSync(await read(terminal.report.path))), build = JSON.parse(await read(terminal.build.path));
const baselineReport = JSON.parse(gunzipSync(await read(baseline.report.path))), baselineBuild = JSON.parse(await read(baseline.build.path));
test("actual unchanged output/native assets do not turn failed memoized UI into an accepted optimization", () => {
  const result = inspectMemoizedHandoffCandidate(terminal, report, build, baselineReport, baselineBuild);
  assert.equal(result.candidateOriginalBreachMiB, 253.19140625);
  assert.equal(result.memoryFixAccepted, false); assert.equal(result.speedGainProven, false);
  assert.equal(result.normalPublicApplicationChanged, false); assert.equal(result.completedOriginalConversions, 0);
});
test("reject changed worker, throttled samples, unknown served app or changed stylesheet", () => {
  for (const mutate of [b => { b.progressSamplingChanged = true; }, b => { b.assets[1].sha256 = "0".repeat(64); },
    b => { b.assets[0].url = "/assets/not-served.js"; }, b => { b.stylesheet.sha256 = "0".repeat(64); }]) {
    const copy = structuredClone(build); mutate(copy);
    assert.throws(() => inspectMemoizedHandoffCandidate(terminal, report, copy, baselineReport, baselineBuild));
  }
});
