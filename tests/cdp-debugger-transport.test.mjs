import assert from "node:assert/strict";
import test from "node:test";
import { connectDebuggerTransport } from "../scripts/lib/cdp-debugger-transport.mjs";
class FakeSocket extends EventTarget {
  static last;
  constructor() { super(); FakeSocket.last = this; this.closed = false; queueMicrotask(() => this.dispatchEvent(new Event("open"))); }
  send(value) { this.request = JSON.parse(value); }
  close() { this.closed = true; }
  message(value) { const event = new Event("message"); event.data = value; this.dispatchEvent(event); }
}
async function withFake(run) {
  const original = globalThis.WebSocket; globalThis.WebSocket = FakeSocket;
  try { await run(); } finally { globalThis.WebSocket = original; }
}
test("Debugger routes worker sessions/events and rejects non-loopback sockets", async () => withFake(async () => {
  await assert.rejects(connectDebuggerTransport("ws://example.com/debug"), /loopback/);
  const transport = await connectDebuggerTransport("ws://127.0.0.1/debug"), events = [];
  const remove = transport.onEvent(event => events.push(event));
  const pending = transport.send("Runtime.getProperties", { objectId: "scalar" }, "worker");
  assert.equal(FakeSocket.last.request.sessionId, "worker");
  FakeSocket.last.message(JSON.stringify({ method: "Debugger.paused", sessionId: "worker", params: {} }));
  FakeSocket.last.message(JSON.stringify({ id: FakeSocket.last.request.id, result: { result: [] } }));
  assert.deepEqual(await pending, { result: [] }); assert.equal(events.length, 1);
  remove(); transport.close(); assert.equal(FakeSocket.last.closed, true);
}));
test("Command deadline and malformed payload close connection without pending retry queues", async () => withFake(async () => {
  const transport = await connectDebuggerTransport("ws://127.0.0.1/debug", 20);
  await assert.rejects(transport.send("Runtime.getProperties"), /command deadline/);
  await assert.rejects(transport.send("Runtime.getProperties"), /unavailable/);
  assert.equal(FakeSocket.last.closed, true);
  const malformed = await connectDebuggerTransport("ws://127.0.0.1/debug");
  const pending = malformed.send("Debugger.enable"); FakeSocket.last.message("not JSON");
  await assert.rejects(pending, /Invalid debugger/); assert.equal(FakeSocket.last.closed, true);
}));
