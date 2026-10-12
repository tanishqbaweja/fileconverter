import assert from "node:assert/strict";
import test from "node:test";
import { createBoundedInputReadCapture } from "../scripts/lib/bounded-input-read-capture.mjs";

test("success delegates once with exact buffer/offset/result and emits nothing", async () => {
  const buffer = new Uint8Array(65536), rows = []; let calls = 0;
  const capture = createBoundedInputReadCapture({ inputSize: 2958573265, emit: row => rows.push(row),
    read: (offset, destination) => { calls++; assert.equal(offset, 2147483649); assert.equal(destination, buffer); destination[0] = 17; return 31; } });
  assert.equal(await capture.read(2147483649, buffer), 31); assert.equal(buffer[0], 17); assert.equal(calls, 1);
  assert.deepEqual(rows, []); assert.equal(capture.metrics().failedReads, 0);
});
test("captures bounded scalar error identity and exact >2GiB request, rethrows original without retries", async () => {
  const error = new DOMException("network error", "NotReadableError"), rows = []; let calls = 0;
  const capture = createBoundedInputReadCapture({ inputSize: 2958573265, emit: row => rows.push(row), read: async () => { calls++; throw error; } });
  for (let i = 0; i < 12; i++) await assert.rejects(capture.read(2186655938, new Uint8Array(65536)), value => value === error);
  assert.equal(calls, 12); assert.equal(rows.length, 2);
  assert.equal(rows[0].exceptionName, "NotReadableError"); assert.equal(rows[0].exceptionCode, error.code);
  assert.equal(rows[0].messageClass, "network-error"); assert.equal(rows[0].offset, 2186655938);
  assert.equal(rows[0].requestedBytes, 65536); assert.equal(rows[0].inputSize, 2958573265);
  assert.deepEqual(capture.metrics(), { failedReads: 12, emittedRecords: 2, maximumRecords: 2, maximumStackLocations: 8, retainsInput: false, retries: 0 });
});
test("redacts arbitrary filenames, payload, messages, causes and stack functions/URLs with bounded known source locations", async () => {
  const secret = "personal-video-name-and-content", error = new Error(secret, { cause: new Error(secret) }), rows = [];
  error.name = secret; error.code = secret;
  error.stack = Array.from({ length: 100 }, () => `at ${secret} (http://localhost/engines/remux/within-direct.mjs:42:7)\nat ${secret} (http://localhost/${secret}:9:2)`).join("\n");
  const capture = createBoundedInputReadCapture({ inputSize: 100, emit: row => rows.push(row), read: () => { throw error; } });
  await assert.rejects(capture.read(0, new Uint8Array(16)), value => value === error);
  assert.equal(rows[0].exceptionName, null); assert.equal(rows[0].exceptionCode, null); assert.equal(rows[0].messageClass, null);
  assert.equal(rows[0].stackLocations.length, 8); assert.deepEqual(rows[0].stackLocations[0], { source: "decoder-module", line: 42, column: 7 });
  assert.ok(!JSON.stringify(rows).includes(secret)); assert.ok(JSON.stringify(rows).length < 2048);
});
test("hostile getters, thrown primitives and broken emitters cannot mask failure or exceed record cap", async () => {
  const error = new Proxy({}, { get() { throw new Error("hostile getter"); } }); let emissions = 0;
  const capture = createBoundedInputReadCapture({ inputSize: 10, emit: () => { emissions++; throw new Error("sink failure"); }, read: () => { throw error; } });
  for (let i = 0; i < 5; i++) await capture.read(-1, new Uint8Array(1)).then(() => assert.fail("Expected rejection"), value => assert.equal(value === error, true));
  assert.equal(emissions, 2); assert.equal(capture.metrics().failedReads, 5);
  const primitive = createBoundedInputReadCapture({ inputSize: 1, emit: row => { assert.equal(row.exceptionName, null); }, read: () => { throw null; } });
  await assert.rejects(primitive.read(0, new Uint8Array(1)), value => value === null);
});
test("cancellation exception propagates unchanged; serialized helper is browser-self-contained", async () => {
  const browserFactory = (0, eval)(`(${createBoundedInputReadCapture.toString()})`), error = new DOMException("private name", "AbortError"), rows = [];
  const capture = browserFactory({ inputSize: 0, emit: row => rows.push(row), read: () => { throw error; } });
  await assert.rejects(capture.read(0, new Uint8Array(0)), value => value === error);
  assert.equal(rows[0].exceptionName, "AbortError"); assert.equal(rows[0].messageClass, null);
  assert.throws(() => browserFactory({ inputSize: -1, emit() {}, read() {} }), TypeError);
});
