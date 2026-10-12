import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import path from "node:path";
import test from "node:test";
import { makeDurablePacketCacheFullCaller, verifyDurableControl } from "../scripts/lib/durable-packet-cache-full-recipe.mjs";
import { makePacketCacheFullCaller } from "../scripts/lib/packet-cache-full-recipe.mjs";
const root = path.resolve(import.meta.dirname, "..");
test("durable caller reverses exactly to qualified333-source caller, changes only observer factory and additive evidence closure", async () => {
  const original = await makePacketCacheFullCaller(), next = await makeDurablePacketCacheFullCaller();
  let reversed = next.generated;
  for (const [before, after, count = 1] of next.durableObserverEdits.toReversed()) {
    assert.equal(reversed.split(after).length - 1, count); reversed = reversed.replaceAll(after, before);
  }
  assert.equal(reversed, original.generated); assert.equal(next.originalAcceptanceGatesByteExact, true);
  assert.ok(next.extraFiles.includes("scripts/lib/durable-native-memory-journal.mjs"));
  assert.ok(next.extraFiles.includes("scripts/lib/durable-native-failure-observer.mjs"));
  const proof = await verifyDurableControl(); assert.equal(proof.cleanup.runtimeRemoved, true);
});
test("new supervisor differs only by own identity and durable full target, retains hidden/detached/bounded behavior", async () => {
  const previous = await readFile(path.join(root, "scripts/launch-packet-cache-supervisor.mjs"), "utf8");
  const current = await readFile(path.join(root, "scripts/launch-durable-packet-cache-supervisor.mjs"), "utf8");
  assert.equal(current.replaceAll("scripts/launch-durable-packet-cache-supervisor.mjs", "scripts/launch-packet-cache-supervisor.mjs")
    .replaceAll("scripts/run-durable-packet-cache-original-full.mjs", "scripts/run-packet-cache-original-full.mjs"), previous);
});
