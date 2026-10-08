import assert from "node:assert/strict";
import { createHash, randomUUID } from "node:crypto";
import { readFile, unlink } from "node:fs/promises";
import path from "node:path";
import test from "node:test";
import { gunzipSync } from "node:zlib";
import { createConversionJsAllocation } from "../scripts/lib/conversion-js-allocation.mjs";
const root = path.resolve(import.meta.dirname, ".."), sha = bytes => createHash("sha256").update(bytes).digest("hex");
const origin = "http://127.0.0.1:32100";
function setup() {
  const calls = [], routes = [];
  const value = () => ({ profile: { head: { id: 0, selfSize: 0,
    callFrame: { functionName: "(root)", scriptId: "0", url: "", lineNumber: -1, columnNumber: -1 }, children: [
      { id: 1, selfSize: 65536, callFrame: { functionName: "Ci", scriptId: "1", url: `${origin}/assets/ConverterApp-fixture.js`, lineNumber: 0, columnNumber: 0 }, children: [] }] },
  samples: [{ nodeId: 1, size: 65536, ordinal: 1 }] } });
  const cdp = { async send(method, settings) { calls.push({ method, settings }); return method.endsWith("startSampling") ? {} : value(); } };
  const context = { async route(matcher, handler) { routes.push({ matcher, handler }); }, async unroute() {} };
  return { calls, routes, cdp, context };
}
test("Real-growth profiler starts only after navigation, binds actual served bytes and saves five bounded records", async () => {
  const fixture = setup(), prefix = `test-js-${randomUUID()}`, owned = [];
  const controller = await createConversionJsAllocation(fixture.cdp,
    { directory: path.join(root, "outputs/reports"), prefix, context: fixture.context, origin });
  try {
    assert.equal(fixture.calls.length, 0, "Do not start heap sampling in the blank isolate before navigation");
    const body = Buffer.from("function Ci(){return 1;}"), route = fixture.routes[0];
    const url = `${origin}/assets/ConverterApp-fixture.js`;
    assert.equal(route.matcher(new URL(url)), true); assert.equal(route.matcher(new URL(`${origin}/test.mkv`)), false);
    await route.handler({ request: () => ({ url: () => url, method: () => "GET", postData: () => null }),
      fetch: async () => ({ status: () => 200, body: async () => body }),
      fulfill: async value => assert.deepEqual(value.body, body), abort: async () => assert.fail("Static fixture should not abort") });
    await controller.beforeConversion({ jobState: "idle", metrics: { outputBytes: 0 } });
    for (const outputBytes of [1048576, 8388608, 16777216]) await controller.progress({ jobState: "running", metrics: { outputBytes } });
    await controller.failureBeforeCancellation({ jobState: "running", metrics: { outputBytes: 20000000 } },
      { after: { sequence: 123, timestamp: "2026-10-08T13:00:00Z", privateBytes: 500000000 }, incrementalPrivateMiB: 251 });
    await controller.close(); const proof = controller.report();
    owned.push(...proof.records.map(row => row.archive.path));
    assert.deepEqual(proof.errors, []); assert.equal(proof.records.length, 5); assert.equal(proof.stopped, true);
    assert.equal(proof.records.at(-1).phase, "native-failure-before-cancel");
    assert.equal(proof.records.at(-1).state.jobState, "running");
    assert.equal(proof.servedScripts[0].sha256, sha(body)); assert.equal(proof.servedScripts[0].actualServedBytesCaptured, true);
    for (const record of proof.records) {
      const bytes = await readFile(record.archive.path), restored = gunzipSync(bytes, { maxOutputLength: 1048576 });
      assert.equal(sha(bytes), record.archive.sha256); assert.equal(sha(restored), record.archive.restoredSha256);
      assert.equal(JSON.parse(restored).bundleBindings[0].servedSha256, sha(body));
      assert.ok(restored.length <= 1048576);
    }
    assert.equal(proof.nativeAllocationCauseProven, false); assert.equal(proof.primaryMemoryAcceptance, false);
    assert.equal(proof.workersAllocationProfiled, false); assert.equal(proof.forcedGcUsed, false);
    await controller.progress({ jobState: "running", metrics: { outputBytes: 99999999 } });
    assert.equal(controller.report().records.length, 5);
  } finally { await controller.close(); for (const file of owned.length ? owned : controller.report().records.flatMap(row => row.archive?.path ? [row.archive.path] : [])) await unlink(file); }
});
test("Conversion allocation archives reject directories outside the exact repository reports location", async () => {
  const fixture = setup();
  await assert.rejects(createConversionJsAllocation(fixture.cdp, { directory: path.join(root, "work"),
    prefix: "test-invalid", context: fixture.context, origin }));
  assert.equal(fixture.calls.length, 0);
});
