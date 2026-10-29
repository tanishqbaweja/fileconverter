import assert from "node:assert/strict";
import test from "node:test";
import { frameworkProbeFetch } from "../scripts/lib/framework-probe-fetch.mjs";
test("isolated diagnostic allows bounded embedded Wasm decoding, never external or other data fetches",async()=>{
  let calls=0;const guard=frameworkProbeFetch(async url=>{calls++;return {url};});
  const embedded="data:application/octet-stream;base64,AGFzbQEAAAA=";
  assert.equal((await guard.fetch(embedded)).url,embedded);assert.equal(calls,1);
  assert.equal(guard.proof.embeddedWasmDataDecodes,1);assert.equal(guard.proof.maximumEmbeddedDataUrlBytes,embedded.length);
  for(const url of ["https://example.invalid/font","file:///font","data:text/html,test","data:application/octet-stream;base64,"+"x".repeat(4*1048576)])
    await assert.rejects(guard.fetch(url),/must not fetch external/);
  assert.equal(calls,1);assert.equal(guard.proof.blockedRequests.length,4);
  assert.ok(guard.proof.blockedRequests.every(value=>value.length<=256));
});
