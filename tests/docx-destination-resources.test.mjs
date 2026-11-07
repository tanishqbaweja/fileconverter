import assert from "node:assert/strict";
import { test } from "node:test";
import { readFile } from "node:fs/promises";
const source = await readFile("workers/conversion.worker.ts", "utf8");
const begin = source.indexOf('    } else if (profileId === "docx-to-txt" || profileId === "docx-to-html") {');
const end = source.indexOf("      const convertDocx =", begin);
assert.ok(begin > 0 && end > begin);
// Execute the actual worker's destination observation fragment, not a copied
// formula or a native conversion. Real-browser direct evidence remains required.
const observe = new Function("metrics", "destination", "cancellationSignal",
  source.slice(source.indexOf("      const documentDestination =", begin), end));
test("actual DOCX branch counts the direct writer worker and all three shared buffers", () => {
  const metrics = { activeWorkerCount: 1, sharedArrayBufferBytes: 0 };
  observe(metrics, { writable: { additionalWorkerCount: 1, sharedBufferBytes: 266272 } }, null);
  assert.equal(metrics.activeWorkerCount, 2); assert.equal(metrics.sharedArrayBufferBytes, 266272);
});
test("DOCX OPFS without a direct worker still correctly records one worker and zero SAB", () => {
  const metrics = { activeWorkerCount: 1, sharedArrayBufferBytes: 0 };
  observe(metrics, { writable: {} }, null);
  assert.deepEqual(metrics, { activeWorkerCount: 1, sharedArrayBufferBytes: 0 });
});
test("destination observation includes an actually supplied cancellation buffer without double counting repeated observations", () => {
  const metrics = { activeWorkerCount: 1, sharedArrayBufferBytes: 4 }, destination = { writable: { additionalWorkerCount: 1, sharedBufferBytes: 266272 } };
  observe(metrics, destination, { byteLength: 4 }); observe(metrics, destination, { byteLength: 4 });
  assert.deepEqual(metrics, { activeWorkerCount: 2, sharedArrayBufferBytes: 266276 });
});
