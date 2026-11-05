// Private static-asset substitution only. Never serves input/output/media data.
import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { createReadStream } from "node:fs";
import { lstat, readFile, realpath } from "node:fs/promises";
import path from "node:path";
const hashFile = async file => { const hash = createHash("sha256");
  for await (const bytes of createReadStream(file, { highWaterMark: 262144 })) hash.update(bytes); return hash.digest("hex"); };
export async function loadVp9DurationCpuAssets(root, runId) {
  assert.match(String(runId), /^\d{8,14}$/);
  const receiptFile = path.join(root, `evidence/2026-11-05-vp9-duration-native-${runId}.json`);
  const receiptInfo = await lstat(receiptFile);
  assert.ok(receiptInfo.isFile() && !receiptInfo.isSymbolicLink() && receiptInfo.size <= 2097152);
  assert.equal(await realpath(receiptFile), receiptFile);
  const receipt = JSON.parse(await readFile(receiptFile));
  assert.equal(receipt.runId, Number(runId)); assert.equal(receipt.publicAcceptance, false); assert.equal(receipt.publicAssetReplacement, false);
  assert.ok(["private-vp9-packet-duration", "private-vp9-stream-duration"].includes(receipt.nativeContract.engine));
  const target = path.join(root, `work/vp9-duration-input-${runId}`);
  assert.equal(path.resolve(root, receipt.retainedDirectory), target); assert.equal(await realpath(target), target);
  const files = {};
  for (const name of ["within-remux.mjs", "within-remux.wasm"]) {
    const file = path.join(target, name), info = await lstat(file), pin = receipt.nativeContract.artifacts[name];
    assert.ok(info.isFile() && !info.isSymbolicLink()); assert.equal(await realpath(file), file);
    assert.ok(info.size > 0 && info.size <= (name.endsWith(".wasm") ? 16777216 : 2097152));
    assert.equal(info.size, pin.bytes); assert.equal(await hashFile(file), pin.sha256);
    files[name] = { path: file, ...pin };
  }
  return { runId: Number(runId), sourceHead: receipt.head, files, publicAssetReplacement: false };
}
export function createVp9DurationAssetResponder(origin, assets) {
  assert.equal(new URL(origin).origin, origin);
  const served = { javascript: 0, wasm: 0 }; let headFetches = 0;
  return {
    report: () => ({ runId: assets.runId, sourceHead: assets.sourceHead, served,
      files: Object.fromEntries(Object.entries(assets.files).map(([name, file]) => [name, { bytes: file.bytes, sha256: file.sha256 }])),
      publicAssetReplacement: false, cachePolicyChanged: false, securityCacheAndMimeHeadersPreserved: true,
      representationHeadersRecomputed: true }),
    async respond(route) {
      const request = route.request(), url = new URL(request.url());
      if (url.origin !== origin || !["GET", "HEAD"].includes(request.method())) return false;
      const name = url.pathname === "/engines/remux/within-remux.mjs" ? "within-remux.mjs" :
        url.pathname === "/engines/remux/within-remux.wasm" ? "within-remux.wasm" : null;
      if (!name) return false;
      assert.ok(++headFetches <= 16, "Bound private static metadata requests");
      const asset = assets.files[name], head = await route.fetch({ method: "HEAD", maxRedirects: 0, timeout: 10000 });
      try {
        assert.equal(head.status(), 200);
        const headers = Object.fromEntries(Object.entries(head.headers()).filter(([key]) =>
          !["content-length", "content-encoding", "etag", "last-modified", "transfer-encoding", "connection", "keep-alive"].includes(key.toLowerCase())));
        headers.etag = '"' + asset.sha256 + '"'; // New static bytes, not the old validator.
        await route.fulfill({ status: 200, headers, path: asset.path });
        served[name.endsWith(".wasm") ? "wasm" : "javascript"]++;
        return true;
      } finally { await head.dispose(); }
    },
  };
}
