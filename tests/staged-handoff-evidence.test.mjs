import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import path from "node:path";
import { test } from "node:test";
import { gunzipSync } from "node:zlib";
import { verifyHandoffBuildAndEvents } from "../scripts/lib/staged-handoff-evidence.mjs";
const root = path.resolve(import.meta.dirname, "..");
async function inputs() {
  const read = async file => JSON.parse(await readFile(path.join(root, file)));
  const media = await read("evidence/2026-10-15T17-02-03-457Z-staged-handoff-media.json");
  const unpack = async record => JSON.parse(gunzipSync(await readFile(path.join(root, record.path))));
  const generated = (await unpack(media.generatedArchive)).generated;
  const report = await unpack(media.report.archive), build = await read(generated.handoffLifecycle.buildProofPath);
  return { generated, report, build };
}
test("actual five worker handoffs preserve exact compiled/native bindings without claiming OS release", async () => {
  const { build, generated, report } = await inputs(), checked = verifyHandoffBuildAndEvents(build, generated, report);
  assert.equal(checked.saveWorkersObserved, 5); assert.equal(checked.physicalReleaseBeforeCopyProven, false);
  assert.equal(checked.primaryMemoryAcceptance, false); assert.equal(checked.actualAppResponseBytesHashed, false);
});
test("reject changed heaps, copy buffer, source seals, worker identity and missing/concurrent retirement", async () => {
  const original = await inputs();
  for (const mutate of [
    data => { data.build.fixedCopyBufferBytes *= 2; },
    data => { data.build.nativeWasmChanged = true; },
    data => { data.build.postSourcePins.extra = "fake"; },
    data => { data.report.manifest.aggregateWasmMemoryBytes = 0; },
    data => { data.generated.spec = data.generated.spec.replace("expect(state.metrics?.peakWasmMemoryBytes).toBe(expectedMemoryBytes)", ""); },
    data => { data.report.rows.find(row => row.kind === "actual-staged-worker-handoff-lifecycle").events[2].url = "http://127.0.0.1/assets/other.js"; },
    data => { data.report.rows.find(row => row.kind === "actual-staged-worker-handoff-lifecycle").events.splice(1, 1); },
    data => { data.report.rows.find(row => row.kind === "actual-staged-worker-handoff-lifecycle").events.splice(3, 1); },
    data => { data.report.rows.find(row => row.kind === "actual-staged-worker-handoff-lifecycle").observedEventsNotPhysicalMemoryReleaseProof = false; },
  ]) { const changed = structuredClone(original); mutate(changed); assert.throws(() => verifyHandoffBuildAndEvents(changed.build, changed.generated, changed.report)); }
});
