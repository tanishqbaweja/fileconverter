import assert from "node:assert/strict";
import test from "node:test";
import { observeOwnedProcessExit } from "../scripts/lib/owned-process-exit-observation.mjs";
const identity = { pid: 42, parentPid: 1, createdAt: "2026-10-07T10:00:00.000Z" };
test("retry unavailable without inventing zero; wait for actual same-birth exit", async () => {
  let at = 0, calls = 0;
  const result = await observeOwnedProcessExit(identity, { now: () => at, pause: async ms => { at += ms; },
    query: async () => { calls++; if (calls === 1) throw new Error("CIM unavailable"); return calls === 2 ? identity : null; } });
  assert.equal(result.status, "owned-identity-absent"); assert.equal(result.observations.length, 3);
  assert.equal(result.observations[0].ownedIdentityPresent, null); assert.equal(result.observations[1].ownedIdentityPresent, true);
});
test("PID reused with new birth proves old identity absent without killing replacement", async () => {
  const result = await observeOwnedProcessExit(identity, { query: async () => ({ ...identity, parentPid: 9, createdAt: "2026-10-07T10:00:01Z" }) });
  assert.equal(result.status, "owned-identity-absent"); assert.equal(result.pidReused, true); assert.equal(result.noProcessesKilled, true);
});
test("query failure, invalid identity and same-birth parent discrepancy do not prove exit", async () => {
  for (const query of [async () => { throw new Error("query unavailable"); }, async () => ({ ...identity, createdAt: null }), async () => ({ ...identity, parentPid: 9 })]) {
    let at = 0;
    const result = await observeOwnedProcessExit(identity, { query, now: () => at, pause: async ms => { at += ms; }, maximumQueries: 2 });
    assert.equal(result.status, "owned-identity-not-proven-absent"); assert.equal(result.observations.length, 2);
  }
});
