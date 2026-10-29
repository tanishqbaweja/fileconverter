import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { createHash } from "node:crypto";
import test from "node:test";
import { decodePreCiRuntimeInput, readPreCiRuntimeInput } from "./helpers/pre-ci-runtime-inputs.mjs";
const sha = bytes => createHash("sha256").update(bytes).digest("hex");
const archive = JSON.parse(await readFile(new URL("../fixtures/source/pre-ci-runtime-2026-10-29.json", import.meta.url)));

test("historical worker preserves exact mixed Windows bytes; normalized source is independently pinned, not live acceptance", async () => {
  const bytes = await readPreCiRuntimeInput("worker/index.ts");
  assert.equal(bytes.length, 2036); assert.equal((bytes.toString().match(/\r\n/g) ?? []).length, 7);
  const lf = Buffer.from(bytes.toString().replace(/\r\n/g, "\n"));
  assert.equal(sha(lf), "427c980ca2d22a309a355f1cb9b1a3fadfb5cecb86cc1d3071530d8117e17c30");
  assert.equal(sha(bytes), "e43e89df0db0146e75d8a71123e4dd08881ed63dfb4b7190cf5a7bdf671420ee");
  const live = await readFile("worker/index.ts");
  assert.equal(sha(Buffer.from(live.toString().replace(/\r\n/g, "\n"))), sha(lf));
});

test("prior CI bytes match original receipts while the changed live workflow is not mislabelled executed historical source", async () => {
  const old = await readPreCiRuntimeInput(".github/workflows/ci.yml"), live = await readFile(".github/workflows/ci.yml");
  assert.equal(sha(old), "c60872fd9264e255ba8b8a629e7e2cf4b8d798bf5c1968dc5a1880bb54bf7a47");
  assert.notEqual(sha(live), sha(old));
  assert.doesNotMatch(old.toString(), /ci-owned-runtime/); assert.match(live.toString(), /ci-owned-runtime/);
  const ordinary = "scripts/lib/owned-runtime-scratch.mjs";
  assert.deepEqual(await readPreCiRuntimeInput(ordinary), await readFile(ordinary));
});

test("historical source decoding refuses unknown paths, changed commit, bytes, pins and compressed payload", () => {
  assert.throws(() => decodePreCiRuntimeInput("test.mkv", archive));
  for (const change of [
    value => { value.sourceCommit = "a".repeat(40); },
    value => { value.files["worker/index.ts"].bytes++; },
    value => { value.files["worker/index.ts"].sha256 = "a".repeat(64); },
    value => { value.files["worker/index.ts"].gitBlobSha256 = "b".repeat(64); },
    value => { value.files["worker/index.ts"].gzipBase64 = Buffer.from("invalid").toString("base64"); },
  ]) { const copy = structuredClone(archive); change(copy); assert.throws(() => decodePreCiRuntimeInput("worker/index.ts", copy)); }
});
