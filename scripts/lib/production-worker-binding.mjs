// Read-only application-code proof, never selected file data or a conversion.
import assert from "node:assert/strict";
import { createHash } from "node:crypto";
export async function verifyProductionWorkerBinding({ baseURL, asset, expectedBytes, expectedSha256, fetchAsset = fetch }) {
  const origin = new URL(baseURL);
  assert.equal(origin.protocol, "http:"); assert.equal(origin.hostname, "127.0.0.1"); assert.ok(origin.port);
  assert.equal(origin.username, ""); assert.equal(origin.password, ""); assert.equal(origin.search, ""); assert.equal(origin.hash, "");
  assert.match(asset, /^\/assets\/conversion\.worker-[\w-]+\.js$/);
  assert.ok(Number.isSafeInteger(expectedBytes) && expectedBytes > 0 && expectedBytes <= 1048576);
  assert.match(expectedSha256, /^[a-f0-9]{64}$/);
  const response = await fetchAsset(new URL(asset, origin).href, { method: "GET", redirect: "error", signal: AbortSignal.timeout(10000) });
  try {
  assert.equal(response.status, 200); assert.ok(response.body);
  assert.equal(response.headers.get("cross-origin-embedder-policy"), "require-corp");
  assert.equal(response.headers.get("cross-origin-resource-policy"), "same-origin");
  assert.equal(response.headers.get("cross-origin-opener-policy"), "same-origin");
  assert.match(response.headers.get("content-security-policy") ?? "", /wasm-unsafe-eval/);
  const hash = createHash("sha256"); let bytes = 0, maximumReadBytes = 0;
  for await (const chunk of response.body) {
    assert.ok(chunk instanceof Uint8Array && chunk.byteLength <= 262144); bytes += chunk.byteLength;
    assert.ok(bytes <= expectedBytes, "Server worker exceeded exact built code extent"); hash.update(chunk); maximumReadBytes = Math.max(maximumReadBytes, chunk.byteLength);
  }
  assert.equal(bytes, expectedBytes); assert.equal(hash.digest("hex"), expectedSha256);
  return { status: "verified-exact-built-production-worker-served-with-security-headers", bytes, sha256: expectedSha256, maximumReadBytes,
    staticCodeOnly: true, browserWorkerResponseOverridden: false, applicationSourcesPatched: false };
  } finally { await response.body?.cancel().catch(() => {}); }
}
