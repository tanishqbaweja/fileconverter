import assert from "node:assert/strict";
import test from "node:test";
import { createBoundedWasmAbortCapture } from "../scripts/lib/bounded-wasm-abort-capture.mjs";

test("Wasm abort diagnostic is inactive until failure and retains exactly one bounded actual stack", () => {
  const emitted = [], limit = Error.stackTraceLimit;
  const capture = createBoundedWasmAbortCapture({ role: "decoder", emit: row => emitted.push(row) });
  assert.equal(capture.report().first, null); assert.equal(capture.report().captureStarted, false);
  capture.onAbort("x".repeat(10000)); capture.onAbort("second abort");
  assert.equal(emitted.length, 1); assert.equal(emitted[0].reason.length, 512);
  assert.equal(emitted[0].reasonTruncated, true); assert.ok(emitted[0].stack.length <= 8192);
  assert.equal(emitted[0].stackLimitRestored, true); assert.equal(Error.stackTraceLimit, limit);
  assert.equal(capture.report().first, emitted[0]); assert.equal(capture.report().queuedRecords, 0);
  assert.equal(emitted[0].failedIndividualAllocationBytes, null); assert.equal(emitted[0].heapLiveBytes, null);
});

test("diagnostic emitter failures cannot mask the native error or its original onAbort callback", () => {
  const originalError = new Error("original callback rejection"); let calls = 0;
  const capture = createBoundedWasmAbortCapture({ role: "encoder", emit: () => { throw new Error("emission failed"); } });
  const callback = capture.withPriorOnAbort(() => { calls++; throw originalError; });
  assert.throws(() => callback("native OOM"), error => error === originalError);
  assert.equal(calls, 1); assert.match(capture.report().emitFailure, /emission failed/);
  assert.equal(capture.report().nativeErrorSuppressed, false);
});

test("original abort callback semantics and unavailable values are not rewritten as successful data", () => {
  const capture = createBoundedWasmAbortCapture({ role: "decoder", emit: () => {} });
  assert.equal(capture.withPriorOnAbort(reason => `prior:${reason}`)(null), "prior:null");
  assert.equal(capture.report().first.reason, null); assert.match(capture.report().first.unavailable, /unavailable/);
  assert.equal(capture.withPriorOnAbort(undefined)("ignored repeat"), undefined);
  assert.throws(() => capture.withPriorOnAbort({})("invalid original callback"), TypeError);
  assert.throws(() => createBoundedWasmAbortCapture({ role: "unknown", emit: () => {} }), TypeError);
});
