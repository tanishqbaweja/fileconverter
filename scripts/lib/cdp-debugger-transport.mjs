// Bounded, event-capable browser CDP connection for ONE failure-point capture.
// Command timeout closes the connection: no overlapping retry queues.
export async function connectDebuggerTransport(socketUrl, timeoutMs = 5000) {
  const url = new URL(socketUrl);
  if (url.protocol !== "ws:" || !["127.0.0.1", "localhost"].includes(url.hostname))
    throw new Error("Debugger must attach to owned loopback Chromium only");
  const socket = new WebSocket(socketUrl), pending = new Map(), listeners = new Set();
  let sequence = 0, closed = false;
  const close = (reason = new Error("Debugger CDP connection closed")) => {
    if (closed) return;
    closed = true;
    for (const item of pending.values()) { clearTimeout(item.timer); item.reject(reason); }
    pending.clear(); listeners.clear(); socket.close();
  };
  socket.addEventListener("close", () => close());
  socket.addEventListener("error", () => close());
  socket.addEventListener("message", ({ data }) => {
    if (typeof data !== "string" || data.length > 1024 * 1024) return close(new Error("Debugger CDP payload cap"));
    let message;
    try { message = JSON.parse(data); } catch { return close(new Error("Invalid debugger CDP payload")); }
    if (message.id) {
      const item = pending.get(message.id); if (!item) return;
      pending.delete(message.id); clearTimeout(item.timer);
      if (message.error) item.reject(new Error(message.error.message)); else item.resolve(message.result);
    } else if (message.method) {
      for (const listener of listeners) {
        try { listener(message); } catch (error) { close(error); break; }
      }
    }
  });
  let timer;
  try {
    await Promise.race([new Promise((resolve, reject) => {
      socket.addEventListener("open", resolve, { once: true });
      socket.addEventListener("error", () => reject(new Error("Debugger CDP unavailable")), { once: true });
    }), new Promise((_, reject) => { timer = setTimeout(() => reject(new Error("Debugger connect deadline")), timeoutMs); })]);
  } catch (error) { close(error); throw error; } finally { clearTimeout(timer); }
  return {
    send(method, params = {}, sessionId) {
      if (closed || pending.size >= 16) return Promise.reject(new Error("Debugger CDP request unavailable/cap"));
      const id = ++sequence;
      return new Promise((resolve, reject) => {
        const timer = setTimeout(() => close(new Error(`Debugger command deadline: ${method}`)), timeoutMs);
        pending.set(id, { resolve, reject, timer });
        try { socket.send(JSON.stringify({ id, method, params, ...(sessionId ? { sessionId } : {}) })); }
        catch (error) { close(error); }
      });
    },
    onEvent(listener) {
      if (closed || listeners.size >= 4) throw new Error("Debugger listener unavailable/cap");
      listeners.add(listener); return () => listeners.delete(listener);
    },
    close,
  };
}
