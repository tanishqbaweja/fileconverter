import "./lib/hidden-unit-subprocesses.mjs";
import assert from "node:assert/strict";
import { spawn } from "node:child_process";
import { createHash } from "node:crypto";
import { readFile, writeFile } from "node:fs/promises";
import { createServer } from "node:net";
import path from "node:path";
import { setTimeout as pause } from "node:timers/promises";
import { chromium } from "playwright";
import { createOwnedRuntimeScratch, finishOwnedCleanup } from "./lib/owned-runtime-scratch.mjs";
import { startOwnedProductionTestServer } from "./lib/owned-production-test-server.mjs";
import { inspectInstalledChromePin } from "./lib/installed-chrome-pin.mjs";
import { inspectStressHostMemory } from "./lib/host-memory-preflight.mjs";
import { queryReliableProcessIdentity } from "./lib/reliable-owned-identity.mjs";
import { startChromiumMemoryMonitor } from "./lib/birth-aware-chromium-memory.mjs";
import { cleanupOwnedChromium, queryObservedPidCensus } from "./lib/owned-chromium-cleanup.mjs";
import { reconcileChromiumBirths } from "./lib/reconcile-chromium-births.mjs";

const root = path.resolve(import.meta.dirname, ".."), stamp = new Date().toISOString().replaceAll(/[:.]/g, "-");
const sha = content => createHash("sha256").update(content).digest("hex");
const report = { scope: "Two headless tabs, real TXT-to-HTML through OPFS test adapter, deterministic wait before native dispatch. Not a scale or public memory qualification.", headless: true, failures: [], windowsHide: true };
let scratch, server, browser, monitor, identity, conversionStart, conversionEnd;
const samples = [];
const take = async () => {
  const batch = await monitor?.drain();
  if (!batch) return;
  assert.equal(batch.overflow, false);
  assert.ok(samples.length + batch.samples.length <= 3000);
  samples.push(...batch.samples);
};

try {
  assert.equal(process.platform, "win32");
  report.host = await inspectStressHostMemory(); assert.ok(report.host.safeToStart);
  scratch = await createOwnedRuntimeScratch("opfs-two-tab-");
  const portProbe = createServer();
  await new Promise((resolve, reject) => { portProbe.once("error", reject); portProbe.listen(0, "127.0.0.1", resolve); });
  const port = portProbe.address().port; await new Promise(resolve => portProbe.close(resolve));
  server = await startOwnedProductionTestServer({ root, directory: scratch.directory, env: scratch.env, port });
  report.chrome = await inspectInstalledChromePin();
  const profile = path.join(scratch.directory, "profile");
  const args = ["--headless=new", "--remote-debugging-port=0", `--user-data-dir=${profile}`, "--no-first-run", "--no-default-browser-check", "about:blank"];
  const child = spawn(report.chrome.launcher.path, args, { cwd: root, env: scratch.env, windowsHide: true, stdio: "ignore" });
  let launchError; child.on("error", error => { launchError = error; });
  identity = await queryReliableProcessIdentity(child.pid); assert.ok(identity);
  await writeFile(path.join(scratch.directory, "launch.json"), JSON.stringify({ identity, args }), { flag: "wx" });
  monitor = await startChromiumMemoryMonitor(child.pid, scratch.directory, 100);
  let debugPort;
  for (let attempt = 0; attempt < 40 && !debugPort; attempt++) {
    if (launchError) throw launchError;
    try { debugPort = /^(\d+)\r?\n/.exec(await readFile(path.join(profile, "DevToolsActivePort"), "utf8"))?.[1]; }
    catch (error) { if (error.code !== "ENOENT") throw error; }
    if (!debugPort) await pause(250);
  }
  assert.ok(debugPort); browser = await chromium.connectOverCDP(`http://127.0.0.1:${debugPort}`);
  const context = browser.contexts()[0], owner = context.pages()[0];
  await pause(3000); await take();
  const blank = samples.filter(s => Number.isFinite(s.privateBytes)).slice(-10).map(s => s.privateBytes);
  assert.equal(blank.length, 10);
  report.blankPrivateBytes = Math.min(...blank);
  report.blankRangeBytes = Math.max(...blank) - report.blankPrivateBytes;
  owner.setDefaultTimeout(10000);
  await owner.addInitScript(() => {
    const dispatch = Worker.prototype.postMessage;
    Worker.prototype.postMessage = function (message, ...args) {
      if (message?.type !== "start") return Reflect.apply(dispatch, this, [message, ...args]);
      if (window.__heldOpfsStart) throw new Error("Unexpected duplicate start");
      window.__heldOpfsStart = { destination: message.destination.name,
        release: () => Reflect.apply(dispatch, this, [message, ...args]) };
    };
  });
  const errors = [], forbidden = [];
  await context.route("**/*", async route => {
    const req = route.request(), url = new URL(req.url());
    if (req.method() !== "GET" || req.postData() || url.origin !== server.baseURL || url.search &&
      `${url.pathname}${url.search}` !== "/?test=1" && `${url.pathname}${url.search}` !== "/?test=1&cleanup=1") {
      if (forbidden.length < 8) forbidden.push({ method: req.method(), urlSha256: sha(req.url()) });
      await route.abort();
    } else await route.continue();
  });
  owner.on("pageerror", error => { if (errors.length < 8) errors.push(String(error)); });
  await owner.goto(`${server.baseURL}/?test=1`);
  await (await owner.waitForFunction(() => window.__WITHIN_TEST__?.getState().workerStatus === "ready")).dispose();
  const fixture = path.join(root, "fixtures/documents/sample.txt");
  await owner.getByTestId("file-input").setInputFiles(fixture);
  await owner.getByTestId("format-select").selectOption("txt-to-html");
  await owner.getByTestId("convert-button").click();
  await (await owner.waitForFunction(() => Boolean(window.__heldOpfsStart))).dispose();
  const seeded = await owner.evaluate(async () => {
    const opfs = await navigator.storage.getDirectory();
    const temporary = window.__heldOpfsStart.destination;
    for (const name of [temporary, "within-stage-stale-control", "within-user-owned.txt"]) {
      const f = await opfs.getFileHandle(name, { create: true }), output = await f.createWritable();
      await output.write("sentinel"); await output.close();
    }
    return temporary;
  });
  assert.match(seeded, /^within-test-txt-to-html-/);
  const visitor = await context.newPage(); visitor.setDefaultTimeout(10000);
  visitor.on("pageerror", error => { if (errors.length < 8) errors.push(String(error)); });
  await visitor.goto(`${server.baseURL}/?test=1&cleanup=1`);
  const deferred = visitor.getByText("Temporary storage cleanup deferred: another tab is using it.", { exact: false });
  const clear = visitor.getByRole("button", { name: "Clear temporary storage", exact: true });
  await deferred.waitFor(); report.startupDeferred = true;
  await clear.click(); await deferred.waitFor(); report.manualDeferred = true;
  const names = page => page.evaluate(async () => {
    const opfs = await navigator.storage.getDirectory();
    const entries = []; for await (const [name] of opfs.entries()) entries.push(name);
    return entries.sort();
  });
  assert.deepEqual(await names(visitor), [seeded, "within-stage-stale-control", "within-user-owned.txt"].sort());
  conversionStart = Date.now();
  await owner.evaluate(() => { window.__heldOpfsStart.release(); delete window.__heldOpfsStart; });
  await (await owner.waitForFunction(() => window.__WITHIN_TEST__?.getState().jobState === "complete")).dispose();
  conversionEnd = Date.now();
  const output = await owner.evaluate(async name => {
    const opfs = await navigator.storage.getDirectory();
    return (await (await opfs.getFileHandle(name)).getFile()).text();
  }, seeded);
  // Independent expected HTML text-content comparison for this known input.
  const escaped = (await readFile(fixture, "utf8")).replaceAll("&", "&amp;").replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;").replaceAll('"', "&quot;");
  assert.ok(output.includes(escaped)); assert.match(output, /<!doctype html>/i);
  report.output = { bytes: Buffer.byteLength(output), sha256: sha(output), validatedEscapedText: true };
  await (await owner.waitForFunction(() => window.__WITHIN_TEST__?.getState().workerStatus === "ready")).dispose();
  await clear.click(); await visitor.getByText("Removed 2 app-owned temporary files.", { exact: false }).waitFor();
  assert.deepEqual(await names(visitor), ["within-user-owned.txt"]);
  report.postCompletionSweepPreservedSentinel = true;
  assert.deepEqual(errors, []); assert.deepEqual(forbidden, []);
  report.status = "passed-two-tab-temporary-storage-ownership";
} catch (error) { report.failures.push(String(error.stack ?? error).slice(0, 2048)); }
finally {
  try { await take(); } catch (error) { report.failures.push(`Native sampling: ${error}`); }
  try {
    if (identity) {
      const pids = [...new Set([identity.pid, ...samples.flatMap(s => (s.processes ?? []).map(p => p.pid))])];
      report.browserCleanup = await cleanupOwnedChromium({ identity, observedPids: pids, disconnect: async () => { await browser?.close(); } });
      report.birthCleanup = reconcileChromiumBirths({ identity, observedPids: pids, samples, current: await queryObservedPidCensus(pids) });
      assert.ok(report.birthCleanup.allObservedBirthsAbsent);
    }
  } catch (error) { report.failures.push(`Browser cleanup: ${error}`); }
  try {
    await finishOwnedCleanup([async () => monitor?.close(), async () => server?.close()]);
    assert.ok(!identity || report.birthCleanup?.allObservedBirthsAbsent);
    await scratch?.close(); report.ownedRuntimeRemoved = Boolean(scratch);
  } catch (error) { report.failures.push(`Owned cleanup: ${error}`); }
  const active = samples.filter(s => { const t = Date.parse(s.timestamp); return t >= conversionStart && t <= conversionEnd; });
  const valid = active.filter(s => Number.isFinite(s.privateBytes));
  const peak = valid.length ? Math.max(...valid.map(s => s.privateBytes)) : null;
  report.memory = { startedAt: conversionStart ?? null, endedAt: conversionEnd ?? null, validSamples: valid.length,
    unavailableSamples: active.length - valid.length, peakPrivateBytes: peak,
    incrementalPrivateMiB: peak === null ? null : (peak - report.blankPrivateBytes) / 1048576, acceptanceMetric: false };
  if (report.failures.length) report.status = "failed-two-tab-cleanup-check";
  const file = path.join(root, "evidence", `${stamp}-opfs-two-tab-cleanup.json`);
  await writeFile(file, JSON.stringify(report, null, 2) + "\n", { flag: "wx" });
  console.log(JSON.stringify({ file: path.relative(root, file), status: report.status, failures: report.failures }));
  if (report.failures.length) process.exitCode = 1;
}
