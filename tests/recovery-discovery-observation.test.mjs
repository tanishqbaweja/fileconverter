import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";
import { gunzipSync } from "node:zlib";
import { inspectRecoveryDiscovery } from "../scripts/lib/recovery-discovery-observation.mjs";
const terminal = JSON.parse(await readFile("evidence/2026-10-17T20-58-20-928Z-recovery-runtime-control-terminal.json"));
const previous = JSON.parse(await readFile("evidence/2026-10-17T18-26-10-502Z-catalogue-slot-control-terminal.json"));
const report = JSON.parse(gunzipSync(await readFile(terminal.report.path))), build = JSON.parse(await readFile(terminal.build.path));
const oldReport = JSON.parse(gunzipSync(await readFile(previous.report.path))), oldBuild = JSON.parse(await readFile(previous.build.path));
test("category-discovery failure is neither a memory breach nor proof V8 events are unsupported", () => {
  const result = inspectRecoveryDiscovery(terminal, report, oldReport, build, oldBuild);
  assert.equal(result.completedSmallOutputs, 3); assert.equal(result.recoveryAttempted, false);
  assert.equal(result.traceStarted, false); assert.equal(result.missingCategoryReplyIsNotUnsupportedEngineProof, true);
});
test("reject invented trace/recovery, lost cleanup or changed production assets", () => {
  for (const mutate of [(r) => { r.progressProbe.recoveryExecution.startedAt = "invented"; },
    (r) => { r.progressProbe.successfulSaveControl.successfulFixtureValidations = 6; },
    (r, b) => { b.assets[0].sha256 = "changed"; }, (r) => { r.progressProbe.recoveryExecution.detached = false; }]) {
    const r = structuredClone(report), b = structuredClone(build); mutate(r, b); assert.throws(() => inspectRecoveryDiscovery(terminal, r, oldReport, b, oldBuild));
  }
});
