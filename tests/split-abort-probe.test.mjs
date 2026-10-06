import assert from "node:assert/strict";
import test from "node:test";
import { createSplitAbortProbe } from "../scripts/lib/split-abort-probe.mjs";

test("Abort probe is bounded, restores stack settings and preserves the original callback", () => {
  const records = [], original = [], previous = Error.stackTraceLimit;
  const probe = createSplitAbortProbe({ memoryBytes: () => 33554432, onAbort: value => original.push(value), emit: text => records.push(text) });
  for (let i = 0; i < 10; i++) probe("OOM".repeat(500));
  assert.equal(records.length, 2); assert.equal(original.length, 10); assert.equal(Error.stackTraceLimit, previous);
  const first = JSON.parse(records[0].slice("WITHIN_MPEG2_OOM_STACK ".length));
  assert.equal(first.what.length, 512); assert.ok(first.stack.length <= 8192);
  assert.equal(first.memoryBytes, 33554432); assert.equal(first.sequence, 1);
});

test("Abort diagnostics cannot swallow or replace normal abort handling", () => {
  const failure = new Error("normal abort callback");
  const probe = createSplitAbortProbe({ memoryBytes: () => { throw new Error("diagnostic failed"); }, onAbort: () => { throw failure; } });
  assert.throws(() => probe("OOM"), error => error === failure);
  const safe = createSplitAbortProbe({ memoryBytes: () => 33554432, emit: () => { throw new Error("console unavailable"); } });
  assert.doesNotThrow(() => safe("OOM"));
});
