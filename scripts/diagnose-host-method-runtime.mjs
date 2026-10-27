// Finite HTTP-only comparison: production worker versus two minimal runtime controls.
import "./lib/hidden-unit-subprocesses.mjs";
import assert from "node:assert/strict";
import { spawn, execFile } from "node:child_process";
import { createHash } from "node:crypto";
import { readFile, mkdir, writeFile, access, lstat } from "node:fs/promises";
import { Agent, request } from "node:http";
import { createServer } from "node:net";
import path from "node:path";
import { promisify } from "node:util";
import { createOwnedRuntimeScratch } from "./lib/owned-runtime-scratch.mjs";
import { inspectStressHostMemory } from "./lib/host-memory-preflight.mjs";
import { queryReliableProcessIdentity } from "./lib/reliable-owned-identity.mjs";
import { observeOwnedProcessExit } from "./lib/owned-process-exit-observation.mjs";
import { startDirectWorkerdHost } from "./lib/direct-workerd-host.mjs";

assert.equal(process.platform, "win32");
const asyncControl = process.argv[2] === "--async-control";
const unbundledControl = process.argv[2] === "--unbundled-control";
const lifecycleControl = process.argv[2] === "--body-lifecycle-controls";
const directProduction = process.argv[2] === "--direct-production";
assert.ok(process.argv.length === 2 || (process.argv.length === 3 && (asyncControl || unbundledControl || lifecycleControl || directProduction)));
const root = path.resolve(import.meta.dirname, ".."), execute = promisify(execFile), pause = ms => new Promise(resolve => setTimeout(resolve, ms));
const sha = bytes => createHash("sha256").update(bytes).digest("hex");
const report = { schemaVersion: 1, scope: "Synthetic HTTP runtime diagnosis only; no browser, user file, converter, memory qualification or acceptance",
  startedAt: new Date().toISOString(), status: "running", browserLaunched: false, userFilesRead: false,
  refusedBodyReadByProbe: false, conversionAcceptance: false, publicPromotion: false, sourcePins: {}, controls: [], failures: [] };
report.mode = directProduction ? "same-built-production-worker-direct-workerd" : lifecycleControl ? "drain-disabled-and-nonreading-cancellation" : unbundledControl ? "same-async-probes-unbundled-only" : asyncControl ? "new-minimal-async-controls-only" : "production-and-minimal-sync-controls";
for (const file of ["scripts/diagnose-host-method-runtime.mjs", "scripts/lib/direct-workerd-host.mjs", "worker/index.ts", "lib/static-host-request-policy.ts", "vite.config.ts",
  "package.json", "package-lock.json", "dist/server/wrangler.json", "dist/server/index.js"])
  report.sourcePins[file] = sha(await readFile(path.join(root, file)));
report.driverSource = await readFile(path.join(root, "scripts/diagnose-host-method-runtime.mjs"), "utf8");
for (const name of ["wrangler", "miniflare"]) report[name] = JSON.parse(await readFile(path.join(root, "node_modules", name, "package.json"))).version;
const getPort = () => new Promise((resolve, reject) => { const socket = createServer(); socket.once("error", reject);
  socket.listen(0, "127.0.0.1", () => { const port = socket.address().port; socket.close(error => error ? reject(error) : resolve(port)); }); });
const httpProbe = (port, method, body, agent, pathname = "/", responseCap = 4096) => new Promise(resolve => {
  const payload = body ? Buffer.from("synthetic-control-only") : null, started = Date.now(); let completed = false, deadline;
  const finish = value => { if (!completed) { completed = true; clearTimeout(deadline); resolve({ method, requestBytes: payload?.length ?? 0, elapsedMs: Date.now() - started, ...value }); } };
  const req = request({ hostname: "127.0.0.1", port, path: pathname, method, agent,
    headers: payload ? { "content-type": "application/octet-stream", "content-length": payload.length } : {} }, response => {
    const chunks = []; let bytes = 0;
    response.on("data", chunk => { bytes += chunk.length; if (bytes > responseCap) response.destroy(new Error("HTTP diagnostic response cap")); else chunks.push(chunk); });
    response.on("error", error => finish({ status: null, error: String(error) }));
    response.on("end", () => finish({ status: response.statusCode, allow: response.headers.allow ?? null,
      probeMethod: response.headers["x-probe-method"] ?? null, bodyUsed: response.headers["x-probe-body-used"] ?? null,
      bodyCancelled: response.headers["x-probe-body-cancelled"] ?? null,
      coop: response.headers["cross-origin-opener-policy"] ?? null, coep: response.headers["cross-origin-embedder-policy"] ?? null,
      mime: response.headers["content-type"] ?? null,
      responseBytes: bytes, responseText: Buffer.concat(chunks).toString("utf8") }));
  });
  req.setTimeout(5000, () => req.destroy(new Error("HTTP diagnostic timeout")));
  deadline = setTimeout(() => req.destroy(new Error("HTTP absolute diagnostic deadline")), 6000);
  req.on("error", error => finish({ status: null, error: String(error) })); req.end(payload);
});
let runtime;
try {
  report.hostMemory = await inspectStressHostMemory(); assert.equal(report.hostMemory.safeToStart, true);
  runtime = await createOwnedRuntimeScratch("method-runtime-");
  const directoryIdentity = await lstat(runtime.directory, { bigint: true });
  report.runtime = { directory: path.relative(root, runtime.directory).replaceAll("\\", "/"),
    dev: String(directoryIdentity.dev), ino: String(directoryIdentity.ino) };
  const env = { ...runtime.env, WRANGLER_SEND_METRICS: "false", npm_config_cache: path.join(runtime.directory, "npm-cache") };
  const fixture = `export default {${asyncControl || unbundledControl || lifecycleControl ? "async " : ""}fetch(request){return new Response(request.method === "GET" ? "ready" : null,{status:request.method === "GET" || request.method === "HEAD" ? 200 : 405,headers:{Allow:"GET, HEAD","X-Probe-Method":request.method,"X-Probe-Body-Used":String(request.bodyUsed)}})}};\n`;
  report.probeSha256 = sha(fixture);
  // Never put live state/cache/log writes under the raw module watch root.
  const sourceDirectory = path.join(runtime.directory, "probe-source"); await mkdir(sourceDirectory);
  report.probeRelativePath = "probe-source/probe.mjs";
  await writeFile(path.join(sourceDirectory, "probe.mjs"), fixture, { flag: "wx" });
  await mkdir(path.join(sourceDirectory, "assets")); await writeFile(path.join(sourceDirectory, "assets", "static.txt"), "static-control\n", { flag: "wx" });
  for (const assets of [false, true]) await writeFile(path.join(sourceDirectory, `probe-${assets}.json`), JSON.stringify({ name: "within-http-diagnostic",
    main: "probe.mjs", compatibility_date: "2026-05-15", compatibility_flags: ["nodejs_compat"],
    ...(unbundledControl ? { no_bundle: true } : {}),
    ...(assets ? { assets: { directory: "assets", binding: "ASSETS", run_worker_first: true } } : {}) }), { flag: "wx" });
  if (lifecycleControl) {
    const cancelSource = path.join(runtime.directory, "cancel-source"); await mkdir(cancelSource);
    const cancelFixture = `export default {async fetch(request){let cancelled=false;if(request.method!=="GET"&&request.method!=="HEAD"&&request.body){await request.body.cancel("refused-method");cancelled=true;}return new Response(request.method==="GET"?"ready":null,{status:request.method==="GET"||request.method==="HEAD"?200:405,headers:{Allow:"GET, HEAD","X-Probe-Method":request.method,"X-Probe-Body-Used":String(request.bodyUsed),"X-Probe-Body-Cancelled":String(cancelled)}})}};\n`;
    report.cancelProbeSha256 = sha(cancelFixture); report.cancelProbeSource = cancelFixture;
    await writeFile(path.join(cancelSource, "probe.mjs"), cancelFixture, { flag: "wx" });
    await mkdir(path.join(cancelSource, "assets")); await writeFile(path.join(cancelSource, "assets/static.txt"), "static-control\n", { flag: "wx" });
    for (const assets of [false, true]) await writeFile(path.join(cancelSource, `probe-${assets}.json`), JSON.stringify({ name: "within-http-diagnostic", main: "probe.mjs",
      compatibility_date: "2026-05-15", compatibility_flags: ["nodejs_compat"], no_bundle: true,
      ...(assets ? { assets: { directory: "assets", binding: "ASSETS", run_worker_first: true } } : {}) }), { flag: "wx" });
  }
  const controls = directProduction ? [{ name: "production-direct-workerd", config: path.join(root, "dist/server/wrangler.json"), direct: true }] : lifecycleControl ? [
    { name: "bundled-drain-disabled-no-assets", config: path.join(sourceDirectory, "probe-false.json"), disableDrain: true },
    { name: "bundled-drain-disabled-worker-first-assets", config: path.join(sourceDirectory, "probe-true.json"), disableDrain: true },
    { name: "raw-cancel-no-assets", config: path.join(runtime.directory, "cancel-source/probe-false.json") },
    { name: "raw-cancel-worker-first-assets", config: path.join(runtime.directory, "cancel-source/probe-true.json") },
  ] : unbundledControl ? [
    { name: "same-async-unbundled-no-assets", config: path.join(sourceDirectory, "probe-false.json") },
    { name: "same-async-unbundled-worker-first-assets", config: path.join(sourceDirectory, "probe-true.json") },
  ] : asyncControl ? [
    { name: "minimal-async-no-assets", config: path.join(sourceDirectory, "probe-false.json") },
    { name: "minimal-async-worker-first-assets", config: path.join(sourceDirectory, "probe-true.json") },
  ] : [{ name: "production", config: path.join(root, "dist/server/wrangler.json") },
    { name: "minimal-no-assets", config: path.join(sourceDirectory, "probe-false.json") },
    { name: "minimal-worker-first-assets", config: path.join(sourceDirectory, "probe-true.json") }];
  for (const control of controls) {
    const row = { name: control.name, cases: [], failures: [] }; report.controls.push(row);
    const port = await getPort(); let child, identity, log = "", directHost;
    try {
      const configuration = JSON.parse(await readFile(control.config));
      row.config = { sha256: sha(await readFile(control.config)), noBundle: configuration.no_bundle ?? false, assets: Boolean(configuration.assets),
        sdkBodyDrainDisabled: Boolean(control.disableDrain) };
      if (control.direct) {
        row.directRuntime = {};
        directHost = await startDirectWorkerdHost({ runtime, port, receipt: row.directRuntime });
        child = directHost.child; identity = row.directRuntime.launchIdentity;
      } else {
      child = spawn(process.execPath, ["node_modules/wrangler/bin/wrangler.js", "dev", "--config", control.config,
        "--port", String(port), "--persist-to", path.join(runtime.directory, control.name)], { cwd: root,
        env: { ...env, WRANGLER_DISABLE_REQUEST_BODY_DRAINING: control.disableDrain ? "1" : "" }, windowsHide: true, stdio: ["ignore", "pipe", "pipe"] });
      child.on("error", error => { row.failures.push(String(error)); });
      for (const pipe of [child.stdout, child.stderr]) pipe.on("data", value => { log = (log + value.toString()).slice(-16384); });
      identity = await queryReliableProcessIdentity(child.pid); assert.ok(identity); row.launchIdentity = identity;
      }
      row.launchIdentity = identity;
      let ready = false;
      const startupDeadline = Date.now() + 30000;
      for (let i = 0; i < 30 && Date.now() < startupDeadline; i++) { directHost?.assertAlive(); assert.equal(child.exitCode, null, log);
        const probe = await httpProbe(port, "HEAD", false, false); if (probe.status === 200) { ready = true; break; } await pause(500); }
      assert.ok(ready, log || "HTTP startup deadline");
      // PUT is first, on a new socket; separate cases isolate body presence and reuse.
      for (const [method, body] of [["PUT", true], ["PUT", false], ["POST", true], ["PATCH", true], ["DELETE", true], ["OPTIONS", true]])
        row.cases.push({ transport: "fresh-socket", ...await httpProbe(port, method, body, false) });
      const agent = new Agent({ keepAlive: true, maxSockets: 1 });
      try { for (const method of ["POST", "PUT", "PATCH"]) row.cases.push({ transport: "one-reused-socket", ...await httpProbe(port, method, true, agent) }); }
      finally { agent.destroy(); }
      row.healthAfter = await httpProbe(port, "HEAD", false, false);
      if (control.direct) {
        for (const entry of row.cases) {
          assert.equal(entry.status, 405); assert.equal(entry.allow, "GET, HEAD"); assert.equal(entry.responseBytes, 0);
          assert.equal(entry.coop, "same-origin"); assert.equal(entry.coep, "require-corp");
        }
        const html = await httpProbe(port, "GET", false, false, "/", 262144);
        assert.equal(html.status, 200); assert.match(html.responseText, /Big files\./);
        row.html = { status: html.status, responseBytes: html.responseBytes, sha256: sha(html.responseText) };
        const assets = [...new Set([...html.responseText.matchAll(/\b(?:src|href)="(\/assets\/[^"?#]+\.(?:js|css))"/g)].map(match => match[1]))];
        assert.ok(assets.length > 0 && assets.length <= 32); row.assetPreflight = [];
        for (const pathname of assets) {
          const asset = await httpProbe(port, "HEAD", false, false, pathname);
          row.assetPreflight.push({ pathname, status: asset.status, mime: asset.mime }); assert.equal(asset.status, 200);
          assert.match(asset.mime, pathname.endsWith(".css") ? /text\/css/ : /javascript/);
        }
        row.optimizerPreflight = [];
        for (const pathname of ["/_vinext/image", "/_next/image", "/%5Fvinext/%69mage", "/_next/image/"]) {
          const result = await httpProbe(port, "GET", false, false, pathname + "?url=%2Ficon.svg&w=640&q=80");
          row.optimizerPreflight.push({ pathname, status: result.status, responseBytes: result.responseBytes });
          assert.equal(result.status, 404); assert.equal(result.responseBytes, 0);
        }
        assert.equal(row.directRuntime.assetService.nonReadRequests, 0); await directHost.verifySourcePins();
      }
    } catch (error) { row.failures.push(String(error.stack ?? error)); }
    finally {
      row.log = log;
      if (directHost) { await directHost.close(); row.cleanup = row.directRuntime.cleanup; }
      else if (row.directRuntime?.cleanup) row.cleanup = row.directRuntime.cleanup;
      else if (child?.exitCode === null && child.signalCode === null) {
        assert.ok(identity); assert.deepEqual(await queryReliableProcessIdentity(child.pid), identity);
        try { await execute("taskkill.exe", ["/PID", String(child.pid), "/T", "/F"], { windowsHide: true, timeout: 15000, maxBuffer: 16384 }); }
        catch (error) {
          row.stopCommandError = String(error); row.stopErrorPidObservations = [];
          for (const match of row.stopCommandError.matchAll(/PID\s+(\d+)/g)) {
            const pid = Number(match[1]), current = await queryReliableProcessIdentity(pid);
            row.stopErrorPidObservations.push({ pid, current }); assert.equal(current, null, "Never remove state used by a possibly live failed teardown child");
          }
        }
      }
      if (identity && !row.cleanup) row.cleanup = await observeOwnedProcessExit(identity);
      assert.equal(row.cleanup?.status, "owned-identity-absent");
    }
    assert.ok(row.failures.length === 0 && row.cases.length === 9 && row.cases.every(c => Number.isInteger(c.status)), "Stop after unavailable protocol observations");
  }
  assert.ok(report.controls.every(row => row.failures.length === 0 && row.cases.length === 9 && row.cases.every(c => Number.isInteger(c.status)) && row.healthAfter.status === 200));
  report.status = "completed-http-diagnosis-not-acceptance";
} catch (error) { report.failures.push(String(error.stack ?? error)); report.status = "failed-diagnosis"; process.exitCode = 1; }
finally {
  if (runtime && report.controls.every(row => row.cleanup?.status === "owned-identity-absent")) {
    await runtime.close(); await assert.rejects(access(runtime.directory), { code: "ENOENT" }); report.ownedRuntimeRemoved = true;
  }
  for (const [file, digest] of Object.entries(report.sourcePins)) assert.equal(sha(await readFile(path.join(root, file))), digest);
  report.finishedAt = new Date().toISOString();
  const file = path.join(root, "evidence", `${new Date().toISOString().replaceAll(/[:.]/g, "-")}-host-method-runtime.json`);
  await writeFile(file, JSON.stringify(report, null, 2) + "\n", { flag: "wx" });
  console.log(JSON.stringify({ path: path.relative(root, file), status: report.status, controls: report.controls.map(row => ({ name: row.name,
    cases: row.cases.map(c => ({ transport: c.transport, method: c.method, bytes: c.requestBytes, status: c.status, bodyUsed: c.bodyUsed })),
    failures: row.failures.map(value => value.slice(0,512)) })), failures: report.failures.map(value => value.slice(0,512)) }));
}
