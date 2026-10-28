import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";
import { build } from "esbuild";
const result = await build({ stdin: { contents: 'export { observeSvgExecutionResources } from "./lib/svg-execution-resources.ts";', loader: "ts", resolveDir: process.cwd() },
  bundle: true, platform: "node", format: "esm", write: false });
const { observeSvgExecutionResources: observe } = await import("data:text/javascript;base64," + Buffer.from(result.outputFiles[0].contents).toString("base64"));
const destination = { additionalWorkerCount: 1, sharedBufferBytes: 262144 + 4096 + 8 * 4 };

test("SVG accounts for actual destination metadata plus the distinct cancellation flag without allocating or retaining buffers", () => {
  const metrics = {}; observe(metrics, destination, 4, "opened");
  assert.equal(metrics.activeWorkerCount, 2); assert.equal(metrics.sharedArrayBufferBytes, 266276);
  assert.deepEqual(metrics.svgExecutionResources, { phase: "opened", cancellationBytes: 4, destinationSharedBytes: 266272,
    allocatedSharedBytes: 266276, peakAllocatedSharedBytes: 266276, destinationWorkerCount: 1, peakKnownWorkerCount: 2,
    sharedBytesMeaning: "allocated-for-job-not-garbage-collection-or-process-memory" });
  assert.ok(JSON.stringify(metrics).length < 1024);
});
test("successful close/abort retires the destination worker but never claims reachable SAB allocations were garbage-collected", () => {
  for (const phase of ["closed", "aborted"]) {
    const metrics = {}; observe(metrics, destination, 4, "opened"); observe(metrics, destination, 4, phase);
    assert.equal(metrics.activeWorkerCount, 1); assert.equal(metrics.sharedArrayBufferBytes, 266276);
    assert.equal(metrics.svgExecutionResources.destinationWorkerCount, 0);
    assert.equal(metrics.svgExecutionResources.peakKnownWorkerCount, 2);
    assert.equal(metrics.svgExecutionResources.peakAllocatedSharedBytes, 266276);
  }
});
test("failed abort reports unknown worker state rather than a false zero; allocation bookkeeping remains conservative", () => {
  const metrics = {}; observe(metrics, destination, 4, "opened"); observe(metrics, destination, 4, "abort-unverified");
  assert.equal(metrics.activeWorkerCount, undefined); assert.equal(metrics.svgExecutionResources.destinationWorkerCount, null);
  assert.equal(metrics.svgExecutionResources.peakKnownWorkerCount, 2); assert.equal(metrics.sharedArrayBufferBytes, 266276);
});
test("plain OPFS/asynchronous destination has no invented writer allocation; a real zero differs from an unknown worker", () => {
  for (const cancellationBytes of [0, 4]) {
    const metrics = {}; observe(metrics, {}, cancellationBytes, "opened");
    assert.equal(metrics.activeWorkerCount, 1); assert.equal(metrics.sharedArrayBufferBytes, cancellationBytes);
    observe(metrics, {}, cancellationBytes, "abort-unverified"); assert.equal(metrics.activeWorkerCount, 1);
    assert.equal(metrics.svgExecutionResources.destinationWorkerCount, 0);
  }
});
test("invalid metadata/foreign phases cannot produce misleading counters", () => {
  for (const fields of [{ sharedBufferBytes: NaN }, { sharedBufferBytes: -1 }, { additionalWorkerCount: 0.5 },
    { additionalWorkerCount: Number.MAX_SAFE_INTEGER }, { sharedBufferBytes: Number.MAX_SAFE_INTEGER }]) {
    assert.throws(() => observe({}, fields, 4, "opened"), RangeError);
  }
  assert.throws(() => observe({}, {}, 1, "opened"), RangeError);
  assert.throws(() => observe({}, {}, 0, "not-a-phase"), TypeError);
});
test("live production SVG wires open, confirmed close and guarded abort accounting without changing other engines", async () => {
  const source = await readFile("workers/conversion.worker.ts", "utf8");
  assert.match(source, /profileId === "svg-to-png"\) \{\s+observeSvgExecutionResources\(metrics, destination.writable, cancellationSignal\?\.byteLength \?\? 0, "opened"\)/);
  const opened = source.indexOf('observeSvgExecutionResources(metrics, destination.writable, cancellationSignal?.byteLength ?? 0, "opened")');
  assert.ok(opened > source.indexOf('destination = await openDestination('));
  assert.ok(opened < source.indexOf('emitProgress(jobId, "Destination opened"'), "First destination progress must include its real helper worker/buffers");
  assert.match(source, /await destination.writable.close\(\);\s+if \(profileId === "svg-to-png"\) \{\s+observeSvgExecutionResources\([\s\S]*?"closed"\)/);
  assert.match(source, /await destination\?\.writable.abort\(error\);\s+destinationAbortObserved = destination !== null/);
  assert.match(source, /destinationAbortObserved \? "aborted" : "abort-unverified"/);
});
