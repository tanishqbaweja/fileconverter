// Real built-server static delivery smoke. No browser or media conversion.
import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { appendFile, cp, lstat, mkdir, readFile, readdir, realpath, writeFile } from "node:fs/promises";
import { createServer } from "node:net";
import path from "node:path";
import { loadQualifiedHeaderNativeCache } from "./lib/mkv-header-native-cache.mjs";
import { createOwnedRuntimeScratch } from "./lib/owned-runtime-scratch.mjs";
import { startOwnedProductionTestServer } from "./lib/owned-production-test-server.mjs";
import { privateMkvHeaderPackageLayout, assertExactMkvHeaderArtifact } from "./verify-mkv-hevc-header-reproduction.mjs";
import { verifyProductionWorkerBinding } from "./lib/production-worker-binding.mjs";

const root = path.resolve(import.meta.dirname, ".."), mib = 1048576;
const sha = b => createHash("sha256").update(b).digest("hex");
const freePort = () => {
  const listener = createServer();
  return new Promise((resolve, reject) => {
    listener.once("error", reject);
    listener.listen(0, "127.0.0.1", () => {
      const port = listener.address().port;
      listener.close(err => err ? reject(err) : resolve(port));
    });
  });
};

async function verifyStaticAsset(baseURL, relative, expected, mime) {
  const response = await fetch(baseURL + "/" + relative, { redirect: "error", signal: AbortSignal.timeout(10000) });
  try {
    assert.equal(response.status, 200);
    assert.match(response.headers.get("content-type") ?? "", mime);
    assert.equal(response.headers.get("cross-origin-opener-policy"), "same-origin");
    assert.equal(response.headers.get("cross-origin-embedder-policy"), "require-corp");
    assert.equal(response.headers.get("cross-origin-resource-policy"), "same-origin");
    assert.equal(response.headers.get("x-content-type-options"), "nosniff");
    assert.match(response.headers.get("content-security-policy") ?? "", /wasm-unsafe-eval/);
    const hash = createHash("sha256"); let bytes = 0, maxRead = 0;
    for await (const chunk of response.body) {
      bytes += chunk.length; maxRead = Math.max(maxRead, chunk.length);
      assert.ok(bytes <= expected.bytes && maxRead <= 262144);
      hash.update(chunk);
    }
    assert.equal(bytes, expected.bytes); assert.equal(hash.digest("hex"), expected.sha256);
    return { relative, ...expected, maxRead, mime: response.headers.get("content-type"), securityHeadersVerified: true };
  } finally { await response.body?.cancel().catch(() => {}); }
}

assert.equal(process.argv.length, 2);
const stamp = new Date().toISOString().replaceAll(/[:.]/g, "-");
const receipt = { schemaVersion: 1, status: "running", headed: false, mediaInputs: 0, browserLaunched: false, originalOpened: false,
  published: false, freshNativeBuildClaimed: false, responseInterceptionUsed: false, failures: [] };
const runtime = await createOwnedRuntimeScratch("mkv-static-delivery-");
const layout = privateMkvHeaderPackageLayout();
let liveServer, defaultRuntime;
const withServer = async (ownedPackage, run) => {
  const owner = ownedPackage ? runtime : defaultRuntime;
  liveServer = await startOwnedProductionTestServer({ root, directory: owner.directory, env: { ...owner.env, WRANGLER_SEND_METRICS: "false", NEXT_TELEMETRY_DISABLED: "1" },
    port: await freePort(), useOwnedMkvPackage: ownedPackage });
  try { return await run(liveServer.baseURL); }
  finally {
    const cleanup = await liveServer.close();
    assert.equal(cleanup.ownedRootAbsent, true);
    receipt[ownedPackage ? "privateServerClosed" : "defaultServerClosed"] = true;
    liveServer = null;
  }
};
try {
  const { proof, assets } = await loadQualifiedHeaderNativeCache(root);
  receipt.qualifiedBuild = { head: proof.head, runId: proof.runId };
  const client = path.join(root, "dist", "client"), server = path.join(root, "dist", "server");
  const privatePath = path.join(client, "engines", "remux-qualification");
  const assertNoPrivateDefault = async () => await assert.rejects(lstat(privatePath), { code: "ENOENT" });
  await assertNoPrivateDefault();
  const workerName = (await readdir(path.join(client, "assets"))).filter(n => /^conversion\.worker-[\w-]+\.js$/.test(n));
  assert.equal(workerName.length, 1);
  const worker = await readFile(path.join(client, "assets", workerName[0]));
  const workerBinding = { asset: "/assets/" + workerName[0], expectedBytes: worker.length, expectedSha256: sha(worker) };
  defaultRuntime = await createOwnedRuntimeScratch("mkv-static-default-");
  receipt.default = await withServer(false, async baseURL => {
    for (const relative of Object.values(layout)) {
      const response = await fetch(baseURL + "/" + relative, { redirect: "error", signal: AbortSignal.timeout(10000) });
      try { assert.equal(response.status, 404, "Default build must not serve private core files"); }
      finally { await response.body?.cancel().catch(() => {}); }
    }
    return { privatePathsAbsent: true, worker: await verifyProductionWorkerBinding({ baseURL, ...workerBinding }) };
  });
  await defaultRuntime.close();
  receipt.defaultRuntimeRemoved = true;

  // Match the deployed directory relationship without touching dist or public.
  const site = path.join(runtime.directory, "site");
  await mkdir(site);
  let snapshotBytes = 0, files = 0;
  for (const dir of [client, server]) {
    assert.equal(await realpath(dir), dir);
    for (const entry of await readdir(dir, { withFileTypes: true, recursive: true })) {
      assert.ok(entry.isDirectory() || entry.isFile(), "Do not copy linked or special package files");
      if (!entry.isFile()) continue;
      files++; snapshotBytes += (await lstat(path.join(entry.parentPath, entry.name))).size;
      assert.ok(files <= 700 && snapshotBytes <= 512 * mib);
    }
    await cp(dir, path.join(site, path.basename(dir)), { recursive: true, force: false, errorOnExist: true });
  }
  receipt.snapshot = { files, bytes: snapshotBytes };
  await mkdir(path.join(site, "client", "engines", "remux-qualification"));
  // Extensions of upstream license files need not be recognized by the asset
  // server. Only the copied private package gets the explicit text type.
  const headers = path.join(site, "client", "_headers");
  const headerInfo = await lstat(headers);
  assert.ok(headerInfo.isFile() && !headerInfo.isSymbolicLink() && headerInfo.size <= 16384);
  await appendFile(headers, `\n/${layout["LICENSE.ffmpeg-lgpl3"]}\n  Content-Type: text/plain; charset=utf-8\n`);
  const mime = { "within-direct.mjs": /^(?:text|application)\/javascript(?:;|$)/i, "within-direct.wasm": /^application\/wasm(?:;|$)/i,
    "LICENSE.ffmpeg-lgpl3": /^text\/plain(?:;|$)/i };
  for (const [name, relative] of Object.entries(layout)) {
    const bytes = assets.get("/engines/remux/" + name)?.body ?? await readFile(path.join(root, "fixtures", "qualification-tools", name));
    assertExactMkvHeaderArtifact(bytes, proof.build.artifacts[name], name);
    await writeFile(path.join(site, "client", relative), bytes, { flag: "wx" });
  }
  await withServer(true, async baseURL => {
    receipt.private = { worker: await verifyProductionWorkerBinding({ baseURL, ...workerBinding }), assets: [] };
    for (const [name, relative] of Object.entries(layout)) receipt.private.assets.push(await verifyStaticAsset(baseURL, relative, proof.build.artifacts[name], mime[name]));
  });
  await assertNoPrivateDefault();
  receipt.defaultBuildUnchanged = true;
  receipt.status = "passed-exact-private-engine-package-served-on-loopback-not-browser-qualification";
} catch (error) {
  receipt.status = "failed-not-acceptance";
  receipt.failures.push(String(error.stack ?? error).slice(0, 2048));
} finally {
  try {
    assert.ok(!liveServer, "Never remove package scratch under a live server");
    await defaultRuntime?.close();
    await runtime.close();
    receipt.ownedRuntimeRemoved = true;
  } catch (error) { receipt.status = "failed-not-acceptance"; receipt.failures.push(String(error).slice(0, 1024)); }
  const file = `evidence/${stamp}-mkv-private-static-delivery.json`;
  await writeFile(path.join(root, file), JSON.stringify(receipt, null, 2) + "\n", { flag: "wx" });
  console.log(JSON.stringify({ file, ...receipt }));
  if (receipt.status.startsWith("failed")) process.exitCode = 1;
}
