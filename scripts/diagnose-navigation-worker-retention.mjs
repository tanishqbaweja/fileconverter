// Observe idle production navigation only. No files selected, engines replaced,
// conversion performed, accepted baseline, peak estimate, or memory pass claimed.
import assert from "node:assert/strict";
import { spawn, execFile } from "node:child_process";
import { createHash } from "node:crypto";
import { createReadStream } from "node:fs";
import { access, mkdir, readFile, stat, statfs, writeFile } from "node:fs/promises";
import { createServer } from "node:net";
import path from "node:path";
import { promisify } from "node:util";
import { chromium } from "playwright";
import { createOwnedRuntimeScratch, finishOwnedCleanup } from "./lib/owned-runtime-scratch.mjs";
import { inspectStressHostMemory } from "./lib/host-memory-preflight.mjs";
import { inspectInstalledChromePin, assertInstalledChromePinsEqual } from "./lib/installed-chrome-pin.mjs";
import { queryReliableProcessIdentity } from "./lib/reliable-owned-identity.mjs";
import { observeOwnedProcessExit } from "./lib/owned-process-exit-observation.mjs";
import { sampleChromiumTree } from "./lib/chromium-private-memory.mjs";

assert.equal(process.platform, "win32"); assert.equal(process.argv.length, 2);
const root = path.resolve(import.meta.dirname, ".."), execute = promisify(execFile);
const stamp = new Date().toISOString().replaceAll(/[:.]/g, "-"), sha = bytes => createHash("sha256").update(bytes).digest("hex");
const pause = ms => new Promise(resolve => setTimeout(resolve, ms));
const report = { schemaVersion: 1, startedAt: new Date().toISOString(), status: "running", failures: [], sourcePins: {}, phases: [], events: [], eventOverflow: false,
  scope: "Three idle production app / same-origin static page / browser-back traversals, not conversion or peak memory acceptance",
  headed: false, browserServicesDisabled: false, fileSelections: 0, conversions: 0, memoryAcceptance: false, baseline: null,
  diagnosticPerturbsMemory: true, fullDomAndHarTracing: true, productionCodeChanged: false, originalGoalComplete: false };
let runtime, server, chrome, serverBirth, chromeBirth, browser, cdp, traceStarted = false, serverLog = "";
async function originalIdentity() {
  const file = path.join(root, "test.mkv"), digest = createHash("sha256");
  for await (const bytes of createReadStream(file, { highWaterMark: 262144 })) digest.update(bytes);
  const result = { bytes: (await stat(file)).size, sha256: digest.digest("hex") };
  assert.equal(result.bytes, 2958573265); assert.equal(result.sha256, "31f36695b5b44c62125a9e4264e84dc085accd21c02cc3487aae597f54b9db34"); return result;
}
async function stop(child, birth) {
  if (!child || child.exitCode !== null || child.signalCode !== null) return;
  assert.ok(birth); assert.deepEqual(await queryReliableProcessIdentity(child.pid), birth);
  await execute("taskkill.exe", ["/PID", String(child.pid), "/T", "/F"], { windowsHide: true, timeout: 15000, maxBuffer: 16384 });
}
try {
  for (const file of ["scripts/diagnose-navigation-worker-retention.mjs", "app/converter/ConverterApp.tsx", "lib/staged-worker-coordinator.ts",
    "package.json", "package-lock.json", "worker/index.ts", "public/test-validator.html", "scripts/lib/chromium-private-memory.mjs"])
    report.sourcePins[file] = sha(await readFile(path.join(root, file)));
  report.executedHead = (await execute(process.env.WITHIN_GIT_EXECUTABLE ?? "git", ["rev-parse", "HEAD"], { cwd: root, windowsHide: true, timeout: 10000 })).stdout.trim();
  report.hostMemory = await inspectStressHostMemory(); assert.equal(report.hostMemory.safeToStart, true);
  const disk = await statfs(root); assert.ok(disk.bavail * disk.bsize >= 512 * 1024 ** 2);
  report.protectedOriginalBefore = await originalIdentity(); report.browserBefore = await inspectInstalledChromePin();
  runtime = await createOwnedRuntimeScratch("navigation-worker-diagnostic-");
  const env = { ...runtime.env, WRANGLER_SEND_METRICS: "false", npm_config_cache: path.join(runtime.directory, "npm-cache") };
  const lease = createServer(); await new Promise(resolve => lease.listen(0, "127.0.0.1", resolve));
  const port = lease.address().port; await new Promise(resolve => lease.close(resolve)); const origin = `http://127.0.0.1:${port}`;
  server = spawn(process.execPath, ["node_modules/wrangler/bin/wrangler.js", "dev", "--config", "dist/server/wrangler.json", "--port", String(port), "--persist-to", path.join(runtime.directory, "wrangler")],
    { cwd: root, env, windowsHide: true, stdio: ["ignore", "pipe", "pipe"] });
  serverBirth = await queryReliableProcessIdentity(server.pid); assert.ok(serverBirth);
  for (const pipe of [server.stdout, server.stderr]) pipe.on("data", value => { serverLog = (serverLog + value).slice(-16384); });
  let ready = false; const serverDeadline = Date.now() + 30000;
  while (Date.now() < serverDeadline && !ready) {
    assert.equal(server.exitCode, null, serverLog);
    try { const response = await fetch(origin, { method: "HEAD", signal: AbortSignal.timeout(2000) }); ready = response.ok; } catch {}
    if (!ready) await pause(500);
  }
  assert.ok(ready, serverLog);
  const profile = path.join(runtime.directory, "profile"); await mkdir(profile);
  report.chromeArguments = ["--headless=new", "--remote-debugging-port=0", `--user-data-dir=${profile}`, "--no-first-run", "--no-default-browser-check", "about:blank"];
  chrome = spawn(report.browserBefore.launcher.path, report.chromeArguments, { cwd: root, env, windowsHide: true, stdio: "ignore" });
  chromeBirth = await queryReliableProcessIdentity(chrome.pid); assert.ok(chromeBirth);
  let lines; const debugDeadline = Date.now() + 30000;
  while (Date.now() < debugDeadline && !lines) { assert.equal(chrome.exitCode, null);
    try { lines = (await readFile(path.join(profile, "DevToolsActivePort"), "utf8")).trim().split(/\r?\n/); } catch { await pause(250); } }
  assert.ok(lines && Number(lines[0]) > 0);
  browser = await chromium.connectOverCDP(`http://127.0.0.1:${Number(lines[0])}`);
  const context = browser.contexts()[0], page = context.pages()[0]; assert.equal(page.url(), "about:blank");
  cdp = await browser.newBrowserCDPSession();
  const forbidden = []; let forbiddenOverflow = false;
  context.on("request", request => {
    const url = new URL(request.url());
    if (!["GET", "HEAD"].includes(request.method()) || (["http:", "https:"].includes(url.protocol) && url.origin !== origin)) {
      if (forbidden.length >= 32) forbiddenOverflow = true;
      else forbidden.push({ method: request.method(), url: request.url().slice(0, 512) });
    }
  });
  await context.exposeBinding("__withinIdleNavigationEvent", (_source, value) => {
    if (report.events.length >= 64) { report.eventOverflow = true; return; } report.events.push(value);
  });
  await context.addInitScript(() => {
    const state = { documentId: crypto.randomUUID(), events: [] }; globalThis.__withinIdleNavigation = state;
    for (const type of ["pagehide", "pageshow"]) addEventListener(type, event => {
      const value = { documentId: state.documentId, type, persisted: event.persisted, href: location.href, timestamp: new Date().toISOString() };
      if (state.events.length < 16) state.events.push(value);
      void globalThis.__withinIdleNavigationEvent(value).catch(() => {});
    });
  });
  async function capture(phase) {
    const targets = (await cdp.send("Target.getTargets")).targetInfos.filter(target => target.url.startsWith(origin + "/"));
    assert.ok(targets.length <= 32);
    let memory = null, unavailable = null;
    try { memory = await sampleChromiumTree(chrome.pid); } catch (error) { unavailable = String(error).slice(0, 512); }
    const document = page.url() === "about:blank" ? null : await page.evaluate(() => ({
      state: globalThis.__withinIdleNavigation, url: location.href, crossOriginIsolated,
      navigationType: performance.getEntriesByType("navigation")[0]?.type ?? null,
    }));
    report.phases.push({ phase, timestamp: new Date().toISOString(), targets, memory, memoryUnavailable: unavailable, document });
  }
  await capture("blank-single-point-not-accepted-baseline");
  await context.tracing.start({ screenshots: true, snapshots: true, sources: false }); traceStarted = true;
  await page.goto(origin); await page.locator(".readiness.ready").waitFor({ timeout: 15000 }); await capture("app-initial-idle");
  for (let index = 1; index <= 3; index++) {
    await page.goto(origin + "/test-validator.html?navigation=" + index); await page.locator("p").waitFor();
    await capture("away-" + index);
    // A BFCache restore does not refire load. Observe the real URL and readiness
    // rather than waiting for a new document's load event on the restored one.
    await page.evaluate(() => history.back());
    await page.waitForFunction(expected => location.href === expected, origin + "/", { timeout: 15000 });
    await page.locator(".readiness.ready").waitFor({ timeout: 15000 });
    await capture("returned-" + index);
  }
  report.forbiddenRequests = forbidden; report.forbiddenRequestOverflow = forbiddenOverflow;
  assert.deepEqual(forbidden, []); assert.equal(forbiddenOverflow, false); assert.equal(report.eventOverflow, false);
  const initialId = report.phases.find(row => row.phase === "app-initial-idle").document.state.documentId;
  report.returnedDocuments = report.phases.filter(row => row.phase.startsWith("returned-")).map(row => ({ phase: row.phase,
    sameDocument: row.document.state.documentId === initialId, events: row.document.state.events,
    currentOriginWorkerTargets: row.targets.filter(target => target.type === "worker").map(target => target.targetId) }));
  report.bfcacheRestoreObserved = report.returnedDocuments.some(row => row.sameDocument && row.events.some(event => event.type === "pageshow" && event.persisted));
  report.status = "completed-idle-navigation-diagnostic-not-conversion-or-memory-acceptance";
} catch (error) { report.status = "failed-idle-navigation-diagnostic"; report.failures.push(String(error.stack ?? error)); process.exitCode = 1; }
finally {
  if (traceStarted) try {
    const trace = path.join(root, "output/playwright", stamp + "-idle-navigation-diagnostic.zip"); await mkdir(path.dirname(trace), { recursive: true });
    await browser.contexts()[0].tracing.stop({ path: trace });
    report.trace = { path: path.relative(root, trace), bytes: (await stat(trace)).size, sha256: sha(await readFile(trace)) };
  } catch (error) { report.failures.push("Trace closure: " + error); report.status = "failed-idle-navigation-diagnostic"; process.exitCode = 1; }
  await cdp?.detach().catch(() => {}); await browser?.close().catch(() => {});
  await finishOwnedCleanup([() => stop(chrome, chromeBirth), () => stop(server, serverBirth)])
    .catch(error => { report.failures.push("Owned stop: " + error); report.status = "failed-idle-navigation-diagnostic"; process.exitCode = 1; });
  report.processCleanup = [];
  for (const birth of [chromeBirth, serverBirth].filter(Boolean)) report.processCleanup.push(await observeOwnedProcessExit(birth));
  try {
    assert.ok(report.processCleanup.every(row => row.status === "owned-identity-absent"));
    assert.ok([chrome, server].every(child => !child || child.exitCode !== null || child.signalCode !== null));
    await runtime?.close(); report.ownedRuntimeRemoved = Boolean(runtime);
    if (runtime) await assert.rejects(access(runtime.directory), { code: "ENOENT" });
    for (const [file, digest] of Object.entries(report.sourcePins)) assert.equal(sha(await readFile(path.join(root, file))), digest, file);
    if (report.browserBefore) assertInstalledChromePinsEqual(report.browserBefore, await inspectInstalledChromePin());
    if (report.protectedOriginalBefore) { report.protectedOriginalAfter = await originalIdentity(); assert.deepEqual(report.protectedOriginalAfter, report.protectedOriginalBefore); }
  } catch (error) { report.failures.push("Final verification: " + error); report.status = "failed-idle-navigation-diagnostic"; process.exitCode = 1; }
  report.serverLog = serverLog; report.finishedAt = new Date().toISOString();
  const file = path.join(root, "evidence", stamp + "-idle-navigation-diagnostic.json"); await writeFile(file, JSON.stringify(report, null, 2) + "\n", { flag: "wx" });
  console.log(JSON.stringify({ path: path.relative(root, file), status: report.status, bfcacheRestoreObserved: report.bfcacheRestoreObserved ?? null, phases: report.phases.length, cleanup: report.ownedRuntimeRemoved, failures: report.failures }));
}
