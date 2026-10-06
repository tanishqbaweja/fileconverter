import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { readFile } from "node:fs/promises";
import path from "node:path";
import test from "node:test";
import { ATTRIBUTION_LIMITS, startBoundedRendererAttribution } from "../scripts/lib/bounded-renderer-attribution.mjs";
import { makeRendererAttributionDriver } from "../scripts/lib/mpeg2-renderer-attribution-recipe.mjs";
const root = path.resolve(import.meta.dirname, ".."), read = file => readFile(path.join(root, file));
test("Actual blank prerequisite succeeds with bounded trace, no source/converter, cleanup and exact sources", async () => {
  const proof = JSON.parse(await read("evidence/renderer-attribution-prerequisite-2026-10-06.json"));
  assert.equal(proof.status, "completed-diagnostic"); assert.equal(proof.result.status, "completed-diagnostic");
  assert.equal(proof.result.trace.serializedBytes, 3173906); assert.equal(proof.result.trace.events, 746);
  assert.equal(proof.result.trace.overflow, false); assert.equal(proof.result.trace.dataLossOccurred, false);
  assert.equal(proof.result.allocatorSummary.length, 3); assert.equal(proof.result.realmRows.length, 19);
  assert.equal(proof.publicAcceptance, false); assert.equal(proof.completeChromiumMemoryAcceptance, false);
  assert.equal(proof.conversionSpeedAcceptance, false); assert.equal(proof.converterLoaded, false);
  assert.equal(proof.originalRead, false); assert.equal(proof.identicalOriginalFlags, true);
  for (const value of Object.values(proof.cleanup)) assert.equal(value, true);
  for (const [file, digest] of Object.entries(proof.sourcePins))
    assert.equal(createHash("sha256").update(await read(file)).digest("hex"), digest, file);
});
test("One changed diagnostic retains original gates and fixes startup prospectively without acceptance", async () => {
  const source = (await read("scripts/mpeg2-split-single-navigation-memory.mjs")).toString();
  const generated = makeRendererAttributionDriver(source, root, specifier => import.meta.resolve(specifier));
  assert.ok(generated.includes("const diagnosticOnly = true;"));
  assert.ok(generated.includes("minimumMs: 300000"));
  assert.ok(generated.includes("blankBaseline.privateBytes <= startupSettlement.earlyWindow.privateBytes"));
  assert.ok(generated.includes("assert.ok(run.incrementalPrivateMiB <= 250,"));
  assert.ok(generated.includes("const deadline = Date.now() + 90000;"));
  assert.ok(generated.includes("assert.equal(diagnosticOnly, false"));
  assert.ok(generated.includes("rendererAttributionResult = await rendererAttribution.stop()"));
  assert.ok(generated.includes("cancelBrowserConversionBeforeCleanup(page)"));
  assert.ok(generated.includes("await verifySource(); cleanup.protectedFixtureUnchanged = true"));
  assert.ok(generated.includes("const expectedSourceBytes = 2958573265"));
  for (const mutation of [source + "\n", source.replace("250", "251")])
    assert.throws(() => makeRendererAttributionDriver(mutation, root, specifier => import.meta.resolve(specifier)));
});
test("Private instrumentation caps output, dumps, pending requests and retention; no GC or heap-copy profiling", async () => {
  assert.equal(ATTRIBUTION_LIMITS.maximumDumps, 8); assert.equal(ATTRIBUTION_LIMITS.maximumRealmRows, 1024);
  assert.equal(ATTRIBUTION_LIMITS.realmIntervalMs, 100); assert.equal(ATTRIBUTION_LIMITS.chromiumBufferBytes, 4194304);
  assert.equal(ATTRIBUTION_LIMITS.maximumSerializedBytes, 16777216); assert.equal(ATTRIBUTION_LIMITS.ioReadBytes, 262144);
  const source = (await read("scripts/lib/bounded-renderer-attribution.mjs")).toString();
  assert.ok(source.includes("deterministic: false")); assert.ok(source.includes('recordMode: "recordUntilFull"'));
  assert.ok(source.includes('assert.equal(dumpPending, null'));
  assert.ok(source.includes('if (realmRows.length === ATTRIBUTION_LIMITS.maximumRealmRows)'));
  assert.ok(source.includes('dataLossOccurred !== false'));
  assert.ok(!/HeapProfiler|takeHeapSnapshot|collectGarbage/.test(source));
});
function syntheticSession({ loss = false, oversized = false, delayedDump = false } = {}) {
  let completed, resolveDump;
  const calls = [];
  const trace = { traceEvents: [
    { name: "GlobalMemoryDump", ph: "b", pid: 1, ts: 10, id2: { local: "a" }, args: { dump_guid: "g" } },
    { name: "periodic_interval", ph: "v", pid: 1, ts: 11, id: "ordinal", args: { dumps: { allocators: { malloc: { attrs: { size: { type: "scalar", units: "bytes", value: "10" } } } } } } },
    { name: "GlobalMemoryDump", ph: "e", pid: 1, ts: 12, id2: { local: "a" } },
  ] };
  return { calls, finishDump: () => resolveDump({ success: true, dumpGuid: "g" }),
    once: (_, fn) => { completed = fn; },
    async send(method) {
      calls.push(method);
      if (method === "Tracing.requestMemoryDump") return delayedDump
        ? new Promise(resolve => { resolveDump = resolve; }) : { success: true, dumpGuid: "g" };
      if (method === "Tracing.end") { completed({ stream: "owned", ...(loss === null ? {} : { dataLossOccurred: loss }) }); return {}; }
      if (method === "IO.read") return { data: oversized ? "x".repeat(262145) : JSON.stringify(trace), eof: true };
      return {};
    },
  };
}
const syntheticRealms = { sample: async () => ({ targetsAvailable: false, targets: null }) };
test("Missing trace-loss status cannot certify diagnostic success; unavailable realm data stays null", async () => {
  const session = syntheticSession({ loss: null }), probe = await startBoundedRendererAttribution(session, syntheticRealms);
  await probe.dump("synthetic"); const result = await probe.stop();
  assert.equal(result.status, "failed-diagnostic"); assert.equal(result.trace.dataLossOccurred, null);
  assert.equal(result.realmRows[0].value.targets, null);
  assert.equal(result.allocatorSummary[0].processes[0].allocators.malloc.size, 16);
  assert.equal(result.summedAllocatorTotal, null); assert.ok(session.calls.includes("IO.close"));
});
test("Attribution closes the stream even when a peer violates the fixed read-size cap", async () => {
  const session = syntheticSession({ oversized: true }), probe = await startBoundedRendererAttribution(session, syntheticRealms);
  await probe.dump("synthetic"); await assert.rejects(probe.stop(), /Bounded trace read/);
  assert.equal(session.calls.filter(method => method === "IO.close").length, 1);
});
test("A pending dump rejects a second request without growing the CDP queue", async () => {
  const session = syntheticSession({ delayedDump: true }), probe = await startBoundedRendererAttribution(session, syntheticRealms);
  const pending = probe.dump("synthetic"); await assert.rejects(probe.dump("not-enqueued"), /Only one outstanding/);
  assert.equal(session.calls.filter(method => method === "Tracing.requestMemoryDump").length, 1);
  session.finishDump(); await pending; const result = await probe.stop();
  assert.equal(result.status, "completed-diagnostic"); assert.equal(result.dumps.length, 1);
});
