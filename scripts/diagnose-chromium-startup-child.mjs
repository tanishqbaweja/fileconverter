// Precise changed diagnostic: identify the180-second child, not replay the old
// blank memory control or certify conversions. No media or production staging.
import assert from "node:assert/strict";
import { chromium } from "@playwright/test";
import { spawn } from "node:child_process";
import { createHash } from "node:crypto";
import { mkdir, readFile, statfs, writeFile } from "node:fs/promises";
import path from "node:path";
import { setTimeout as pause } from "node:timers/promises";
import { gzipSync, gunzipSync } from "node:zlib";
import { createOwnedRuntimeScratch } from "./lib/owned-runtime-scratch.mjs";
import { finishOwnedCleanupPhases } from "./lib/phased-owned-cleanup.mjs";
import { describeOwnedCleanupError } from "./lib/bounded-cleanup-error.mjs";
import { inspectStressHostMemory } from "./lib/host-memory-preflight.mjs";
import { inspectInstalledChromePin, assertInstalledChromePinsEqual } from "./lib/installed-chrome-pin.mjs";
import { startChromiumMemoryMonitor } from "./lib/persistent-chromium-memory.mjs";
import { queryProcessIdentity, observeOwnedProcessExit } from "./lib/owned-process-exit-observation.mjs";
import { joinStartupChildMetadata, STARTUP_CHILD_LIMITS as limits } from "./lib/chromium-startup-child-capture.mjs";

assert.equal(process.platform, "win32");
const root = path.resolve(import.meta.dirname, ".."), sha = bytes => createHash("sha256").update(bytes).digest("hex");
const stamp = new Date().toISOString().replaceAll(":", "-"), base = `output/playwright/chromium-startup-child-${stamp}`;
const sourceFiles = ["scripts/diagnose-chromium-startup-child.mjs", "scripts/lib/chromium-startup-child-metadata.ps1",
  "scripts/lib/chromium-startup-child-capture.mjs", "scripts/lib/persistent-chromium-memory.mjs", "scripts/lib/windows-tree-monitor.cs",
  "scripts/lib/windows-tree-monitor.ps1", "scripts/lib/owned-runtime-scratch.mjs", "scripts/lib/phased-owned-cleanup.mjs",
  "scripts/lib/owned-process-exit-observation.mjs", "scripts/lib/installed-chrome-pin.mjs"];
const sourcePins = Object.fromEntries(await Promise.all(sourceFiles.map(async file => [file, sha(await readFile(path.join(root, file)))])));
const report = { scope: "Blank-browser startup child identity only; no conversion, application, new acceptance baseline or public acceptance",
  publicAcceptance: false, conversionsPerformed: 0, inputFilesSelected: 0, originalRead: false, limits, sourcePins, cleanupPhases: [] };
const host = await inspectStressHostMemory(); assert.equal(host.safeToStart, true); report.host = host;
const disk = await statfs(root); assert.ok(disk.bavail * disk.bsize >= 512 * 1024 ** 2);
let context, monitor, rootIdentity, helperIdentity, helper, helperExit, runtime, failure;
let helperOut = "", helperErr = "", helperError, browserBirth, browserPid;
let browserAbsent = false, helperAbsent = false;
const samples = [], events = [];
const browserPin = await inspectInstalledChromePin(); report.browserPin = browserPin;
const drain = async () => {
  const batch = await monitor.drain(); assert.ok(samples.length + batch.samples.length <= limits.maximumSamples);
  samples.push(...batch.samples); return batch;
};
try {
  runtime = await createOwnedRuntimeScratch("startup-child-");
  context = await chromium.launchPersistentContext(path.join(runtime.directory, "profile"), {
    executablePath: browserPin.launcher.path, headless: true, env: runtime.env, serviceWorkers: "block" });
  report.runtime = runtime.directory; report.browserVersion = context.browser().version();
  const session = await context.browser().newBrowserCDPSession();
  try { browserPid = (await session.send("SystemInfo.getProcessInfo")).processInfo.find(row => row.type === "browser").id; }
  finally { await session.detach(); }
  rootIdentity = await queryProcessIdentity(browserPid); assert.ok(rootIdentity); report.browserIdentity = rootIdentity;
  monitor = await startChromiumMemoryMonitor(browserPid, runtime.directory, 100);
  await pause(150); await drain();
  browserBirth = samples.find(row => row.processes?.some(p => p.pid === browserPid)).processes.find(p => p.pid === browserPid).creationFileTime;
  report.browserCreationFileTime = browserBirth;
  helper = spawn("powershell.exe", ["-NoProfile", "-NonInteractive", "-File", path.join(root, "scripts/lib/chromium-startup-child-metadata.ps1"),
    "-RootPid", String(browserPid), "-RootCreatedFileTime", browserBirth], { cwd: root, env: runtime.env, windowsHide: true, stdio: ["ignore", "pipe", "pipe"] });
  helperExit = new Promise((resolve, reject) => { helper.once("error", reject); helper.once("close", resolve); }); helperExit.catch(() => {});
  helper.stdout.on("data", chunk => { helperOut += chunk.toString(); if (Buffer.byteLength(helperOut) > limits.maximumStdoutBytes) {
    helperError ??= new Error("Child metadata stdout cap"); helper.kill(); } });
  helper.stderr.on("data", chunk => { helperErr = (helperErr + chunk.toString()).slice(-8192); });
  helperIdentity = await queryProcessIdentity(helper.pid); assert.ok(helperIdentity); report.helperIdentity = helperIdentity;
  const bornMs = Number((BigInt(browserBirth) - 116444736000000000n) / 10000n);
  console.log(JSON.stringify({ status: "waiting-for-known-startup-window", browserPid, bornMs,
    expectedCaptureAt: new Date(bornMs + limits.beginMs).toISOString(), estimatedRemainingMs: bornMs + limits.endMs - Date.now(), report: base + ".json" }));
  while (Date.now() < bornMs + limits.endMs + 3000) {
    await pause(500); await drain();
    if (helperError) throw helperError;
    if (helper.exitCode !== null) break;
  }
  assert.ok(helper.exitCode !== null, "Bounded child capture did not finish"); assert.equal(await helperExit, 0, helperErr);
  for (const line of helperOut.trim().split(/\r?\n/)) { assert.ok(Buffer.byteLength(line) <= 32768); events.push(JSON.parse(line)); }
  assert.ok(events.length <= limits.maximumMetadataRows + 2); assert.equal(events[0].event, "ready");
  const completed = events.at(-1); assert.equal(completed.event, "complete"); assert.ok(completed.queries > 0 && completed.queries <= limits.maximumQueries);
  report.children = joinStartupChildMetadata(samples, events, browserPid, browserBirth);
  assert.ok(report.children.some(row => row.nativeIdentityMatched), "No birth-matched startup child captured");
  for (const page of context.pages()) assert.equal(page.url(), "about:blank");
  report.status = "captured-startup-child-identity-not-conversion-acceptance";
} catch (error) { failure = error; report.status = "failed-startup-child-diagnostic"; report.failure = describeOwnedCleanupError(error); process.exitCode = 1; }
finally {
  try {
    await finishOwnedCleanupPhases([
      { name: "observer-closure", actions: [async () => { if (monitor) { try { await drain(); } finally { await monitor.close(); monitor = undefined; } } }] },
      { name: "process-closure", actions: [async () => {
        if (helper && helper.exitCode === null && helper.signalCode === null) {
          const current = await queryProcessIdentity(helper.pid); assert.deepEqual(current, helperIdentity, "Metadata helper identity changed"); helper.kill();
        }
        if (helperExit) await helperExit.catch(() => {});
        helperAbsent = !helperIdentity || (await observeOwnedProcessExit(helperIdentity)).status === "owned-identity-absent";
        assert.ok(helperAbsent);
      }, async () => {
        if (context) { await context.close(); context = undefined; }
        report.browserExit = rootIdentity ? await observeOwnedProcessExit(rootIdentity) : null;
        browserAbsent = !rootIdentity || report.browserExit.status === "owned-identity-absent"; assert.ok(browserAbsent);
      }] },
      { name: "executed-source-verification", actions: [async () => {
        for (const [file, hash] of Object.entries(sourcePins)) assert.equal(sha(await readFile(path.join(root, file))), hash, file);
        assertInstalledChromePinsEqual(browserPin, await inspectInstalledChromePin()); report.executedSourcesAndBrowserVerified = true;
      }] },
      { name: "disposable-files", actions: [async () => { if (runtime) { assert.ok(browserAbsent && helperAbsent); await runtime.close(); } }] },
    ], report.cleanupPhases);
  } catch (error) { failure ??= error; report.cleanupFailure = describeOwnedCleanupError(error); process.exitCode = 1; }
  report.disposableDataRemoved = report.cleanupPhases.some(row => row.name === "disposable-files" && row.status === "passed");
  report.samples = samples.length; report.unavailableSamples = samples.filter(row => row.privateBytes === null).length;
  report.metadataEvents = events;
  report.peakPrivateBytes = samples.reduce((max, sample) => sample.privateBytes === null ? max : Math.max(max ?? 0, sample.privateBytes), null);
  const raw = Buffer.from(JSON.stringify({ samples, metadataEvents: events }) + "\n"); assert.ok(raw.length <= 16 * 1024 ** 2);
  const zip = gzipSync(raw, { level: 9 }); assert.deepEqual(gunzipSync(zip), raw);
  await mkdir(path.join(root, "output/playwright"), { recursive: true });
  const archive = base + "-raw.json.gz"; await writeFile(path.join(root, archive), zip, { flag: "wx" });
  report.archive = { path: archive, bytes: zip.length, sha256: sha(zip), restoredBytes: raw.length, restoredSha256: sha(raw) };
  await writeFile(path.join(root, base + ".json"), JSON.stringify(report, null, 2) + "\n", { flag: "wx" });
  console.log(JSON.stringify({ report: base + ".json", status: report.status, children: report.children, disposableDataRemoved: report.disposableDataRemoved, failure: failure ? String(failure) : null }));
}
