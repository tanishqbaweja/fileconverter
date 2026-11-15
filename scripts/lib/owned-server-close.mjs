import assert from "node:assert/strict";
import { boundedErrorDetails } from "./bounded-error-details.mjs";

// A failed identity observation is NOT absence. A failed close can be retried
// only through the same immutable launch identity; never by a bare reused PID.
export function createOwnedServerCloser({ born, readIdentity, terminate, pause = ms => new Promise(resolve => setTimeout(resolve, ms)) }) {
  assert.ok(born && Number.isSafeInteger(born.pid) && born.pid > 0);
  born = Object.freeze({ ...born });
  const birthKey = value => {
    assert.ok(value && Number.isSafeInteger(value.pid) && value.pid > 0 && Number.isSafeInteger(value.parentPid) && value.parentPid >= 0);
    assert.ok((typeof value.createdAt === "string" && Number.isFinite(Date.parse(value.createdAt))) ||
      (typeof value.startTicks === "string" && /^\d+$/.test(value.startTicks)), "Owned server birth observation is unavailable");
    return JSON.stringify([value.pid, value.parentPid, value.createdAt ?? null, value.startTicks ?? null]);
  };
  const launch = birthKey(born);
  let closing;
  return () => {
    if (closing) return closing;
    closing = (async () => {
      const current = await readIdentity(born.pid);
      let terminationFailure;
      if (current && birthKey(current) === launch) {
        try { await terminate(born.pid); } catch (error) { terminationFailure = error; }
      }
      for (let attempt = 0; attempt < 40; attempt++) {
        const now = await readIdentity(born.pid);
        if (!now || birthKey(now) !== launch) return {
          identity: born, ownedRootAbsent: true, pidReused: !!now,
          ...(terminationFailure ? { terminationRace: boundedErrorDetails(terminationFailure) } : {}),
        };
        if (attempt < 39) await pause(100);
      }
      throw new Error("Owned production server exit unverified", terminationFailure ? { cause: terminationFailure } : undefined);
    })().catch(error => { closing = undefined; throw error; });
    return closing;
  };
}
