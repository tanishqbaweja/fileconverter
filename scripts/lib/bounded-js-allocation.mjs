// JavaScript allocation estimates only: never native/Blink/Wasm or private memory.
import assert from "node:assert/strict";

export const JS_ALLOCATION_LIMITS = Object.freeze({ responseBytes: 524288, nodes: 4096,
  samples: 4096, depth: 64, callsites: 32, profiles: 5 });
export const JS_ALLOCATION_SETTINGS = Object.freeze({ samplingInterval: 65536, stackDepth: 64,
  includeObjectsCollectedByMajorGC: true, includeObjectsCollectedByMinorGC: true });

export function summarizeJsAllocation(value) {
  const serializedBytes = Buffer.byteLength(JSON.stringify(value));
  assert.ok(serializedBytes <= JS_ALLOCATION_LIMITS.responseBytes, "JS allocation response cap");
  const profile = value?.profile;
  assert.ok(profile?.head && Array.isArray(profile.samples), "Missing JS allocation profile");
  assert.ok(profile.samples.length <= JS_ALLOCATION_LIMITS.samples, "JS allocation sample cap");
  const pending = [{ node: profile.head, depth: 0, stack: [] }], ids = new Set(), callsites = new Map();
  let estimatedSelfBytes = 0, sourceLocatedSelfBytes = 0;
  while (pending.length) {
    const { node, depth, stack } = pending.pop();
    assert.ok(depth <= JS_ALLOCATION_LIMITS.depth && ids.size < JS_ALLOCATION_LIMITS.nodes);
    assert.ok(Number.isSafeInteger(node.id) && node.id >= 0 && !ids.has(node.id), "Unique allocation node id");
    ids.add(node.id);
    assert.ok(Number.isSafeInteger(node.selfSize) && node.selfSize >= 0 && Array.isArray(node.children));
    assert.ok(node.children.length <= JS_ALLOCATION_LIMITS.nodes);
    const frame = node.callFrame;
    assert.ok(frame && typeof frame.functionName === "string" && frame.functionName.length <= 512);
    assert.ok(typeof frame.url === "string" && frame.url.length <= 2048 && typeof frame.scriptId === "string");
    assert.ok(Number.isSafeInteger(frame.lineNumber) && Number.isSafeInteger(frame.columnNumber));
    const nextStack = [...stack, frame];
    estimatedSelfBytes += node.selfSize;
    if (frame.url && frame.lineNumber >= 0 && frame.columnNumber >= 0) sourceLocatedSelfBytes += node.selfSize;
    if (node.selfSize) {
      const key = JSON.stringify(frame);
      const row = callsites.get(key) ?? { callFrame: frame, estimatedSelfBytes: 0, nodeCount: 0,
        exampleStack: nextStack.slice(-16) };
      row.estimatedSelfBytes += node.selfSize; row.nodeCount++; callsites.set(key, row);
    }
    assert.ok(ids.size + pending.length + node.children.length <= JS_ALLOCATION_LIMITS.nodes, "JS allocation tree cap");
    for (const child of node.children) pending.push({ node: child, depth: depth + 1, stack: nextStack });
  }
  const ordinals = new Set(); let sampleBytes = 0;
  for (const sample of profile.samples) {
    assert.ok(Number.isSafeInteger(sample.size) && sample.size > 0 && ids.has(sample.nodeId));
    assert.ok(Number.isSafeInteger(sample.ordinal) && sample.ordinal >= 0 && !ordinals.has(sample.ordinal));
    ordinals.add(sample.ordinal); sampleBytes += sample.size;
  }
  assert.ok(Number.isSafeInteger(estimatedSelfBytes) && Number.isSafeInteger(sampleBytes));
  const sorted = [...callsites.values()].sort((a, b) => b.estimatedSelfBytes - a.estimatedSelfBytes);
  return { serializedBytes, nodeCount: ids.size, sampleCount: profile.samples.length, sampleBytes,
    estimatedSelfBytes, sourceLocatedSelfBytes, topCallsites: sorted.slice(0, JS_ALLOCATION_LIMITS.callsites),
    omittedCallsiteCount: Math.max(0, sorted.length - JS_ALLOCATION_LIMITS.callsites),
    includesNaturallyCollectedObjects: true, exactLiveMemory: false, nativeAllocationAttribution: false,
    completeChromiumMemoryAcceptance: false };
}

export async function startBoundedJsAllocation(cdp) {
  let running = false, pending = false, count = 0;
  const send = async (method, params) => {
    assert.equal(pending, false, "Only one allocation-profiler command in flight");
    pending = true;
    try { return await cdp.send(method, params); } finally { pending = false; }
  };
  await send("HeapProfiler.startSampling", JS_ALLOCATION_SETTINGS); running = true;
  return {
    async sample(phase) {
      assert.ok(running && count < JS_ALLOCATION_LIMITS.profiles);
      const value = await send("HeapProfiler.getSamplingProfile");
      const summary = summarizeJsAllocation(value); count++;
      return { phase, ...value, summary };
    },
    async stop() {
      assert.ok(running);
      const value = await send("HeapProfiler.stopSampling"); running = false;
      return summarizeJsAllocation(value);
    },
  };
}
