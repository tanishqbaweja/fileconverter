import assert from "node:assert/strict";
import test from "node:test";
import { createBoundedWorkerEventRecorder } from "../scripts/lib/bounded-worker-event-recorder.mjs";
test("thousands of real-shaped lifecycle records retain32history but complete scalar counts", () => {
  const recorder = createBoundedWorkerEventRecorder();
  for (let index = 0; index < 1000; index++) for (const event of ["created", "closed"])
    assert.equal(recorder.record({ role: index % 2 ? "save" : "codec", event, url: "http://localhost/assets/owned-worker.js", observedAt: index }), true);
  const summary = recorder.summary(); assert.equal(recorder.events.length, 32); assert.equal(summary.totalEvents, 2000);
  assert.equal(summary.evictedEvents, 1968); assert.equal(summary.firstError, null);
  for (const role of Object.values(summary.roles)) assert.deepEqual(role, { created: 500, closed: 500, active: 0, maximumActive: 1 });
});
test("invalid callback data is bounded and reported without uncaught exceptions", () => {
  const recorder = createBoundedWorkerEventRecorder();
  assert.doesNotThrow(() => recorder.record({ role: "save", event: "closed", url: "owned", observedAt: 1 }));
  assert.match(recorder.summary().firstError, /without matching creation/); assert.equal(recorder.events.length, 0);
  assert.equal(recorder.record({ role: "bad", event: "created", url: "x".repeat(10000), observedAt: 2 }), false);
  assert.ok(recorder.summary().firstError.length <= 512);
});
