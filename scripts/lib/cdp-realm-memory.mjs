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
  const entries = new Map();
  let discovery = null;
  return {
    async sample() {
      if (!discovery) discovery = transport.send("Target.getTargets").catch(() => null).finally(() => { discovery = null; });
      const result = await deadline(discovery, timeoutMs);
      if (!result) return { targetsAvailable: false, targets: null };
      const targets = result.targetInfos.filter((target) => ["page", "iframe", "worker", "shared_worker", "service_worker"].includes(target.type) &&
        (target.url === "about:blank" || target.url.startsWith(`${origin}/`)));
      if (targets.length > 16) throw new Error("Diagnostic CDP realm limit exceeded");
      const live = new Set(targets.map((target) => target.targetId));
      for (const [id, entry] of entries) {
        if (!live.has(id)) {
          entries.delete(id);
          if (entry.sessionId) void transport.send("Target.detachFromTarget", { sessionId: entry.sessionId }).catch(() => {});
        }
      }
      return { targetsAvailable: true, targets: await Promise.all(targets.map(async (target) => {
        let entry = entries.get(target.targetId);
        if (!entry) { entry = { sessionId: null, pending: null }; entries.set(target.targetId, entry); }
        // A timeout does not clear the outstanding command. Keep one pending
        // request per target until its actual reply/close; do not grow queues.
        if (!entry.pending) entry.pending = (async () => {
          if (!entry.sessionId) entry.sessionId = (await transport.send("Target.attachToTarget", { targetId: target.targetId, flatten: true })).sessionId;
          const value = await transport.send("Runtime.getHeapUsage", {}, entry.sessionId);
          return { ...normalizeHeapUsage(value), error: null };
        })().catch((error) => ({ ...normalizeHeapUsage(null), error: String(error).slice(0, 512) }))
          .finally(() => { entry.pending = null; });
        const usage = await deadline(entry.pending, timeoutMs);
        return { targetId: target.targetId, type: target.type, url: target.url,
          ...(usage ?? { ...normalizeHeapUsage(null), error: "CDP heap reply unavailable before diagnostic deadline; operation remains bounded" }) };
      })) };
    },
    close() { entries.clear(); transport.close(); },
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
