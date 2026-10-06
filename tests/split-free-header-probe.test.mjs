import assert from "node:assert/strict";
import test from "node:test";
import { createSplitFreeHeaderProbe } from "../scripts/lib/split-free-header-probe.mjs";
test("Unavailable header state remains null and original abort callback is preserved", () => {
  const records = [], aborted = [];
  const probe = createSplitFreeHeaderProbe({ heap: () => null, memoryBytes: () => 33554432,
    emit: text => records.push(text), onAbort: value => aborted.push(value) });
  for (let i = 0; i < 10; i++) probe("OOM");
  const free = records.filter(text => text.startsWith("WITHIN_MPEG2_FREE_HEADERS "));
  assert.equal(free.length, 2); assert.equal(aborted.length, 10);
  const record = JSON.parse(free[0].slice("WITHIN_MPEG2_FREE_HEADERS ".length));
  assert.equal(record.available, false); assert.equal(record.state, null); assert.match(record.error, /extent unavailable/);
});
test("Failed diagnostic emission cannot replace normal abort failure", () => {
  const original = new Error("normal abort"), probe = createSplitFreeHeaderProbe({ heap: () => { throw new Error("unavailable"); },
    memoryBytes: () => 33554432, emit: () => { throw new Error("console unavailable"); }, onAbort: () => { throw original; } });
  assert.throws(() => probe("OOM"), error => error === original);
});
