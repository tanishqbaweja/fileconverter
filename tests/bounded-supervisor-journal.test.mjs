import assert from "node:assert/strict";
import { readFile, readdir } from "node:fs/promises";
import path from "node:path";
import test from "node:test";
import { boundedTail, supervisorJournal } from "../scripts/lib/bounded-supervisor-journal.mjs";
import { createOwnedRuntimeScratch } from "../scripts/lib/owned-runtime-scratch.mjs";

test("supervisor drains arbitrarily large logs into exact fixed-size tails", () => {
  const tail = boundedTail(4);
  tail.append(Buffer.from("abc")); tail.append(Buffer.from("def"));
  assert.deepEqual(tail.snapshot(), { totalBytes: 6, retainedBytes: 4, limit: 4, tailBase64: Buffer.from("cdef").toString("base64") });
  tail.append(Buffer.alloc(1048576, 42));
  assert.equal(tail.snapshot().retainedBytes, 4); assert.equal(tail.snapshot().totalBytes, 1048582);
  assert.deepEqual(Buffer.from(tail.snapshot().tailBase64, "base64"), Buffer.alloc(4, 42));
  for (const cap of [0, -1, 65537, Infinity]) assert.throws(() => boundedTail(cap));
});

test("supervisor checkpoints serialize atomic replacements, leave no scratch, and reject oversized reports", async () => {
  const runtime = await createOwnedRuntimeScratch("supervisor-journal-test-");
  try {
    const file = path.join(runtime.directory, "state.json"), write = supervisorJournal(file, 1024);
    await Promise.all([write({ revision: 1 }), write({ revision: 2 }), write({ revision: 3 })]);
    assert.deepEqual(JSON.parse(await readFile(file)), { revision: 3 });
    assert.deepEqual(await readdir(runtime.directory), ["state.json"]);
    assert.throws(() => write({ oversized: "x".repeat(2048) }));
    assert.deepEqual(JSON.parse(await readFile(file)), { revision: 3 });
  } finally { await runtime.close(); }
});
