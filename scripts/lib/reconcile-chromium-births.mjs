import assert from "node:assert/strict";

// The native sampler reports 100 ns FILETIME; Win32_Process has microsecond
// precision. Compare on the common precision and never round a birth up.
function birthKey(value) {
  const match = /^(\d{4}-\d\d-\d\dT\d\d:\d\d:\d\d)(?:\.(\d{1,7}))?Z$/.exec(value ?? "");
  assert.ok(match && Number.isFinite(Date.parse(value)), "Invalid UTC birth timestamp");
  return match[1] + "." + (match[2] ?? "").padEnd(6, "0").slice(0, 6) + "Z";
}

/** Proof only. A reused PID is not a live browser process; never kill it. */
export function reconcileChromiumBirths({ identity, observedPids, samples, current }) {
  assert.ok(Array.isArray(observedPids) && observedPids.length > 0 && observedPids.length <= 512);
  assert.ok(Array.isArray(samples) && samples.length > 0 && samples.length <= 10000);
  assert.ok(Array.isArray(current) && current.length <= observedPids.length);
  const seen = new Map(observedPids.map(pid => [pid, new Set()]));
  assert.equal(seen.size, observedPids.length);
  assert.ok(seen.has(identity.pid));
  const rootBirth = birthKey(identity.createdAt);
  for (const sample of samples) for (const process of sample.processes ?? []) {
    assert.ok(seen.has(process.pid));
    const birth = birthKey(process.createdAt);
    if (process.pid === identity.pid) assert.equal(birth, rootBirth, "Recorded browser root identity changed");
    seen.get(process.pid).add(birth);
  }
  seen.get(identity.pid).add(rootBirth);
  assert.ok([...seen.values()].every(births => births.size), "Missing sampled birth for an observed PID");
  const unresolved = [], reused = [], pids = new Set();
  for (const row of current) {
    assert.ok(seen.has(row.pid) && !pids.has(row.pid)); pids.add(row.pid);
    const currentBirth = birthKey(row.createdAt), observedBirths = [...seen.get(row.pid)].sort();
    if (currentBirth > observedBirths.at(-1)) reused.push({ pid: row.pid, currentBirth, observedBirths });
    else unresolved.push({ pid: row.pid, currentBirth, observedBirths });
  }
  return { allObservedBirthsAbsent: unresolved.length === 0, observedPidCount: seen.size, reused, unresolved, noProcessesKilled: true };
}
