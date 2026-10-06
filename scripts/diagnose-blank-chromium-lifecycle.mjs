// Blank-only lifecycle diagnostic. NO converter/server/input/media/Wasm.
// Match the failed full-source driver's Chrome flags exactly. All descendants
// stay counted; no browser feature disabling or baseline correction here.
import assert from "node:assert/strict";
import { chromium } from "@playwright/test";
import { spawn, execFile } from "node:child_process";
import { createHash } from "node:crypto";
import { access, mkdir, readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import { promisify } from "node:util";
import { createOwnedRuntimeScratch, finishOwnedCleanup } from "./lib/owned-runtime-scratch.mjs";
import { sampleChromiumTree, stableWindow } from "./lib/chromium-private-memory.mjs";
import { startParallelMemoryObserver } from "./lib/parallel-memory-observer.mjs";
const root = path.resolve(import.meta.dirname, ".."), sha = bytes => createHash("sha256").update(bytes).digest("hex");
const exec = promisify(execFile), delay = ms => new Promise(resolve => setTimeout(resolve, ms));
const original = await readFile(path.join(root, "scripts/mpeg2-split-single-navigation-memory.mjs"), "utf8");
assert.equal(sha(original), "acb179454985fdc2167f9e463d1d720b777d4c829d313d8e3ee45fdf82ff3417");
const fixedArguments = ["--headless=new", "--remote-debugging-port=0", "--no-first-run", "--no-default-browser-check",
  "--disable-background-networking", "--disable-component-update", "--disable-default-apps", "--disable-domain-reliability",
  "--disable-extensions", "--disable-features=MediaRouter,OptimizationGuideModelDownloading,OptimizationHints,OptimizationTargetPrediction",
  "--disable-sync", "--metrics-recording-only", "about:blank"];
const originalArguments = original.slice(original.indexOf('chrome = spawn('), original.indexOf('observer = await startParallelMemoryObserver'));
const quotedArguments = [...originalArguments.matchAll(/"(--[^"\n]+|about:blank)"/g)].map(match => match[1]);
assert.deepEqual(quotedArguments, fixedArguments);
let runtime, chrome, browser, observer, browserVersion = null, earlyStable = null, nativeMemory = null, failure = null;
const samples = [], cleanup = { observerStopped: false, chromeStopped: false, runtimeRemoved: false };
const durationMs = 300000, startedAt = Date.now();
const reports = path.join(root, "output/playwright"); await mkdir(reports, { recursive: true });
const reportPath = path.join(reports, `${new Date().toISOString().replaceAll(/[:.]/g, "-")}-blank-chromium-lifecycle.json`);
try {
  runtime = await createOwnedRuntimeScratch("blank-lifecycle-runtime-");
  const profile = path.join(runtime.directory, "profile"); await mkdir(profile);
  const argumentsWithProfile = [...fixedArguments.slice(0, 2), `--user-data-dir=${profile}`, ...fixedArguments.slice(2)];
  chrome = spawn("C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe", argumentsWithProfile,
    { cwd: root, env: runtime.env, windowsHide: true, stdio: "ignore" });
  observer = await startParallelMemoryObserver(chrome.pid, runtime.directory);
  const deadline = Date.now() + 30000; let port = null;
  while (Date.now() < deadline && !port) {
    try { port = Number((await readFile(path.join(profile, "DevToolsActivePort"), "utf8")).split(/\r?\n/)[0]); } catch { /* bounded startup */ }
    if (!port) await delay(250);
  }
  assert.ok(port, "Chrome startup deadline");
  browser = await chromium.connectOverCDP(`http://127.0.0.1:${port}`); browserVersion = browser.version();
  const context = browser.contexts()[0], page = context.pages()[0];
  await page.goto("about:blank"); assert.equal(page.url(), "about:blank");
  const observationStartedAt = Date.now(); let nextLog = 0;
  while (Date.now() - observationStartedAt < durationMs) {
    assert.equal(page.url(), "about:blank", "Never load the converter or another page");
    const timestamp = new Date().toISOString(), elapsedMs = Date.now() - startedAt;
    observer.healthy(); observer.setPhase("blank-only");
    let tree = { privateBytes: null, rssBytes: null, processes: null }, sampleError = null;
    try { tree = await sampleChromiumTree(chrome.pid); } catch (error) { sampleError = String(error); }
    assert.ok(samples.length < 256, "Blank lifecycle sample cap");
    samples.push({ timestamp, elapsedMs, phase: "blank-only", ...tree, sampleError });
    earlyStable ??= stableWindow(samples);
    if (Date.now() >= nextLog) {
      console.log(`Blank-only ${Math.round((Date.now() - observationStartedAt) / 1000)}s: private=${tree.privateBytes ?? "unavailable"}, processes=${tree.processes?.length ?? "unavailable"}.`);
      nextLog = Date.now() + 30000;
    }
    await delay(2000);
  }
} catch (error) { failure = String(error); process.exitCode = 1; }
finally {
  const cleanupErrors = [], attempt = async action => { try { await action(); } catch (error) { cleanupErrors.push(String(error)); } };
  await attempt(async () => { if (observer) { await observer.stop(); nativeMemory = observer.report(); cleanup.observerStopped = true; } });
  await attempt(() => browser?.close());
  await attempt(async () => {
    if (chrome?.pid && chrome.exitCode == null && chrome.signalCode == null)
      await exec("taskkill.exe", ["/PID", String(chrome.pid), "/T", "/F"], { windowsHide: true, timeout: 15000 });
    if (chrome?.pid) {
      const { stdout } = await exec("powershell.exe", ["-NoProfile", "-NonInteractive", "-Command",
        `@(Get-CimInstance Win32_Process -Filter 'ProcessId = ${chrome.pid}').Count`], { windowsHide: true });
      assert.equal(Number(stdout.trim()), 0); cleanup.chromeStopped = true;
    }
  });
  await attempt(async () => {
    if (runtime) { await finishOwnedCleanup([() => runtime.close()]); await assert.rejects(access(runtime.directory), { code: "ENOENT" }); cleanup.runtimeRemoved = true; }
  });
  if (cleanupErrors.length) { failure ??= cleanupErrors.join(" | "); process.exitCode = 1; }
  const sourcePins = {};
  for (const file of ["scripts/diagnose-blank-chromium-lifecycle.mjs", "scripts/mpeg2-split-single-navigation-memory.mjs",
    "scripts/lib/chromium-private-memory.mjs", "scripts/lib/parallel-memory-observer.mjs", "scripts/lib/native-memory-peaks.mjs",
    "scripts/lib/windows-tree-monitor.cs", "scripts/lib/windows-tree-monitor.ps1", "scripts/lib/owned-runtime-scratch.mjs"])
    sourcePins[file] = sha(await readFile(path.join(root, file)));
  const report = { recordedAt: new Date().toISOString(), scope: "Five-minute unchanged-flags clean blank Chromium lifecycle only, not conversion or a replacement acceptance baseline",
    durationMs, fixedArguments, identicalOriginalDriverFlags: true, originalFileRead: false,
    converterLoaded: false, conversionsPerformed: 0, publicAcceptance: false, baselineAdjusted: false,
    browserVersion, earlyStable, lateWindowDiagnosticOnly: stableWindow(samples.slice(-10)), samples, nativeMemory,
    onDeviceModelObserved: samples.some(sample => sample.processes?.some(p => p.utilitySubtype === "on_device_model.mojom.OnDeviceModelService")),
    failure, cleanup, cleanupErrors, sourcePins, ownedPids: { chrome: chrome?.pid ?? null, observer: observer?.pid ?? null }, runtimeDirectory: runtime?.directory ?? null };
  const json = JSON.stringify(report, null, 2) + "\n"; assert.ok(Buffer.byteLength(json) <= 8 * 1024 * 1024);
  await writeFile(reportPath, json, { flag: "wx" }); console.log(reportPath);
}
