import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import path from "node:path";
import test from "node:test";
import { gunzipSync } from "node:zlib";
import { inspectOriginalStartupObservation } from "../scripts/lib/original-startup-observation.mjs";
import { inspectOriginalIdleObservation } from "../scripts/lib/original-idle-observation.mjs";
const root = path.resolve(import.meta.dirname, ".."), read = file => readFile(path.join(root, file));
const terminal = JSON.parse(await read("evidence/2026-10-17T02-16-33-923Z-original-idle-terminal.json"));
const report = JSON.parse(gunzipSync(await read(terminal.report.path), { maxOutputLength: 33554432 }));
test("actual idle result remains narrow evidence, never full output or allocation proof", () => {
  assert.equal(inspectOriginalStartupObservation(terminal, report).completedConversions, 0);
  const result = inspectOriginalIdleObservation(report);
  assert.equal(result.actualMs, 1560000);
  assert.deepEqual(result.phases.map(row => row.incrementalPrivateMiB), [207.73828125, 235.3046875, 222.65625]);
  assert.equal(result.nativeIdleSamples, 14307);
  assert.equal(result.elapsedIdleAloneReproducedLongRunExcess, false);
  assert.equal(result.allocationCause, null);
});
test("reject shorter waits, worker replacement, substituted peaks, missing samples or pressure claims", () => {
  for (const mutate of [
    r => { r.progressProbe.idleControl.actualMs = 30000; },
    r => { r.progressProbe.idleControl.noNativeValidationLoad = false; },
    r => { r.progressProbe.idleControl.successfulSaveExercised = true; },
    r => { r.nativeMemory.phases.find(p => p.phase === "diagnostic-idle-after-cancel").unavailableSamples = 1; },
    r => { r.progressProbe.handoffWorkerEvents.push({ role: "codec", event: "created", observedAt: r.progressProbe.idleControl.startedAt + 2000 }); },
    r => { r.runs[1].peakPrivateBytes = 1; },
  ]) { const copy = structuredClone(report); mutate(copy); assert.throws(() => inspectOriginalIdleObservation(copy)); }
});
