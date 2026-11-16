import assert from "node:assert/strict";
import test from "node:test";
import { createHash } from "node:crypto";
import { readFile } from "node:fs/promises";
import { verifyProductionWorkerBinding } from "../scripts/lib/production-worker-binding.mjs";
const bytes = Buffer.from("immutable-built-application-worker"), sha = b => createHash("sha256").update(b).digest("hex");
const headers = { "cross-origin-embedder-policy": "require-corp", "cross-origin-resource-policy": "same-origin",
  "cross-origin-opener-policy": "same-origin", "content-security-policy": "script-src 'self' 'wasm-unsafe-eval'" };
const options = { baseURL: "http://127.0.0.1:43123", asset: "/assets/conversion.worker-qualified.js", expectedBytes: bytes.length, expectedSha256: sha(bytes) };
const response = (body = bytes, changes = {}) => new Response(new ReadableStream({ start(c) { c.enqueue(body.subarray(0, 5)); c.enqueue(body.subarray(5)); c.close(); } }), { headers: { ...headers, ...changes } });
test("read-only static-code proof binds every served byte and security header without browser-worker override or application patch", async () => {
  const r = await verifyProductionWorkerBinding({ ...options, fetchAsset: async (url, init) => {
    assert.equal(url, options.baseURL + options.asset); assert.equal(init.method, "GET"); assert.equal(init.redirect, "error"); assert.ok(init.signal instanceof AbortSignal); return response();
  } });
  assert.equal(r.sha256, options.expectedSha256); assert.equal(r.bytes, bytes.length); assert.ok(r.maximumReadBytes <= 262144);
  assert.equal(r.staticCodeOnly, true); assert.equal(r.browserWorkerResponseOverridden, false); assert.equal(r.applicationSourcesPatched, false);
});
test("changed worker bytes, truncated/oversized code and wrong response security cannot masquerade as unchanged production code", async () => {
  for (const fetchAsset of [async () => response(Buffer.from("mutated-built-application-worker!")),
    async () => response(bytes.subarray(1)), async () => response(Buffer.concat([bytes, Buffer.from("extra")])),
    async () => response(bytes, { "cross-origin-embedder-policy": "unsafe-none" }),
    async () => response(bytes, { "cross-origin-resource-policy": "cross-origin" }),
    async () => response(bytes, { "cross-origin-opener-policy": "unsafe-none" }),
    async () => response(bytes, { "content-security-policy": "script-src *" }),
    async () => new Response("not found", { status: 404 }),
  ]) await assert.rejects(verifyProductionWorkerBinding({ ...options, fetchAsset }));
});
test("nonlocal origins, wrong asset namespace and unbounded extents rejected before a request", async () => {
  let requests = 0; const fetchAsset = async () => { requests++; return response(); };
  for (const changed of [{ baseURL: "https://external.invalid" }, { baseURL: "http://127.0.0.1:43123/?filename=user" },
    { asset: "/engines/untrusted.js" }, { expectedBytes: 1048577 }, { expectedSha256: "invalid" },
  ]) await assert.rejects(verifyProductionWorkerBinding({ ...options, ...changed, fetchAsset }));
  assert.equal(requests, 0);
});
test("native-only staged integration chooses unmodified compiled worker and existing finite loop validator, preserving all fidelity, memory and real scratch/copy checks", async () => {
  const source = await readFile("scripts/qualify-mkv-direct-reuse.mjs", "utf8");
  assert.match(source, /headerStagedIntegration = process.argv\[2\] === "--hevc-header-parser-production-staged"/);
  assert.match(source, /assert.ok\(staged && !overlay\)/); assert.match(source, /result.productionWorkerBinding = await verifyProductionWorkerBinding/);
  assert.match(source, /await arm\(headerStagedIntegration \? "edit-list" : "reuse", created.file/);
  assert.match(source, /headerStagedIntegration \? row.metrics.outputBytes : 0/);
  assert.match(source, /maxScratchReadChunkBytes <= 524288/); assert.match(source, /maxScratchWriteChunkBytes <= 524288/);
  assert.match(source, /Unmodified staged writer changed EVERY-byte-qualified current-core output/);
  assert.match(source, /passed-unmodified-production-staged-header-core-not-public-or-scale-acceptance/);
  assert.match(source, /if \(staged\) \{ assert.equal\(result.workerResponses, 0\)/);
  assert.match(source, /report.peakLimitMiB/); assert.match(source, /row.validation.candidateGate.passed/);
});
