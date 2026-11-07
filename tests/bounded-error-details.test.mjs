import assert from "node:assert/strict";
import { test } from "node:test";
import { boundedErrorDetails } from "../scripts/lib/bounded-error-details.mjs";
test("owned cleanup aggregation retains nested real error identity/code instead of only a generic AggregateError string", () => {
  const cause = Object.assign(new Error("owned PID already exited"), { code: 128 });
  const rows = boundedErrorDetails(new AggregateError([cause, new Error("identity unavailable")], "owned cleanup failed"));
  assert.deepEqual(rows.map(x => [x.name, x.message, x.code]), [["AggregateError", "owned cleanup failed", null],
    ["Error", "owned PID already exited", 128], ["Error", "identity unavailable", null]]);
});
test("cycles, excessive causes and oversized strings have hard bounds without serializing buffers or command/stdout properties", () => {
  const error = new Error("x".repeat(10000)); error.cause = error;
  Object.defineProperty(error, "stdout", { get() { throw Error("Must not inspect stdout"); } });
  const rows = boundedErrorDetails(new AggregateError(Array(100).fill(error), "many"));
  assert.ok(rows.length <= 8); assert.equal(rows[1].message.length, 2048);
  assert.deepEqual(Object.keys(rows[1]), ["name", "message", "code"]);
});
test("opaque buffers, objects and hostile error getters cannot be expanded into diagnostic payloads", () => {
  const bytes = Buffer.alloc(1048576); bytes.toString = () => { throw Error("Must never serialize a buffer"); };
  assert.match(boundedErrorDetails(bytes)[0].message, /payload not serialized/);
  const error = new Error("safe"); Object.defineProperty(error, "cause", { get() { throw Error("hostile getter"); } });
  assert.equal(boundedErrorDetails(error)[0].message, "safe");
  assert.ok(boundedErrorDetails("x".repeat(10000))[0].message.length <= 2048);
});
