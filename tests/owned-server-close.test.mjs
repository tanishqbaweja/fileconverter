import assert from "node:assert/strict";
import test from "node:test";
import { readFile } from "node:fs/promises";
import { createOwnedServerCloser } from "../scripts/lib/owned-server-close.mjs";

const born = Object.freeze({ pid: 7, parentPid: 6, createdAt: "2026-11-15T00:00:00.0000000Z" });
const pause = async () => {};

test("unavailable identity never permits a kill or an absence claim; retry keeps the launch birth", async () => {
  let unavailable = true, live = true, kills = 0;
  const close = createOwnedServerCloser({ born, pause,
    readIdentity: async pid => { assert.equal(pid, 7); if (unavailable) throw new Error("identity unavailable"); return live ? born : null; },
    terminate: async () => { kills++; live = false; },
  });
  await assert.rejects(close(), /identity unavailable/); assert.equal(kills, 0);
  unavailable = false;
  const proof = await close(); assert.equal(proof.ownedRootAbsent, true); assert.deepEqual(proof.identity, born); assert.equal(kills, 1);
  assert.deepEqual(await close(), proof); assert.equal(kills, 1);
});

test("reused unrelated PID is never terminated and simultaneous closes share one attempt", async () => {
  let kills = 0;
  const reused = { ...born, createdAt: "2026-11-15T00:05:00.0000000Z" };
  const close = createOwnedServerCloser({ born, pause, readIdentity: async () => reused, terminate: async () => { kills++; } });
  const a = close(), b = close(); assert.equal(a, b);
  assert.equal((await a).pidReused, true); assert.equal(kills, 0);
});

test("taskkill exit race is accepted only after a fresh verified absence; live root retains the real failure", async () => {
  const terminationError = Object.assign(new Error("taskkill already exited"), { code: 128 });
  let live = true;
  const close = createOwnedServerCloser({ born, pause, readIdentity: async () => live ? born : null,
    terminate: async () => { live = false; throw terminationError; } });
  const proof = await close(); assert.equal(proof.ownedRootAbsent, true);
  assert.deepEqual(proof.terminationRace, [{ name: "Error", message: terminationError.message, code: 128 }]);
  const stuck = createOwnedServerCloser({ born, pause, readIdentity: async () => born, terminate: async () => { throw terminationError; } });
  await assert.rejects(stuck(), error => error.message === "Owned production server exit unverified" && error.cause === terminationError);
});

test("failed final observation is not zero and does not cache false cleanup success", async () => {
  let calls = 0, observing = false;
  const close = createOwnedServerCloser({ born, pause,
    readIdentity: async () => { calls++; if (!observing) return born; throw new Error("post-kill census unavailable"); },
    terminate: async () => { observing = true; } });
  await assert.rejects(close(), /census unavailable/); assert.equal(calls, 2);
  await assert.rejects(close(), /census unavailable/); assert.equal(calls, 3);
});

test("birth equality is independent of CIM JSON property order; malformed observations never become reused-PID absence", async () => {
  let live = true, kills = 0;
  const close = createOwnedServerCloser({ born, pause,
    readIdentity: async () => live ? { createdAt: born.createdAt, parentPid: born.parentPid, pid: born.pid } : null,
    terminate: async () => { kills++; live = false; } });
  assert.equal((await close()).ownedRootAbsent, true); assert.equal(kills, 1);
  const invalid = createOwnedServerCloser({ born, pause, readIdentity: async () => ({ pid: 7, parentPid: 6 }), terminate: async () => { kills++; } });
  await assert.rejects(invalid(), /observation is unavailable/); assert.equal(kills, 1);
});

test("server launcher persists birth/arguments before readiness and hides inherited nested helpers", async () => {
  const source = await readFile("scripts/lib/owned-production-test-server.mjs", "utf8");
  assert.match(source, /queryReliableProcessIdentity\(pid\)/);
  assert.match(source, /NODE_OPTIONS:/); assert.match(source, /hidden-unit-subprocesses\.mjs/);
  assert.match(source, /windowsHide: true/); assert.match(source, /owned-production-server-launch\.json/);
  assert.ok(source.indexOf("await writeFile(") < source.indexOf("let ready = false"));
  const harness = await readFile("scripts/qualify-mkv-direct-reuse.mjs", "utf8");
  assert.match(harness, /result.serverLaunch = server.launchRecord/);
  assert.match(harness, /cleanupFailureDetails = boundedErrorDetails\(error\)/);
});

test("actual headless production server smoke proves readiness/root absence, not browser/conversion or full-tree acceptance", async () => {
  for (const file of ["evidence/2026-11-15T00-52-56-558Z-owned-production-server-cleanup.json",
    "evidence/2026-11-15T07-21-32-000Z-owned-production-server-cleanup.json"]) {
  const r = JSON.parse(await readFile(file));
  assert.equal(r.status, "passed-real-owned-server-launch-readiness-and-root-cleanup");
  assert.equal(r.healthStatus, 200); assert.equal(r.launch.windowsHide, true);
  assert.match(r.launch.nestedSubprocessPreload, /hidden-unit-subprocesses\.mjs/);
  assert.deepEqual(r.launch.identity, r.cleanup.identity); assert.equal(r.cleanup.ownedRootAbsent, true);
  assert.equal(r.ownedRuntimeRemoved, true); assert.equal(r.browserLaunched, false);
  assert.equal(r.mediaSelected, false); assert.equal(r.originalOpened, false); assert.equal(r.publicAcceptance, false);
  }
});
