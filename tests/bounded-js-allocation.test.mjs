import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";
import { JS_ALLOCATION_SETTINGS, summarizeJsAllocation, startBoundedJsAllocation } from "../scripts/lib/bounded-js-allocation.mjs";
import { makeUiJsAllocationControl } from "../scripts/lib/ui-js-allocation-recipe.mjs";
const frame = (url = "http://localhost/assets/app.js") => ({ functionName: "allocate", scriptId: "1", url, lineNumber: 0, columnNumber: 17 });
const value = () => ({ profile: { head: { id: 0, selfSize: 0, callFrame: frame(""), children: [
  { id: 1, selfSize: 65536, callFrame: frame(), children: [] }] }, samples: [{ nodeId: 1, size: 65536, ordinal: 1 }] } });
test("JS allocations expose source locations but never claim exact live/native/primary memory", () => {
  const summary = summarizeJsAllocation(value());
  assert.equal(summary.nodeCount, 2); assert.equal(summary.sourceLocatedSelfBytes, 65536);
  assert.equal(summary.topCallsites[0].callFrame.columnNumber, 17);
  assert.equal(summary.includesNaturallyCollectedObjects, true);
  assert.equal(summary.exactLiveMemory, false); assert.equal(summary.nativeAllocationAttribution, false);
  assert.equal(summary.completeChromiumMemoryAcceptance, false);
});
test("JS allocation bounds and malformed/missing samples fail closed", () => {
  assert.throws(() => summarizeJsAllocation({ profile: null }));
  const invalid = value(); invalid.profile.samples[0].nodeId = 99;
  assert.throws(() => summarizeJsAllocation(invalid));
  const duplicate = value(); duplicate.profile.head.children.push(duplicate.profile.head.children[0]);
  assert.throws(() => summarizeJsAllocation(duplicate));
  const large = value(); large.padding = "x".repeat(524288);
  assert.throws(() => summarizeJsAllocation(large), /response cap/);
  const deep = value(); let node = deep.profile.head;
  for (let i = 2; i < 69; i++) { node.children = [{ id: i, selfSize: 0, callFrame: frame(), children: [] }]; node = node.children[0]; }
  deep.profile.samples = []; assert.throws(() => summarizeJsAllocation(deep));
});
test("JS sampler uses one pending command, five profiles and no forced GC", async () => {
  const calls = []; let release;
  const cdp = { async send(method, parameters) { calls.push({ method, parameters });
    if (method.endsWith("startSampling")) return {};
    if (method.endsWith("getSamplingProfile") && calls.length === 2) await new Promise(resolve => { release = resolve; });
    return value(); } };
  const sampler = await startBoundedJsAllocation(cdp);
  assert.deepEqual(calls[0].parameters, JS_ALLOCATION_SETTINGS);
  const first = sampler.sample("first");
  await assert.rejects(sampler.sample("concurrent"), /one allocation-profiler command/);
  release(); await first;
  for (let i = 1; i < 5; i++) await sampler.sample(`phase-${i}`);
  await assert.rejects(sampler.sample("sixth"));
  await sampler.stop(); await assert.rejects(sampler.sample("stopped"));
  assert.equal(calls.length, 7);
  assert.ok(calls.every(call => /^HeapProfiler\.(?:startSampling|getSamplingProfile|stopSampling)$/.test(call.method)));
});
test("New recipe preserves exact historical workflow, protected source and bounded cleanup", async () => {
  const source = await readFile(new URL("../scripts/diagnose-ui-native-allocation.mjs", import.meta.url), "utf8");
  const generated = makeUiJsAllocationControl(source, "H:/Github Repositories/fileconverter");
  assert.ok(generated.includes('assert.equal(state.jobState, "idle"'));
  assert.ok(generated.includes("i < 60")); assert.ok(generated.includes("await verifySource()"));
  assert.ok(generated.includes('assert.equal(host.safeToStart, true'));
  assert.ok(generated.includes("heapSampler.sample(phase)"));
  assert.doesNotMatch(generated, /Memory\.(?:startSampling|getSamplingProfile|stopSampling)|convert-button|setJobState/);
  assert.throws(() => makeUiJsAllocationControl(source + "\n", "H:/Github Repositories/fileconverter"));
});
