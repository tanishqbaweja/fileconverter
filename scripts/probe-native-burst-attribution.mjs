// Real Windows/Chromium prerequisite. SYNTHETIC allocation only, not a user file,
// converter, production asset, speed test or memory-acceptance run. No forced GC.
import assert from "node:assert/strict";
import { chromium } from "@playwright/test";
import { execFile, spawn } from "node:child_process";
import { createHash } from "node:crypto";
import { access, mkdir, readFile, statfs, writeFile } from "node:fs/promises";
import path from "node:path";
import { promisify } from "node:util";
import { createOwnedRuntimeScratch } from "./lib/owned-runtime-scratch.mjs";
import { connectRealmSampler } from "./lib/cdp-realm-memory.mjs";
import { startBoundedRendererAttribution } from "./lib/bounded-renderer-attribution.mjs";
import { startBurstMemoryObserver } from "./lib/burst-memory-observer.mjs";
const root = path.resolve(import.meta.dirname, ".."), exec = promisify(execFile);
const sha = bytes => createHash("sha256").update(bytes).digest("hex");
const pause = ms => new Promise(resolve => setTimeout(resolve, ms));
const original = await readFile(path.join(root, "scripts/mpeg2-split-single-navigation-memory.mjs"), "utf8");
assert.equal(sha(original), "acb179454985fdc2167f9e463d1d720b777d4c829d313d8e3ee45fdf82ff3417");
const spawnText = original.slice(original.indexOf("chrome = spawn("), original.indexOf("observer = await startParallelMemoryObserver"));
const argsText = spawnText.slice(spawnText.indexOf("["), spawnText.lastIndexOf("], {"));
const flags = [...argsText.matchAll(/"([^"\n]*)"|`--user-data-dir=\$\{profile\}`/g)].map(match => match[1] ?? "PROFILE");
assert.equal(flags.length, 14); assert.equal(flags.at(-1), "about:blank");
let runtime, chrome, browser, realms, attribution, observer, page;
let failure = null, trace = null, native = null, bursts = null, version = null;
let allocationStartedAt = null, allocationReleasedAt = null;
const cleanup = { syntheticReferenceRemoved: false, observerStopped: false, traceStopped: false,
  realmSocketClosed: false, browserStopped: false, sampledIdentitiesAbsent: false, runtimeRemoved: false };
const errors = [];
try {
  const disk = await statfs(root); assert.ok(disk.bavail * disk.bsize >= 512 * 1048576);
  runtime = await createOwnedRuntimeScratch("native-burst-control-");
  const profile = path.join(runtime.directory, "profile"); await mkdir(profile);
  chrome = spawn("C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe",
    flags.map(value => value === "PROFILE" ? `--user-data-dir=${profile}` : value),
    { cwd: root, env: runtime.env, windowsHide: true, stdio: "ignore" });
  let port = null; const startupDeadline = Date.now() + 30000;
  while (!port && Date.now() < startupDeadline) {
    try { port = Number((await readFile(path.join(profile, "DevToolsActivePort"), "utf8")).split(/\r?\n/)[0]); } catch { /* startup only */ }
    if (!port) await pause(100);
  }
  assert.ok(port, "Chrome startup deadline");
  browser = await chromium.connectOverCDP(`http://127.0.0.1:${port}`);
  page = browser.contexts()[0].pages()[0]; assert.equal(page.url(), "about:blank");
  version = await (await fetch(`http://127.0.0.1:${port}/json/version`)).json();
  realms = await connectRealmSampler(version.webSocketDebuggerUrl, "http://127.0.0.1:1");
  attribution = await startBoundedRendererAttribution(await browser.newBrowserCDPSession(), realms);
  observer = await startBurstMemoryObserver(chrome.pid, runtime.directory, {
    onBurst: event => attribution.dump(`allocation-control-${event.after.sequence}`, event.after.processes),
  });
  assert.equal((await attribution.dump("blank-control-before")).success, true);
  await pause(1000); await observer.through(Date.now());
  const phaseAt = observer.setPhase("allocation-control");
  // Do not allocate until an actual pre-allocation native row exists IN this
  // phase. The tracker intentionally refuses to compare different phases.
  await observer.through(phaseAt);
  allocationStartedAt = Date.now();
  await page.evaluate(() => {
    // Fixed 40MiB anonymous diagnostic storage; not complete-file buffering.
    globalThis.__nativeBurstControl = new Uint8Array(40 * 1048576);
    for (let at = 0; at < globalThis.__nativeBurstControl.length; at += 4096)
      globalThis.__nativeBurstControl[at] = 1;
  });
  const controlDeadline = Date.now() + 5000;
  while (!observer.burstReport().callbacks.some(row => row.status === "completed") && Date.now() < controlDeadline) {
    observer.healthy(); await pause(25);
  }
  bursts = observer.burstReport();
  assert.ok(bursts.callbacks.some(row => row.status === "completed"), "Actual native burst must trigger a completed light dump");
  assert.ok(bursts.events.some(event => event.phase === "allocation-control" &&
    event.after.timestamp && Date.parse(event.after.timestamp) >= phaseAt &&
    event.delta.processDeltas.some(p => p.deltaPrivateBytes >= 32 * 1048576)), "Touched diagnostic pages must appear in an actual process delta");
  assert.ok(bursts.callbacks.every(row => row.error === null));
  await page.evaluate(() => { delete globalThis.__nativeBurstControl; });
  allocationReleasedAt = Date.now(); cleanup.syntheticReferenceRemoved = true;
  observer.setPhase("post-control");
  await observer.through(Date.now()); await observer.stop(); cleanup.observerStopped = true;
  native = observer.report(); bursts = observer.burstReport();
  trace = await attribution.stop(); cleanup.traceStopped = true;
  assert.equal(trace.status, "completed-diagnostic");
  assert.equal(trace.trace.dataLossOccurred, false); assert.equal(trace.trace.overflow, false);
  assert.equal(bursts.eventsDiscarded, 0); assert.equal(native.error, null);
  assert.ok(trace.allocatorSummary.length >= 2);
} catch (error) { failure = String(error); process.exitCode = 1; }
finally {
  const attempt = async fn => { try { await fn(); } catch (error) { errors.push(String(error)); process.exitCode = 1; } };
  await attempt(async () => {
    if (page && !page.isClosed()) {
      await page.evaluate(() => { delete globalThis.__nativeBurstControl; });
      cleanup.syntheticReferenceRemoved = true;
    }
  });
  await attempt(async () => {
    if (observer) {
      await observer.stop(); cleanup.observerStopped = true;
      native = observer.report(); bursts = observer.burstReport();
    }
  });
  await attempt(async () => { if (attribution) { trace ??= await attribution.stop(); cleanup.traceStopped = true; } });
  await attempt(async () => { if (realms) { realms.close(); cleanup.realmSocketClosed = true; } });
  await attempt(() => browser?.close());
  await attempt(async () => {
    if (chrome?.pid && chrome.exitCode == null && chrome.signalCode == null)
      await exec("taskkill.exe", ["/PID", String(chrome.pid), "/T", "/F"], { windowsHide: true, timeout: 15000 });
    if (chrome?.pid) {
      const { stdout } = await exec("powershell.exe", ["-NoProfile", "-NonInteractive", "-Command",
        `@(Get-CimInstance Win32_Process -Filter 'ProcessId = ${chrome.pid}').Count`], { windowsHide: true, timeout: 15000 });
      assert.equal(Number(stdout.trim()), 0); cleanup.browserStopped = true;
    }
    if (native?.identities?.length) {
      const filter = native.identities.map(p => `ProcessId = ${p.pid}`).join(" or ");
      const { stdout } = await exec("powershell.exe", ["-NoProfile", "-NonInteractive", "-Command",
        `$ErrorActionPreference = 'Stop'; ConvertTo-Json -InputObject @(Get-CimInstance Win32_Process -Filter '${filter}' | ForEach-Object { @{ pid = $_.ProcessId; createdAt = $_.CreationDate.ToUniversalTime().ToString('o') } }) -Compress`],
      { windowsHide: true, timeout: 15000 });
      const current = JSON.parse(stdout);
      assert.equal(current.filter(p => native.identities.some(old => old.pid === p.pid &&
        Math.abs(Date.parse(old.createdAt) - Date.parse(p.createdAt)) < 1)).length, 0);
      cleanup.sampledIdentitiesAbsent = true;
    }
  });
  await attempt(async () => {
    if (runtime) { await runtime.close(); await assert.rejects(access(runtime.directory), { code: "ENOENT" }); cleanup.runtimeRemoved = true; }
  });
  const files = ["scripts/probe-native-burst-attribution.mjs", "scripts/lib/native-memory-bursts.mjs",
    "scripts/lib/burst-memory-observer.mjs", "scripts/lib/parallel-memory-observer.mjs",
    "scripts/lib/native-memory-peaks.mjs", "scripts/lib/persistent-chromium-memory.mjs",
    "scripts/lib/windows-tree-monitor.ps1", "scripts/lib/windows-tree-monitor.cs",
    "scripts/lib/bounded-renderer-attribution.mjs", "scripts/lib/memory-infra-attribution.mjs",
    "scripts/lib/cdp-realm-memory.mjs", "scripts/lib/owned-runtime-scratch.mjs",
    "scripts/mpeg2-split-single-navigation-memory.mjs"];
  const sourcePins = Object.fromEntries(await Promise.all(files.map(async file => [file, sha(await readFile(path.join(root, file)))])));
  const report = { recordedAt: new Date().toISOString(), scope: "actual-native-burst-trigger-synthetic-blank-browser-prerequisite",
    status: failure || errors.length || Object.values(cleanup).some(value => value !== true) ? "failed-diagnostic" : "completed-diagnostic",
    browserVersion: version?.Browser ?? null, sourcePins, flags, identicalOriginalFlags: true,
    syntheticAllocationBytes: 40 * 1048576, allocationStartedAt, allocationReleasedAt,
    originalRead: false, converterLoaded: false, conversionsPerformed: 0, generatedMediaCopies: 0,
    publicAcceptance: false, completeChromiumMemoryAcceptance: false, conversionSpeedAcceptance: false,
    native, bursts, trace, failure, errors, cleanup, ownedChromePid: chrome?.pid ?? null,
    ownedObserverPid: observer?.pid ?? null, runtimeDirectory: runtime?.directory ?? null,
    caveat: "This deliberately perturbed short control proves a bounded native-triggered dump, not attribution of the original failure, stable startup baseline, production correctness, conversion speed or 250MiB acceptance. No GC was forced; reference removal does not prove immediate memory reclamation." };
  const json = JSON.stringify(report, null, 2) + "\n"; assert.ok(Buffer.byteLength(json) <= 2 * 1048576);
  const stamp = new Date().toISOString().replaceAll(/[:.]/g, "-");
  const output = path.join(root, `output/playwright/${stamp}-native-burst-attribution-control.json`);
  await mkdir(path.dirname(output), { recursive: true }); await writeFile(output, json, { flag: "wx" });
  console.log(output); console.log(JSON.stringify({ status: report.status, failure, errors, cleanup,
    callbackLatenciesMs: bursts?.callbacks.map(row => row.acquisitionLagMs) ?? null }));
}
