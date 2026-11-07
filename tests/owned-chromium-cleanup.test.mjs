import assert from "node:assert/strict";
import test from "node:test";
import { cleanupOwnedChromium } from "../scripts/lib/owned-chromium-cleanup.mjs";
const identity = { pid: 42, parentPid: 1, createdAt: "2026-11-07T00:00:00.000123Z" };
const base = { identity, observedPids: [42, 43], disconnect: async () => {}, queryIdentity: async () => identity,
  census: async () => [], pause: async () => {} };
test("taskkill255 is preserved and independently reconciled only when ALL observed PIDs are absent", async () => {
  const r = await cleanupOwnedChromium({ ...base, kill: async pid => { assert.equal(pid, 42); throw Object.assign(new Error("child operation not supported"), { code: 255 }); } });
  assert.equal(r.status, "owned-observed-pids-absent"); assert.equal(r.commandErrors[0].code, 255);
  assert.equal(r.rootIdentityMatched, true); assert.equal(r.individualChildKills, false);
  assert.deepEqual(r.observedPids, [42, 43]); assert.deepEqual(r.observations[0].current, []);
});
test("live child or unavailable census fails closed even if root exited or taskkill returned success", async () => {
  for (const census of [async () => [{ ...identity, pid: 43 }], async () => { throw new Error("CIM unavailable"); }, async () => undefined]) {
    let killed = 0;
    const r = await cleanupOwnedChromium({ ...base, queryIdentity: async () => null, census, kill: async () => { killed++; } });
    assert.equal(r.status, "owned-observed-pids-not-proven-absent"); assert.equal(r.observations.length, 4); assert.equal(killed, 0);
  }
});
test("changed parent or submillisecond birth never authorizes root/child termination", async () => {
  for (const current of [{ ...identity, parentPid: 2 }, { ...identity, createdAt: "2026-11-07T00:00:00.000124Z" }]) {
    let killed = 0;
    const r = await cleanupOwnedChromium({ ...base, queryIdentity: async () => current, census: async () => [current], kill: async () => { killed++; } });
    assert.equal(killed, 0); assert.equal(r.rootIdentityMatched, false); assert.ok(r.identityErrors);
    assert.equal(r.status, "owned-observed-pids-not-proven-absent");
  }
});
test("disconnect failure cannot skip owned teardown; census retries keep unavailable distinct from empty", async () => {
  let calls = 0, kills = 0;
  const r = await cleanupOwnedChromium({ ...base, disconnect: async () => { throw new Error("transport already closed"); },
    kill: async () => { kills++; }, census: async () => { if (++calls === 1) throw new Error("unavailable"); return []; } });
  assert.equal(kills, 1); assert.equal(r.status, "owned-observed-pids-absent"); assert.ok(r.disconnectErrors);
  assert.equal(r.observations[0].current, null); assert.deepEqual(r.observations[1].current, []);
});
