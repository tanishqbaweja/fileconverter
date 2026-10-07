// Small actual page DOM counters only, not live allocation or native-memory acceptance.
import assert from "node:assert/strict";
export function normalizeDomCounters(value) {
  const count = key => Number.isSafeInteger(value?.[key]) && value[key] >= 0 ? value[key] : null;
  return { documents: count("documents"), nodes: count("nodes"), jsEventListeners: count("jsEventListeners") };
}
export function createBoundedDomCounterSampler(session, { timeoutMs = 1000, targetId = null } = {}) {
  assert.equal(typeof session?.send, "function"); assert.ok(timeoutMs > 0 && timeoutMs <= 1000);
  assert.ok(targetId === null || (typeof targetId === "string" && targetId.length <= 128));
  let pending = null, closed = false, sends = 0;
  return {
    async sample(observedPhase) {
      assert.match(observedPhase, /^[a-z0-9-]{1,64}$/);
      if (closed) return { observedPhase, targetId, ...normalizeDomCounters(null), unavailable: "DOM sampler closed", pending: false };
      if (!pending) {
        const operation = { startedAt: Date.now(), requestPhase: observedPhase, promise: null };
        sends++;
        operation.promise = Promise.resolve().then(() => session.send("Memory.getDOMCounters"))
          .then(value => {
            const normalized = normalizeDomCounters(value);
            return { ...normalized, unavailable: Object.values(normalized).some(v => v === null) ? "Some DOM counters unavailable" : null, pending: false };
          })
          .catch(error => ({ ...normalizeDomCounters(null), unavailable: String(error).slice(0, 512) }))
          .then(value => ({ ...value, finishedAt: Date.now() }))
          .finally(() => { if (pending === operation) pending = null; });
        pending = operation;
      }
      const operation = pending; let timer;
      try {
        const value = await Promise.race([operation.promise, new Promise(resolve => {
          timer = setTimeout(() => resolve(null), timeoutMs);
        })]);
        return { observedPhase, requestPhase: operation.requestPhase, targetId, startedAt: operation.startedAt,
          ...value ?? { ...normalizeDomCounters(null), finishedAt: null,
            unavailable: "DOM reply deadline; original operation remains pending without queue", pending: true },
          sampledAt: Date.now(), acceptanceMetric: false, nativeProcessIdentity: null };
      } finally { clearTimeout(timer); }
    },
    close() { closed = true; },
    report: () => ({ maximumPendingCommands: 1, queuedCommands: 0, commandsSent: sends,
      pending: Boolean(pending), closed, targetId, noForcedGc: true, nativeProcessIdentity: null,
      caveat: "Actual page DOM counters only. Counts may include garbage. Do not infer live bytes/callsite/leak or join a renderer PID from targetId alone. Request origin retained when a timeout/concurrent caller shares the single pending command." }),
  };
}
