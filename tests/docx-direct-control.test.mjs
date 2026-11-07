import assert from "node:assert/strict";
import { test } from "node:test";
import { readFile } from "node:fs/promises";
import { completeNewBrowserJob, assertDirectDocxCompletion, installDocxDestinationObservation } from "../scripts/lib/docx-direct-control.mjs";
test("reused output name and stale complete state cannot masquerade as a new direct conversion", async () => {
  let state = { jobState: "complete", metrics: { elapsedMs: 1 }, batchOutputNames: ["same.html"] }, frame = 0, started = 0;
  const result = await completeNewBrowserJob({ getState: () => state, start() { started++; }, now: () => frame * 16,
    async nextFrame() { frame++; if (frame === 2) state = { jobState: "running", metrics: { outputBytes: 1 } };
      if (frame === 3) state = { jobState: "complete", metrics: { elapsedMs: 2 }, batchOutputNames: ["same.html"] }; },
  });
  assert.equal(frame, 3); assert.equal(started, 1); assert.equal(result.metrics.elapsedMs, 2);
});
test("new direct job errors and no-new-job timeout are failures, not old successful output", async () => {
  let state = { jobState: "complete", metrics: {} }, clock = 0;
  await assert.rejects(completeNewBrowserJob({ getState: () => state, start() {}, now: () => clock,
    async nextFrame() { clock += 100000; }, }), /did not genuinely complete/);
  await assert.rejects(completeNewBrowserJob({ getState: () => state, start() {}, now: () => 0,
    async nextFrame() { state = { jobState: "error", error: "destination failed", metrics: {} }; }, }), /destination failed/);
});
const state = () => ({ jobState: "complete", error: null, selectedProfileId: "docx-to-html", opfsName: null,
  batchOutputNames: ["within-test-direct-docx-html-32768.html"],
  metrics: { inputBytes: 140575793, activeWorkerCount: 2, sharedArrayBufferBytes: 266272, peakWasmMemoryBytes: 0 } });
test("direct evidence requires an actual handle request, no fallback temp name and honest worker/SAB diagnostics", () => {
  const observation = { mode: "handle", actualFileHandle: true, sourceBytes: 140575793 };
  assert.equal(assertDirectDocxCompletion(state(), observation), "within-test-direct-docx-html-32768.html");
  for (const patch of [{ mode: "opfs-test" }, { actualFileHandle: false }, { sourceBytes: 1 }])
    assert.throws(() => assertDirectDocxCompletion(state(), { ...observation, ...patch }));
  for (const metrics of [{ activeWorkerCount: 1 }, { sharedArrayBufferBytes: 0 }, { peakWasmMemoryBytes: 1 }]) {
    const s = state(); Object.assign(s.metrics, metrics); assert.throws(() => assertDirectDocxCompletion(s, observation));
  }
  assert.throws(() => assertDirectDocxCompletion({ ...state(), opfsName: "within-test-fallback" }, observation));
});
test("test observation forwards exact request/transfer objects and is bounded metadata only", async () => {
  const source = await readFile("scripts/lib/docx-direct-control.mjs", "utf8");
  assert.match(source, /rows.length >= 16/); assert.match(source, /Reflect.apply\(original, this, args\)/);
  assert.doesNotMatch(source, /arrayBuffer\(|readFile\(|createWritable\(|Blob\(|JSON.stringify\(message/);
});
test("actual observation wrapper preserves receiver, request identity and transfer-list identity without retaining file handles", () => {
  const previous = Object.fromEntries(["Worker", "FileSystemFileHandle", "window"].map(key => [key, Object.getOwnPropertyDescriptor(globalThis, key)]));
  const forwarded = [];
  class Handle {}
  class FakeWorker { postMessage(...args) { forwarded.push({ receiver: this, args }); return "forwarded"; } }
  try {
    globalThis.Worker = FakeWorker; globalThis.FileSystemFileHandle = Handle; globalThis.window = {};
    installDocxDestinationObservation();
    const worker = new FakeWorker(), handle = new Handle(), transfers = [], request = { type: "start", profileId: "docx-to-html",
      destination: { mode: "handle", handle }, file: { size: 140575793 }, jobId: "unit-owned" };
    assert.equal(worker.postMessage(request, transfers), "forwarded");
    assert.equal(forwarded[0].receiver, worker); assert.equal(forwarded[0].args[0], request); assert.equal(forwarded[0].args[1], transfers);
    const rows = window.__WITHIN_DOCX_DESTINATIONS__;
    assert.deepEqual(rows, [{ mode: "handle", actualFileHandle: true, sourceBytes: 140575793, jobId: "unit-owned" }]);
    assert.ok(!Object.values(rows[0]).includes(handle) && !Object.values(rows[0]).includes(request.file));
    for (let n = 1; n < 16; n++) worker.postMessage(request, transfers);
    assert.throws(() => worker.postMessage(request, transfers), /Finite document/); assert.equal(forwarded.length, 16);
  } finally {
    for (const [key, descriptor] of Object.entries(previous)) {
      if (descriptor) Object.defineProperty(globalThis, key, descriptor); else delete globalThis[key];
    }
  }
});
