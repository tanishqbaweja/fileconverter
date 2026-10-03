import assert from "node:assert/strict";
import test from "node:test";
import { createRealmSampler, normalizeHeapUsage } from "../scripts/lib/cdp-realm-memory.mjs";

test("CDP heap diagnostics retain unavailable fields as null, separate from OS memory", () => {
  assert.deepEqual(normalizeHeapUsage({ usedSize: 12, totalSize: 34, backingStorageSize: 56 }), {
    usedJSHeapBytes: 12, allocatedJSHeapBytes: 34, embedderHeapUsedBytes: null, backingStorageBytes: 56,
  });
  assert.equal(normalizeHeapUsage({ usedSize: NaN }).usedJSHeapBytes, null);
  assert.equal(normalizeHeapUsage({ usedSize: -1 }).usedJSHeapBytes, null);
});
test("busy worker heap queries remain single-flight across observation timeouts", async () => {
  let queries = 0, finish;
  const target = { targetId: "worker", type: "worker", url: "http://127.0.0.1:3000/assets/worker.js" };
  const transport = { close() {}, async send(method) {
    if (method === "Target.getTargets") return { targetInfos: [target, { ...target, targetId: "extension", url: "chrome-extension://other/background.js" }] };
    if (method === "Target.attachToTarget") return { sessionId: "session" };
    queries++;
    return new Promise((resolve) => { finish = resolve; });
  } };
  const sampler = createRealmSampler(transport, "http://127.0.0.1:3000", 5);
  const first = await sampler.sample(), second = await sampler.sample();
  assert.equal(first.targets.length, 1);
  assert.equal(first.targets[0].usedJSHeapBytes, null);
  assert.equal(second.targets[0].usedJSHeapBytes, null);
  assert.equal(queries, 1);
  finish({ usedSize: 123, totalSize: 456 });
  await new Promise((resolve) => setImmediate(resolve));
  sampler.close();
});
