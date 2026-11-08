import assert from "node:assert/strict";
import { test } from "node:test";
import { readFile } from "node:fs/promises";
import { transform } from "esbuild";
const source = await readFile("workers/conversion.worker.ts", "utf8");
const begin = source.indexOf('    } else if (profileId === "docx-to-txt" || profileId === "docx-to-html") {');
const end = source.indexOf("      const convertDocx =", begin);
assert.ok(begin > 0 && end > begin);
// Execute the actual worker's destination observation fragment, not a copied
// formula or a native conversion. Real-browser direct evidence remains required.
const fragment = source.slice(source.indexOf("      const documentDestination =", begin), end);
const { code } = await transform(`function observe(metrics, destination, cancellationSignal, profileId) {
${fragment}
return documentAppendDestination;
}`, { loader: "ts", target: "esnext" });
const observe = new Function(`${code}\nreturn observe;`)();
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

test("after a positioned patch, the actual DOCX HTML worker resumes at its acknowledged extent; TXT writer is unchanged", async () => {
  const operations = [], metrics = { outputBytes: 65536 };
  const writable = { async write(data) { operations.push(data); } };
  const append = observe(metrics, { writable }, null, "docx-to-html");
  const first = new Uint8Array([1, 2, 3]), second = new Uint8Array([4]);
  await append.write(first);
  const patch = { type: "write", position: 564, data: new Uint8Array(5) };
  await writable.write(patch);
  metrics.outputBytes += first.length;
  await append.write(second);
  assert.deepEqual(operations, [
    { type: "write", position: 65536, data: first }, patch,
    { type: "write", position: 65539, data: second },
  ]);
  assert.equal(observe(metrics, { writable }, null, "docx-to-txt"), writable);
});
