import assert from "node:assert/strict";
export function verifyJsProbeIdentityAbsence(observed, current) {
  assert.ok(Array.isArray(observed) && observed.length > 0 && observed.length <= 128 && Array.isArray(current));
  for (const entry of [...observed, ...current]) {
    assert.ok(Number.isSafeInteger(entry.pid) && entry.pid > 0 && Number.isSafeInteger(entry.parentPid));
    assert.ok(typeof entry.createdAt === "string" && Number.isFinite(Date.parse(entry.createdAt)), "Birth time unavailable");
  }
  const survivors = current.filter(now => observed.some(prior => prior.pid === now.pid &&
    prior.parentPid === now.parentPid && prior.createdAt === now.createdAt));
  assert.deepEqual(survivors, [], "Original PID-parent-birth identity still alive");
  const reusedPids = current.filter(now => observed.some(prior => prior.pid === now.pid)).map(now => ({
    current: now, original: observed.filter(prior => prior.pid === now.pid) }));
  return { originalIdentityCount: observed.length, originalIdentitiesAbsent: true, reusedPids,
    noProcessesKilled: true, unavailableBirthsAssumedAbsent: false };
}
