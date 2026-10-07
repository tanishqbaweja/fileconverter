import assert from "node:assert/strict";
import test from "node:test";
import { createBoundedDomCounterSampler, normalizeDomCounters } from "../scripts/lib/bounded-dom-counters.mjs";
test("actual DOM counter schema accepts genuine zero but unavailable/malformed counts are never invented", async () => {
  assert.deepEqual(normalizeDomCounters({ documents: 2, nodes: 8, jsEventListeners: 0 }), { documents: 2, nodes: 8, jsEventListeners: 0 });
  assert.deepEqual(normalizeDomCounters({ documents: -1, nodes: "8" }), { documents: null, nodes: null, jsEventListeners: null });
  const sampler = createBoundedDomCounterSampler({ send: async () => ({ nodes: 8 }) });
  const row = await sampler.sample("blank"); assert.equal(row.nodes, 8); assert.equal(row.documents, null);
  assert.equal(row.unavailable, "Some DOM counters unavailable"); assert.equal(row.nativeProcessIdentity, null);
});
test("DOM timeout and concurrent callers retain ONE pending command without queue or zero fallback", async () => {
  let calls = 0, resolve;
  const sampler = createBoundedDomCounterSampler({ send: () => { calls++; return new Promise(r => { resolve = r; }); } }, { timeoutMs: 5, targetId: "actual-page-id" });
  const first = await sampler.sample("conversion-1"); assert.equal(first.nodes, null); assert.equal(first.pending, true);
  const second = await sampler.sample("native-budget-failure"); assert.equal(calls, 1);
  assert.equal(second.requestPhase, "conversion-1"); assert.equal(second.observedPhase, "native-budget-failure");
  assert.equal(sampler.report().queuedCommands, 0);
  resolve({ documents: 6, nodes: 6800, jsEventListeners: 200 });
  await new Promise(r => setImmediate(r));
  assert.equal(sampler.report().pending, false); sampler.close();
  const closed = await sampler.sample("closed"); assert.equal(closed.nodes, null); assert.equal(calls, 1);
});
test("DOM command failures remain explicit, bounded and recoverable", async () => {
  let calls = 0;
  const sampler = createBoundedDomCounterSampler({ send: async () => { if (++calls === 1) throw new Error("unavailable"); return { documents: 2, nodes: 8, jsEventListeners: 0 }; } });
  const failed = await sampler.sample("blank"); assert.equal(failed.nodes, null); assert.match(failed.unavailable, /unavailable/);
  assert.equal((await sampler.sample("blank")).nodes, 8); assert.equal(calls, 2);
});
