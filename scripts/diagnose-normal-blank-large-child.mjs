// Four-minute normal-service BLANK control only. No app, server, files, engine,
// conversion, disabled features, altered acceptance baseline or public claim.
import "./lib/hidden-unit-subprocesses.mjs";
import assert from "node:assert/strict";
import { spawn } from "node:child_process";
import { readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import { setTimeout as pause } from "node:timers/promises";
import { createHash } from "node:crypto";
import { gzipSync } from "node:zlib";
import { chromium } from "playwright";
import { createOwnedRuntimeScratch } from "./lib/owned-runtime-scratch.mjs";
import { inspectInstalledChromePin } from "./lib/installed-chrome-pin.mjs";
import { queryReliableProcessIdentity } from "./lib/reliable-owned-identity.mjs";
import { startClassifiedChromiumMemoryMonitor } from "./lib/birth-type-capture.mjs";
import { sampleChromiumTree, stableWindow } from "./lib/chromium-private-memory.mjs";
import { cleanupOwnedChromium } from "./lib/owned-chromium-cleanup.mjs";
import { matchOwnedBurstRole } from "./lib/owned-burst-role.mjs";
import { inspectStressHostMemory } from "./lib/host-memory-preflight.mjs";
const root = path.resolve(import.meta.dirname, ".."), stamp = new Date().toISOString().replaceAll(/[:.]/g, "-"), prefix = `evidence/${stamp}-normal-blank-large-child`;
const runtime = await createOwnedRuntimeScratch("normal-blank-child-");
const report = { scope: "four-minute-normal-services-blank-child-role-control-not-conversion-or-acceptance", durationMs: 240000,
  status: "running", converterLoaded: false, inputsSelected: 0, conversionsPerformed: 0, publicAcceptance: false,
  baselineReplaced: false, featuresDisabled: false, roles: [], failures: [] };
const samples = [], attempted = new Set(); let chrome, identity, monitor, browser, pending = null;
let baselineBirths;
const key = p => `${p.pid}:${p.creationFileTime}`;
const sha = b => createHash("sha256").update(b).digest("hex");
try {
  report.hostPreflight = await inspectStressHostMemory(); assert.equal(report.hostPreflight.safeToStart, true);
  const pin = await inspectInstalledChromePin(), profile = path.join(runtime.directory, "profile"); report.browser = pin;
  report.launch = ["--headless=new", "--remote-debugging-port=0", `--user-data-dir=${profile}`, "--no-first-run", "--no-default-browser-check", "about:blank"];
  chrome = spawn(pin.launcher.path, report.launch, { cwd: root, env: runtime.env, windowsHide: true, stdio: "ignore" });
  identity = await queryReliableProcessIdentity(chrome.pid); assert.ok(identity); report.identity = identity;
  monitor = await startClassifiedChromiumMemoryMonitor(chrome.pid, runtime.directory, 100);
  let port;
  for (let n = 0; n < 45 && !port; n++) {
    try { port = (await readFile(path.join(profile, "DevToolsActivePort"), "utf8")).split(/\r?\n/)[0]; }
    catch (error) { if (error.code !== "ENOENT") throw error; }
    if (!port) await pause(250);
  }
  assert.match(port, /^\d+$/); browser = await chromium.connectOverCDP(`http://127.0.0.1:${port}`);
  const page = browser.contexts()[0].pages()[0]; assert.equal(page.url(), "about:blank");
  const start = Date.now(); report.observationStartedAt = start;
  while (Date.now() - start < report.durationMs) {
    assert.equal(page.url(), "about:blank");
    const batch = await monitor.drain(); assert.equal(batch.overflow, false);
    assert.ok(samples.length + batch.samples.length <= 4000); samples.push(...batch.samples);
    if (!report.earlyBlank) report.earlyBlank = stableWindow(samples.map(s => ({ ...s, elapsedMs: Date.parse(s.timestamp) })));
    if (report.earlyBlank && !baselineBirths) baselineBirths = new Set(samples.flatMap(s => (s.processes ?? []).map(key)));
    const latest = batch.samples.findLast(s => Array.isArray(s.processes));
    if (baselineBirths && latest && !pending && attempted.size < 4) {
      const child = latest.processes.find(p => p.pid !== chrome.pid && !baselineBirths.has(key(p)) && !attempted.has(key(p)) && p.privateBytes >= 64 * 1048576);
      if (child) {
        attempted.add(key(child));
        const row = { observedAt: latest.timestamp, nativeBirth: child, requestedAt: Date.now(), result: null, error: null };
        report.roles.push(row);
        pending = sampleChromiumTree(chrome.pid).then(tree => { row.result = matchOwnedBurstRole(identity, child, tree); })
          .catch(error => { row.error = String(error).slice(0, 1024); }).finally(() => { row.completedAt = Date.now(); pending = null; });
      }
    }
    await pause(500);
  }
  await pending; assert.equal(page.url(), "about:blank");
  report.actualObservationMs = Date.now() - start;
  report.status = "completed-blank-role-diagnostic-not-conversion-acceptance";
} catch (error) { report.status = "failed-blank-diagnostic"; report.failures.push(String(error.stack ?? error).slice(0, 2048)); }
finally {
  await pending;
  const attempt = async action => { try { await action(); } catch (error) { report.status = "failed-blank-diagnostic"; report.failures.push(String(error).slice(0, 2048)); } };
  if (monitor) {
    await attempt(async () => { const batch = await monitor.drain(); assert.equal(batch.overflow, false); samples.push(...batch.samples); });
    await attempt(async () => { await monitor.close(); report.observer = monitor.ownershipSummary(); });
  }
  await attempt(async () => {
    assert.ok(identity, "No unverified process ownership cleanup");
    report.browserCleanup = await cleanupOwnedChromium({ identity,
      observedPids: [...new Set([identity.pid, ...samples.flatMap(s => (s.processes ?? []).map(p => p.pid))])], disconnect: async () => { await browser?.close(); } });
    assert.equal(report.browserCleanup.status, "owned-observed-pids-absent");
  });
  await attempt(async () => { assert.equal(report.browserCleanup?.status, "owned-observed-pids-absent"); await runtime.close(); report.runtimeRemoved = true; });
  const valid = samples.filter(s => s.privateBytes !== null && Array.isArray(s.processes));
  for (const s of valid) assert.equal(s.processes.reduce((n, p) => n + p.privateBytes, 0), s.privateBytes);
  const peak = valid.reduce((a, b) => !a || a.privateBytes < b.privateBytes ? b : a, null);
  report.memory = { peak, incrementalOverEarlyBlankMiB: peak && report.earlyBlank ? (peak.privateBytes - report.earlyBlank.privateBytes) / 1048576 : null,
    acceptanceMetric: false, originalBaselineNotReplaced: true };
  const raw = Buffer.from(JSON.stringify(samples)), packed = gzipSync(raw), file = prefix + "-native.json.gz";
  await writeFile(path.join(root, file), packed, { flag: "wx" });
  report.archive = { file, sha256: sha(packed), decodedSha256: sha(raw), records: samples.length };
  report.sourcePins = {};
  for (const file of ["scripts/diagnose-normal-blank-large-child.mjs", "scripts/lib/owned-burst-role.mjs", "scripts/lib/birth-type-capture.mjs", "scripts/lib/chromium-private-memory.mjs"])
    report.sourcePins[file] = sha(await readFile(path.join(root, file)));
  await writeFile(path.join(root, prefix + ".json"), JSON.stringify(report, null, 2) + "\n", { flag: "wx" });
  console.log(JSON.stringify({ file: prefix + ".json", status: report.status, roles: report.roles.map(r => r.result), failures: report.failures }));
  if (report.status.startsWith("failed")) process.exitCode = 1;
}
