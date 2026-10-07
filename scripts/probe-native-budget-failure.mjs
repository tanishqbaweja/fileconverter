// Short deliberate over-budget SYNTHETIC blank-browser control, not a converter
// profile. No user file/media/conversion, and no weakened250MiB trigger.
import assert from "node:assert/strict";
import { chromium } from "@playwright/test";
import { execFile, spawn } from "node:child_process";
import { createHash } from "node:crypto";
import { access, mkdir, readFile, statfs, writeFile } from "node:fs/promises";
import path from "node:path";
import { pathToFileURL } from "node:url";
import { promisify } from "node:util";
import { createOwnedRuntimeScratch } from "./lib/owned-runtime-scratch.mjs";
import { connectRealmSampler } from "./lib/cdp-realm-memory.mjs";
import { sampleChromiumTree, stableWindow } from "./lib/chromium-private-memory.mjs";
import { createIndependentBlinkSessions } from "./lib/independent-blink-sessions.mjs";
import { startNativeBudgetFailureObserver } from "./lib/native-budget-failure-observer.mjs";
import { makeDetailedBlinkAttribution } from "./lib/largest-blink-attribution-recipe.mjs";
import { observeOwnedProcessExit, queryProcessIdentity } from "./lib/owned-process-exit-observation.mjs";
const root = path.resolve(import.meta.dirname, ".."), exec = promisify(execFile), MiB = 1048576;
const sha = bytes => createHash("sha256").update(bytes).digest("hex"), pause = ms => new Promise(resolve => setTimeout(resolve, ms));
const original = await readFile(path.join(root, "scripts/mpeg2-split-single-navigation-memory.mjs"), "utf8");
assert.equal(sha(original), "acb179454985fdc2167f9e463d1d720b777d4c829d313d8e3ee45fdf82ff3417");
const spawnText = original.slice(original.indexOf("chrome = spawn("), original.indexOf("observer = await startParallelMemoryObserver"));
const argsText = spawnText.slice(spawnText.indexOf("["), spawnText.lastIndexOf("], {"));
const flags = [...argsText.matchAll(/"([^"\n]*)"|`--user-data-dir=\$\{profile\}`/g)].map(match => match[1] ?? "PROFILE");
assert.equal(flags.length, 14); assert.equal(flags.at(-1), "about:blank");
let runtime, chrome, browser, realms, page, observer, attribution, blankBaseline = null, native = null, capture = null;
let traceReport = null, failure = null, version = null, generatedHelper = null, identity = null, traceStarts = 0;
let traceStartsBeforeAllocation = null, allocationStartedAt = null, rootExitObservation = null;
const rows = [], errors = [];
const cleanup = { syntheticReferenceRemoved: false, traceStopped: false, nativeObserverStopped: false,
  realmSocketClosed: false, ownedBrowserBirthAbsent: false, runtimeRemoved: false };
try {
  const disk = await statfs(root); assert.ok(disk.bavail * disk.bsize >= 512 * MiB);
  const host = await exec("powershell.exe", ["-NoProfile", "-NonInteractive", "-Command",
    "$ErrorActionPreference = 'Stop'; (Get-CimInstance Win32_OperatingSystem).FreePhysicalMemory"], { windowsHide: true, timeout: 15000 });
  assert.ok(Number(host.stdout.trim()) * 1024 >= 2 * 1024 ** 3, "At least2GiB available host RAM required for the264MiB synthetic diagnostic");
  runtime = await createOwnedRuntimeScratch("budget-failure-control-");
  generatedHelper = makeDetailedBlinkAttribution(await readFile(path.join(root, "scripts/lib/bounded-renderer-attribution.mjs"), "utf8"), root);
  const helper = path.join(runtime.directory, "attribution.mjs"); await writeFile(helper, generatedHelper, { flag: "wx" });
  const { startBoundedRendererAttribution } = await import(pathToFileURL(helper).href);
  const profile = path.join(runtime.directory, "profile"); await mkdir(profile);
  chrome = spawn("C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe",
    flags.map(value => value === "PROFILE" ? `--user-data-dir=${profile}` : value),
    { cwd: root, env: runtime.env, windowsHide: true, stdio: "ignore" });
  let port = null; const startupDeadline = Date.now() + 30000;
  while (!port && Date.now() < startupDeadline) {
    try { port = Number((await readFile(path.join(profile, "DevToolsActivePort"), "utf8")).split(/\r?\n/)[0]); } catch { /* startup only */ }
    if (!port) await pause(100);
  }
  assert.ok(port); browser = await chromium.connectOverCDP(`http://127.0.0.1:${port}`);
  page = browser.contexts()[0].pages()[0]; assert.equal(page.url(), "about:blank");
  version = await (await fetch(`http://127.0.0.1:${port}/json/version`)).json();
  realms = await connectRealmSampler(version.webSocketDebuggerUrl, "http://127.0.0.1:1");
  observer = await startNativeBudgetFailureObserver(chrome.pid, runtime.directory, {
    getBlankBaseline: () => blankBaseline,
    onFailure: async event => {
      assert.equal(traceStarts, 0); traceStarts++;
      attribution = createIndependentBlinkSessions({ createSession: () => browser.newBrowserCDPSession(), startAttribution: startBoundedRendererAttribution, realms });
      return attribution.dump("native-budget-failure-" + event.after.sequence, event.after.processes);
    },
  });
  const started = Date.now(), stableDeadline = started + 30000;
  while (!blankBaseline && Date.now() < stableDeadline) {
    const tree = await sampleChromiumTree(chrome.pid); identity ??= tree.processes.find(p => p.pid === chrome.pid);
    assert.ok(rows.length < 24); rows.push({ ...tree, timestamp: new Date().toISOString(), elapsedMs: Date.now() - started });
    blankBaseline = stableWindow(rows); if (!blankBaseline) await pause(1000);
  }
  assert.ok(blankBaseline && identity); assert.equal(traceStarts, 0);
  traceStartsBeforeAllocation = traceStarts; assert.equal(observer.failureCaptureReport().callback, null);
  const phaseAt = observer.setPhase("conversion-synthetic-control"); await observer.through(phaseAt);
  allocationStartedAt = Date.now();
  await page.evaluate(() => {
    // Fixed diagnostic storage, never input or output. Touch actual pages so the
    // OS primary private-memory metric can see the intentionally failed budget.
    globalThis.__budgetFailureControl = new Uint8Array(264 * 1048576);
    for (let at = 0; at < globalThis.__budgetFailureControl.length; at += 4096) globalThis.__budgetFailureControl[at] = 1;
  });
  const deadline = Date.now() + 20000;
  while (observer.failureCaptureReport().callback?.status !== "completed" && Date.now() < deadline) {
    observer.healthy(); await pause(25);
  }
  capture = await observer.finishCapture();
  assert.equal(capture.callback?.status, "completed"); assert.equal(capture.callback.result.success, true);
  assert.ok(capture.firstFailure.incrementalPrivateMiB > 250); assert.equal(traceStarts, 1);
  assert.ok(Date.parse(capture.firstFailure.after.timestamp) >= allocationStartedAt);
  traceReport = await attribution.stop(); assert.equal(traceReport.status, "completed-diagnostic");
  assert.equal(traceReport.sessions.length, 1); cleanup.traceStopped = true;
  assert.equal(traceReport.sessions[0].trace.trace.dataLossOccurred, false);
  await observer.through(Date.now());
} catch (error) { failure = String(error); process.exitCode = 1; }
finally {
  const attempt = async fn => { try { await fn(); } catch (error) { errors.push(String(error)); process.exitCode = 1; } };
  await attempt(async () => { if (observer) capture = await observer.finishCapture(); });
  await attempt(async () => { if (attribution) { traceReport ??= await attribution.stop(); cleanup.traceStopped = true; } });
  await attempt(async () => { if (page && !page.isClosed()) { await page.evaluate(() => { delete globalThis.__budgetFailureControl; }); cleanup.syntheticReferenceRemoved = true; } });
  await attempt(async () => { if (observer) { await observer.stop(); native = observer.report(); cleanup.nativeObserverStopped = true; capture = observer.failureCaptureReport(); } });
  await attempt(async () => { if (realms) { await realms.close(); cleanup.realmSocketClosed = true; } });
  await attempt(() => browser?.close());
  await attempt(async () => {
    if (identity && chrome?.exitCode == null && chrome?.signalCode == null) {
      const current = await queryProcessIdentity(identity.pid);
      if (current && current.parentPid === identity.parentPid && Date.parse(current.createdAt) === Date.parse(identity.createdAt))
        await exec("taskkill.exe", ["/PID", String(identity.pid), "/T", "/F"], { windowsHide: true, timeout: 15000 });
    }
    if (identity) { rootExitObservation = await observeOwnedProcessExit(identity); assert.equal(rootExitObservation.status, "owned-identity-absent"); cleanup.ownedBrowserBirthAbsent = true; }
  });
  await attempt(async () => { if (runtime) { await runtime.close(); await assert.rejects(access(runtime.directory), { code: "ENOENT" }); cleanup.runtimeRemoved = true; } });
  const files = ["scripts/probe-native-budget-failure.mjs", "scripts/lib/native-budget-failure-observer.mjs",
    "scripts/lib/independent-blink-sessions.mjs", "scripts/lib/parallel-memory-observer.mjs", "scripts/lib/native-memory-peaks.mjs",
    "scripts/lib/persistent-chromium-memory.mjs", "scripts/lib/native-memory-bursts.mjs", "scripts/lib/windows-tree-monitor.cs",
    "scripts/lib/windows-tree-monitor.ps1", "scripts/lib/owned-process-exit-observation.mjs", "scripts/lib/owned-runtime-scratch.mjs",
    "scripts/lib/chromium-private-memory.mjs", "scripts/lib/cdp-realm-memory.mjs", "scripts/lib/bounded-renderer-attribution.mjs",
    "scripts/lib/largest-blink-attribution-recipe.mjs", "scripts/lib/largest-blink-type-summary.mjs", "scripts/lib/bounded-detailed-blink-type-summary.mjs",
    "scripts/lib/complete-blink-heap-summary.mjs", "scripts/lib/memory-infra-attribution.mjs", "scripts/mpeg2-split-single-navigation-memory.mjs"];
  const proof = { recordedAt: new Date().toISOString(), scope: "actual-single-post250MiB-native-failure-synthetic-blank-control-not-converter",
    status: failure || errors.length || Object.values(cleanup).some(v => v !== true) ? "failed-diagnostic" : "completed-diagnostic",
    failure, errors, browserVersion: version?.Browser ?? null, flags, identicalOriginalFlags: true,
    generatedHelper, generatedHelperSha256: generatedHelper && sha(generatedHelper),
    sourcePins: Object.fromEntries(await Promise.all(files.map(async file => [file, sha(await readFile(path.join(root, file)))]))),
    blankBaseline, traceStartsBeforeAllocation, traceStarts, allocationStartedAt, syntheticAllocationBytes: 264 * MiB,
    nativeFailureCapture: capture, nativeMemory: native, traceReport: traceReport && { ...traceReport,
      sessions: traceReport.sessions.map(row => ({ ...row, trace: row.trace && { ...row.trace, realmRows: row.trace.realmRows.length } })) },
    cleanup, rootExitObservation, runtimeDirectory: runtime?.directory ?? null, ownedPids: { chrome: chrome?.pid ?? null, observer: observer?.pid ?? null },
    originalRead: false, converterLoaded: false, conversionsPerformed: 0, generatedMediaCopies: 0,
    publicAcceptance: false, completeChromiumMemoryAcceptance: false, conversionSpeedAcceptance: false,
    noForcedGc: true, originalFailureCause: null,
    caveat: "264MiB touched SYNTHETIC diagnostic storage intentionally exceeds the unchanged250MiB native trigger. No user media/converter/stream-copy/native conversion. Short blank baseline is CONTROL ONLY, not the original five-minute lower denominator or acceptance. ONE detailed trace begins AFTER actual native failure; full native sampling continues through trace drain. Reference removal is not a forced collection or proof of reclaimed live bytes." };
  const json = JSON.stringify(proof, null, 2) + "\n"; assert.ok(Buffer.byteLength(json) <= 2 * MiB);
  const file = path.join(root, "evidence/native-budget-failure-control-2026-10-07.json"); await writeFile(file, json, { flag: "wx" });
  console.log(JSON.stringify({ file, status: proof.status, failure, errors, startsBeforeAllocation: traceStartsBeforeAllocation,
    traceStarts, triggerMiB: capture?.firstFailure?.incrementalPrivateMiB, cleanup }));
}
