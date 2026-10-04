import assert from "node:assert/strict";

// Diagnostic-only bounded sample window. Never pauses a worker, retains the
// worker after normal completion, or changes browser conversion code.
export async function connectCpuWindow(socketUrl, origin) {
  const socket = new WebSocket(socketUrl), pending = new Map();
  let sequence = 0, closed = false;
  let started = false, windowTimer = null, finishWindow = null;
  const fail = () => {
    closed = true;
    for (const request of pending.values()) { clearTimeout(request.timer); request.reject(new Error("CPU diagnostic socket closed")); }
    pending.clear();
  };
  socket.addEventListener("close", fail); socket.addEventListener("error", fail);
  socket.addEventListener("message", ({ data }) => {
    if (typeof data !== "string" || data.length > 16 * 1024 ** 2) { socket.close(); return; }
    let message;
    try { message = JSON.parse(data); } catch { socket.close(); return; }
    const request = pending.get(message.id);
    if (!request) return;
    clearTimeout(request.timer); pending.delete(message.id);
    if (message.error) request.reject(new Error(message.error.message)); else request.resolve(message.result);
  });
  let openTimer;
  try {
    await new Promise((resolve, reject) => {
      openTimer = setTimeout(() => reject(new Error("CPU diagnostic socket unavailable")), 5000);
      socket.addEventListener("open", resolve, { once: true });
      socket.addEventListener("error", () => reject(new Error("CPU diagnostic socket error")), { once: true });
    });
  } catch (error) { socket.close(); throw error; }
  finally { clearTimeout(openTimer); }
  function send(method, params = {}, sessionId) {
    if (closed || pending.size >= 8) return Promise.reject(new Error("CPU diagnostic request cap/closed"));
    const id = ++sequence;
    return new Promise((resolve, reject) => {
      const timer = setTimeout(() => { socket.close(); fail(); }, 15_000);
      pending.set(id, { resolve, reject, timer });
      try { socket.send(JSON.stringify({ id, method, params, ...(sessionId ? { sessionId } : {}) })); }
      catch (error) { clearTimeout(timer); pending.delete(id); reject(error); }
    });
  }
  return {
    async start() {
      assert.equal(started, false, "One CPU sample window per diagnostic transport");
      started = true;
      const targets = (await send("Target.getTargets")).targetInfos;
      const workers = targets.filter((target) => target.type === "worker" &&
        target.url.startsWith(`${origin}/assets/conversion.worker-`));
      assert.equal(workers.length, 1, "Profile only the unique production conversion worker");
      const target = workers[0];
      const { sessionId } = await send("Target.attachToTarget", { targetId: target.targetId, flatten: true });
      await send("Profiler.enable", {}, sessionId);
      await send("Profiler.setSamplingInterval", { interval: 1000 }, sessionId);
      await send("Profiler.start", {}, sessionId);
      const start = Date.now();
      // Stop before the normal ~27s completion can terminate the worker. This
      // is an explicitly partial window, not a full-conversion CPU assertion.
      const result = new Promise((resolve) => {
        finishWindow = resolve;
        windowTimer = setTimeout(async () => {
          windowTimer = null;
          try {
            const { profile } = await send("Profiler.stop", {}, sessionId);
            await send("Profiler.disable", {}, sessionId);
            await send("Target.detachFromTarget", { sessionId });
            resolve({ target, requestedWindowMs: 15000, observedWindowMs: Date.now() - start,
              samplingIntervalMicroseconds: 1000, profile, error: null });
          } catch (error) { resolve({ target, requestedWindowMs: 15000, profile: null, error: String(error) }); }
        }, 15000);
      });
      return { result };
    },
    close() {
      if (windowTimer) clearTimeout(windowTimer);
      finishWindow?.({ requestedWindowMs: 15000, profile: null, error: "CPU transport closed before collection completed" });
      finishWindow = null; fail(); socket.close();
    },
  };
}
