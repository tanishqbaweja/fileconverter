// Diagnostic isolate heaps only. Never substitute these for OS private bytes.
export function normalizeHeapUsage(value) {
  const number = (key) => typeof value?.[key] === "number" && Number.isFinite(value[key]) && value[key] >= 0 ? value[key] : null;
  return { usedJSHeapBytes: number("usedSize"), allocatedJSHeapBytes: number("totalSize"),
    embedderHeapUsedBytes: number("embedderHeapUsedSize"), backingStorageBytes: number("backingStorageSize") };
}
async function deadline(promise, ms) {
  let timer;
  try { return await Promise.race([promise, new Promise((resolve) => { timer = setTimeout(() => resolve(null), ms); })]); }
  finally { clearTimeout(timer); }
}

export function createRealmSampler(transport, origin, timeoutMs = 1000) {
  const entries = new Map(), leases = new Set();
  const maximumLeases = 16;
  let discovery = null, discoveryObservation = null, closed = false, peakLeasedEntries = 0, retirementFailures = 0, lastRetirementError = null;
  const unavailable = error => ({ ...normalizeHeapUsage(null), error });
  const releaseRetired = entry => {
    // A failed/unanswered detach still owns a possible browser-side session.
    // Keep that lease counted until transport close; never hide it or requeue.
    if (entry.retired && !entry.pending && !entry.detaching && !entry.retirementFailed) {
      leases.delete(entry); entry.sessionId = null;
    }
  };
  const detachRetired = entry => {
    if (closed || !entry.sessionId || entry.detachAttempted) return;
    const sessionId = entry.sessionId;
    entry.detachAttempted = true;
    entry.detaching = Promise.resolve().then(() => {
      if (!closed) return transport.send("Target.detachFromTarget", { sessionId });
    }).catch(error => {
      entry.retirementFailed = true; retirementFailures++;
      lastRetirementError = String(error).slice(0, 512);
    }).finally(() => { entry.detaching = null; releaseRetired(entry); });
  };
  const retire = entry => {
    entry.retired = true; detachRetired(entry); releaseRetired(entry);
  };
  return {
    ownershipSummary() {
      return { activeEntries: entries.size, leasedEntries: leases.size,
        retiringEntries: [...leases].filter(entry => entry.retired).length,
        pendingOperations: [...leases].reduce((n, entry) => n + Number(Boolean(entry.pending)) + Number(Boolean(entry.detaching)), 0),
        peakLeasedEntries, maximumLeases, retirementFailures, lastRetirementError,
        maximumObservationRacesPerOperation: 1, queuedRequests: 0, closed, diagnosticAttachmentsOnly: true, acceptanceMetric: false };
    },
    async sample() {
      if (closed) return { targetsAvailable: false, targets: null };
      if (!discovery) {
        discovery = transport.send("Target.getTargets").catch(() => null).finally(() => { discovery = null; discoveryObservation = null; });
        // Memoize the observation, not just the request: racing an unanswered
        // Promise again on every tick would retain another listener each time.
        discoveryObservation = deadline(discovery, timeoutMs);
      }
      const result = await discoveryObservation;
      if (closed || !result) return { targetsAvailable: false, targets: null };
      const targets = result.targetInfos.filter((target) => ["page", "iframe", "worker", "shared_worker", "service_worker"].includes(target.type) &&
        (target.url === "about:blank" || target.url.startsWith(`${origin}/`)));
      if (targets.length > 16) throw new Error("Diagnostic CDP realm limit exceeded");
      const live = new Set(targets.map((target) => target.targetId));
      for (const [id, entry] of entries) {
        if (!live.has(id)) {
          entries.delete(id); retire(entry);
        }
      }
      return { targetsAvailable: true, targets: await Promise.all(targets.map(async (target) => {
        let entry = entries.get(target.targetId);
        if (!entry) {
          if (leases.size >= maximumLeases) return { targetId: target.targetId, type: target.type, url: target.url,
            ...unavailable("Diagnostic CDP attachment lease cap reached; no attachment queued") };
          entry = { sessionId: null, pending: null, observation: null, detaching: null, retired: false, detachAttempted: false, retirementFailed: false };
          entries.set(target.targetId, entry); leases.add(entry); peakLeasedEntries = Math.max(peakLeasedEntries, leases.size);
        }
        // A timeout does not clear the outstanding command. Keep one pending
        // request per target until its actual reply/close; do not grow queues.
        if (!entry.pending) {
          entry.pending = (async () => {
          if (!entry.sessionId) entry.sessionId = (await transport.send("Target.attachToTarget", { targetId: target.targetId, flatten: true })).sessionId;
          if (typeof entry.sessionId !== "string" || !entry.sessionId) throw new Error("Diagnostic CDP attachment identity unavailable");
          if (closed || entry.retired) {
            detachRetired(entry);
            return unavailable("Diagnostic CDP target retired before attachment completed");
          }
          const value = await transport.send("Runtime.getHeapUsage", {}, entry.sessionId);
          if (closed || entry.retired) return unavailable("Diagnostic CDP target retired before heap reply completed");
          return { ...normalizeHeapUsage(value), error: null };
        })().catch((error) => {
          const message = String(error).slice(0, 512);
          // A real detached-session reply completes the failed operation. Reuse
          // no dead session; attach afresh on the next scheduled sample only.
          // An observation timeout still leaves the existing operation pending.
          if (/Session with given id not found|No session with given id|Realm target detached/i.test(message)) entry.sessionId = null;
          return { ...normalizeHeapUsage(null), error: message };
        })
          .finally(() => { entry.pending = null; entry.observation = null; releaseRetired(entry); });
          entry.observation = deadline(entry.pending, timeoutMs);
        }
        const usage = await entry.observation;
        return { targetId: target.targetId, type: target.type, url: target.url,
          ...(usage ?? { ...normalizeHeapUsage(null), error: "CDP heap reply unavailable before diagnostic deadline; operation remains bounded" }) };
      })) };
    },
    close() {
      if (closed) return;
      closed = true;
      for (const entry of leases) entry.retired = true;
      entries.clear(); leases.clear();
      // Closing this owned transport releases its remaining attachments and
      // rejects outstanding commands. Late replies cannot start more work.
      transport.close();
    },
  };
}

export async function connectRealmSampler(socketUrl, origin) {
  const socket = new WebSocket(socketUrl), pending = new Map();
  let sequence = 0, closed = false;
  const rejectPending = () => {
    closed = true;
    for (const item of pending.values()) item.reject(new Error("Diagnostic CDP socket closed"));
    pending.clear();
  };
  socket.addEventListener("close", rejectPending);
  socket.addEventListener("error", rejectPending);
  socket.addEventListener("message", ({ data }) => {
    if (typeof data !== "string" || data.length > 1024 * 1024) { socket.close(); return; }
    let message;
    try { message = JSON.parse(data); } catch { socket.close(); return; }
    const item = pending.get(message.id);
    if (!item) return;
    pending.delete(message.id);
    if (message.error) item.reject(new Error(message.error.message)); else item.resolve(message.result);
  });
  const opened = await deadline(new Promise((resolve) => {
    socket.addEventListener("open", () => resolve(true), { once: true });
    socket.addEventListener("error", () => resolve(false), { once: true });
  }), 5000);
  if (!opened) { socket.close(); throw new Error("Diagnostic CDP socket unavailable"); }
  return createRealmSampler({
    send(method, params = {}, sessionId) {
      if (closed || pending.size >= 64) return Promise.reject(new Error("Diagnostic CDP request unavailable/cap reached"));
      const id = ++sequence;
      return new Promise((resolve, reject) => {
        pending.set(id, { resolve, reject });
        try { socket.send(JSON.stringify({ id, method, params, ...(sessionId ? { sessionId } : {}) })); }
        catch (error) { pending.delete(id); reject(error); }
      });
    },
    close() { rejectPending(); socket.close(); },
  }, origin);
}
