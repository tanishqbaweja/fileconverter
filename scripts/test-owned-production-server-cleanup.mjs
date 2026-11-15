// One real headless server lifecycle; no browser, media selection or conversion.
import assert from "node:assert/strict";
import { createServer } from "node:net";
import { readFile, writeFile, access } from "node:fs/promises";
import { createHash } from "node:crypto";
import path from "node:path";
import { startOwnedProductionTestServer } from "./lib/owned-production-test-server.mjs";
import { createOwnedRuntimeScratch } from "./lib/owned-runtime-scratch.mjs";
assert.equal(process.argv.length, 2);
const root = path.resolve(import.meta.dirname, ".."), runtime = await createOwnedRuntimeScratch("owned-server-cleanup-smoke-");
const report = { schemaVersion: 1, status: "running", scope: "real-owned-headless-server-lifecycle-only-not-browser-or-conversion-acceptance",
  browserLaunched: false, mediaSelected: false, originalOpened: false, productionFilesChanged: false, publicAcceptance: false };
let server;
try {
  const portProbe = createServer(); await new Promise((resolve, reject) => { portProbe.on("error", reject); portProbe.listen(0, "127.0.0.1", resolve); });
  const port = portProbe.address().port; await new Promise(resolve => portProbe.close(resolve));
  server = await startOwnedProductionTestServer({ root, directory: runtime.directory,
    env: { ...runtime.env, WRANGLER_SEND_METRICS: "false", NEXT_TELEMETRY_DISABLED: "1" }, port });
  report.launch = server.launchRecord;
  const journal = JSON.parse(await readFile(path.join(runtime.directory, "owned-production-server-launch.json")));
  assert.deepEqual(journal, server.launchRecord); assert.equal(journal.windowsHide, true);
  assert.match(journal.nestedSubprocessPreload, /hidden-unit-subprocesses\.mjs/);
  report.healthStatus = (await fetch(server.baseURL, { signal: AbortSignal.timeout(3000) })).status;
  assert.equal(report.healthStatus, 200);
  report.cleanup = await server.close(); assert.equal(report.cleanup.ownedRootAbsent, true);
  assert.deepEqual(await server.close(), report.cleanup);
  report.status = "passed-real-owned-server-launch-readiness-and-root-cleanup";
} catch (error) { report.status = "failed-not-acceptance"; report.failure = String(error.stack ?? error).slice(0, 2048); process.exitCode = 1; }
finally {
  if (server) { report.cleanup = await server.close(); assert.equal(report.cleanup.ownedRootAbsent, true); }
  // On an unresolved startup failure retain the ownership record/scratch, never
  // delete a possible live server's persist directory to make cleanup look good.
  if (report.cleanup?.ownedRootAbsent) {
    await runtime.close(); await assert.rejects(access(runtime.directory), { code: "ENOENT" }); report.ownedRuntimeRemoved = true;
  }
  report.sourcePins = {};
  for (const file of ["scripts/test-owned-production-server-cleanup.mjs", "scripts/lib/owned-production-test-server.mjs",
    "scripts/lib/owned-server-close.mjs", "scripts/lib/reliable-owned-identity.mjs", "scripts/lib/hidden-unit-subprocesses.mjs"]) {
    report.sourcePins[file] = createHash("sha256").update(await readFile(path.join(root, file))).digest("hex");
  }
  const file = `evidence/${new Date().toISOString().replaceAll(/[:.]/g, "-")}-owned-production-server-cleanup.json`;
  await writeFile(path.join(root, file), JSON.stringify(report, null, 2) + "\n", { flag: "wx" });
  console.log(JSON.stringify({ file, status: report.status, cleanup: report.cleanup, ownedRuntimeRemoved: report.ownedRuntimeRemoved, failure: report.failure }));
}
