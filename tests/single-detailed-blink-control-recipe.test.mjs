import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import path from "node:path";
import test from "node:test";
import { makeSingleDetailedBlinkControl } from "../scripts/lib/single-detailed-blink-control-recipe.mjs";
test("single-dump derivative actually removes allocation/burst observer, keeps cleanup and refuses baseline mutations", async () => {
  const root = path.resolve(import.meta.dirname, "..");
  const source = await readFile(path.join(root, "scripts/probe-native-burst-attribution.mjs"), "utf8");
  const control = makeSingleDetailedBlinkControl(source, root, "file:///approved/attribution.mjs");
  assert.equal(control.includes("new Uint8Array(40 * 1048576)"), false);
  assert.equal(control.includes("observer = await startBurstMemoryObserver("), false);
  assert.equal(control.match(/await attribution.dump\(/g)?.length, 1);
  assert.ok(control.includes("syntheticAllocationBytes: 0"));
  assert.ok(control.includes('assert.equal(trace.trace.dataLossOccurred, false)'));
  assert.ok(control.includes('assert.equal(trace.allocatorSummary.length, 1)'));
  assert.ok(control.includes('await runtime.close()'));
  assert.throws(() => makeSingleDetailedBlinkControl(source + "\n", root, "file:///approved/attribution.mjs"));
});
