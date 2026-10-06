import assert from "node:assert/strict";
import test from "node:test";
import { attachFailureLocalCapture } from "../scripts/lib/cdp-failure-local-capture.mjs";
test("Failure capture resumes after unavailable locals and ignores other sessions", async () => {
  let listener; const commands = [], sessionId = "owned-worker";
  const transport = { send: async (method, params, session) => {
    commands.push({ method, params, session });
    if (method === "Target.attachToTarget") return { sessionId };
    if (method === "Runtime.getProperties") throw new Error("Local unavailable");
    return {};
  }, onEvent: fn => { listener = fn; return () => { listener = null; }; }, close() {} };
  const inspector = await attachFailureLocalCapture(transport, "worker", new Set(["av_malloc"]));
  listener({ sessionId: "unrelated", method: "Debugger.paused", params: {} });
  listener({ sessionId, method: "Debugger.scriptParsed", params: { scriptLanguage: "WebAssembly", scriptId: "wasm" } });
  listener({ sessionId, method: "Debugger.paused", params: { callFrames: [{ functionName: "$av_malloc",
    location: { scriptId: "wasm" }, scopeChain: [{ type: "local", object: { objectId: "local" } }] }] } });
  const result = await inspector.report();
  assert.equal(result.pauses, 1); assert.equal(result.captures.length, 0); assert.match(result.errors[0], /Local unavailable/);
  assert.equal(commands.at(-1).method, "Debugger.resume"); assert.equal(commands.at(-1).session, sessionId);
  await inspector.close(); assert.equal(listener, null); assert.equal(commands.at(-1).method, "Target.detachFromTarget");
});
