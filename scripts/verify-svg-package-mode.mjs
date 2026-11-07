// Verifies the actual static asset directory, not just the route selector.
import "./lib/hidden-unit-subprocesses.mjs";
import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { createReadStream } from "node:fs";
import { lstat, readFile, readdir } from "node:fs/promises";
import { createServer } from "node:net";
import path from "node:path";
import { createOwnedRuntimeScratch } from "./lib/owned-runtime-scratch.mjs";
import { startOwnedProductionTestServer } from "./lib/owned-production-test-server.mjs";

const [mode, probe] = process.argv.slice(2);
assert.ok(["release", "qualification"].includes(mode) && (probe === undefined || probe === "--probe") && process.argv.length <= 4);
const root = path.resolve(import.meta.dirname, ".."), assets = path.join(root, "dist/client");
const config = JSON.parse(await readFile(path.join(root, "dist/server/wrangler.json"), "utf8"));
assert.deepEqual(config.assets, { binding: "ASSETS", run_worker_first: true, directory: "../client" });
async function engineTree(directory, excludeSvg) {
  const files = {};
  let entries = 0;
  async function walk(current, prefix = "", depth = 0) {
    assert.ok(depth <= 4);
    for (const entry of await readdir(current, { withFileTypes: true })) {
      assert.ok(++entries <= 256 && !entry.isSymbolicLink());
      const relative = prefix + entry.name;
      if (excludeSvg && relative === "svg") continue;
      const resolved = path.join(current, entry.name);
      if (entry.isDirectory()) await walk(resolved, relative + "/", depth + 1);
      else {
        assert.ok(entry.isFile());
        const hash = createHash("sha256");
        let bytes = 0;
        for await (const chunk of createReadStream(resolved, { highWaterMark: 262144 })) {
          bytes += chunk.length; assert.ok(bytes <= 32 * 1024 * 1024); hash.update(chunk);
        }
        files[relative] = { bytes, sha256: hash.digest("hex") };
      }
    }
  }
  await walk(directory);
  return files;
}
const expected = await engineTree(path.join(root, "public/engines"), mode === "release");
const actual = await engineTree(path.join(assets, "engines"), false);
assert.deepEqual(actual, expected, "The built engine tree must match the exact mode's allowed source bytes");
const manifest = JSON.parse(await readFile(path.join(root, "public/engines/svg/build-manifest.json"), "utf8"));
const result = { mode, staticRoot: "dist/client", workerFirst: true, engineFiles: Object.keys(actual).length,
  wasmFiles: Object.keys(actual).filter(file => file.endsWith(".wasm")).length,
  packagedSvg: actual["svg/resvg.wasm"] ?? null, nativeEngineFilesMatched: Object.keys(actual).filter(file => !file.startsWith("svg/")).length };
if (mode === "qualification") assert.deepEqual(result.packagedSvg, { bytes: manifest.wasmBytes, sha256: manifest.wasmSha256 });
else {
  assert.equal(result.packagedSvg, null);
  await assert.rejects(lstat(path.join(assets, "engines/svg")), { code: "ENOENT" });
}
if (probe) {
  const runtime = await createOwnedRuntimeScratch("svg-package-probe-");
  let server;
  try {
    const port = await new Promise((resolve, reject) => {
      const socket = createServer(); socket.once("error", reject);
      socket.listen(0, "127.0.0.1", () => { const port = socket.address().port; socket.close(error => error ? reject(error) : resolve(port)); });
    });
    server = await startOwnedProductionTestServer({ root, directory: runtime.directory,
      env: { ...runtime.env, WRANGLER_SEND_METRICS: "false" }, port });
    result.probes = [];
    for (const asset of ["resvg.wasm", "build-manifest.json"]) {
      for (const method of ["GET", "HEAD"]) {
        const response = await fetch(server.baseURL + "/engines/svg/" + asset + "?test=1", {
          method, redirect: "manual", signal: AbortSignal.timeout(10000),
        });
        assert.equal(response.status, mode === "qualification" ? 200 : 404);
        assert.equal(response.headers.get("cache-control"), "no-store");
        assert.equal(response.headers.get("cross-origin-embedder-policy"), "require-corp");
        let bytes = 0;
        const digest = createHash("sha256");
        if (response.body) for await (const chunk of response.body) {
          bytes += chunk.length; assert.ok(bytes <= manifest.wasmBytes); digest.update(chunk);
        }
        const sha256 = digest.digest("hex");
        if (mode === "qualification" && method === "GET") assert.deepEqual({ bytes, sha256 }, actual["svg/" + asset]);
        else assert.equal(bytes, 0);
        result.probes.push({ asset, method, status: response.status, bytes, sha256, cacheControl: "no-store" });
      }
    }
  } finally {
    if (server) result.serverExited = (await server.close()).ownedRootAbsent;
    await runtime.close(); result.scratchRemoved = true;
  }
}
console.log(JSON.stringify(result));
