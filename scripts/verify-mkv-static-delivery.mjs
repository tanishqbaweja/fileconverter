// Real built-server static delivery smoke. No browser or media conversion.
import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { lstat, readFile, readdir, writeFile } from "node:fs/promises";
import { createServer } from "node:net";
import path from "node:path";
import { loadQualifiedHeaderNativeCache } from "./lib/mkv-header-native-cache.mjs";
import { createOwnedRuntimeScratch } from "./lib/owned-runtime-scratch.mjs";
import { startOwnedProductionTestServer } from "./lib/owned-production-test-server.mjs";
import { privateMkvHeaderPackageLayout } from "./verify-mkv-hevc-header-reproduction.mjs";
import { verifyProductionWorkerBinding } from "./lib/production-worker-binding.mjs";
import { stagePrivateMkvStaticPackage, verifyPrivateMkvStaticAssets } from "./lib/mkv-static-package.mjs";

const root = path.resolve(import.meta.dirname, "..");
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
  const { proof } = await loadQualifiedHeaderNativeCache(root);
  receipt.qualifiedBuild = { head: proof.head, runId: proof.runId };
  const client = path.join(root, "dist", "client");
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

  const staged = await stagePrivateMkvStaticPackage({ root, directory: runtime.directory });
  receipt.snapshot = staged.snapshot;
  await withServer(true, async baseURL => {
    receipt.private = { worker: await verifyProductionWorkerBinding({ baseURL, ...workerBinding }), assets: await verifyPrivateMkvStaticAssets(baseURL, staged) };
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
