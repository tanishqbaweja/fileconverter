/* Changed 100-ms read-only observer control. No media, conversion or engine staging.
 * A blank-page utility peak is NOT a substitute/later/larger acceptance baseline. */
import assert from "node:assert/strict";
import { chromium } from "@playwright/test";
import { execFile, spawn } from "node:child_process";
import { createHash } from "node:crypto";
import { lstat, mkdir, mkdtemp, readFile, realpath, rm, statfs, writeFile } from "node:fs/promises";
import path from "node:path";
import { promisify } from "node:util";
import { startChromiumMemoryMonitor } from "./lib/persistent-chromium-memory.mjs";
import { sampleChromiumTree, stableWindow } from "./lib/chromium-private-memory.mjs";

const root = path.resolve(import.meta.dirname, ".."), exec = promisify(execFile);
const delay = (ms) => new Promise((resolve) => setTimeout(resolve, ms));
const sha = (bytes) => createHash("sha256").update(bytes).digest("hex");
const stamp = new Date().toISOString().replaceAll(/[:.]/g, "-");
const reportBase = `outputs/reports/${stamp}-fast-chromium-blank-control`;
const samples = [], baselineCandidates = [], cimComparisons = [], metadata = new Map();
const disk = await statfs(root); assert.ok(disk.bavail * disk.bsize > 512 * 1024 ** 2);
let work, chrome, browser, monitor, baseline, failure = null, browserVersion;
let cpuStart, cpuEnd, observerStartedAt, browserStartedAt, cleanupComplete = false;
const annotate = (sample) => {
  for (const row of sample.processes ?? []) {
    const detail = metadata.get(`${row.pid}:${Date.parse(row.createdAt)}`);
    if (detail) Object.assign(row, detail);
  }
  return sample;
};
async function drain() {
  const batch = await monitor.drain(); cpuStart ??= batch.observerCpuMs; cpuEnd = batch.observerCpuMs;
  for (const sample of batch.samples) samples.push(annotate({ ...sample, phase: "blank-only",
    browserAgeMs: Date.parse(sample.timestamp) - browserStartedAt }));
  assert.ok(samples.length <= 3000, "Bounded native diagnostic history");
}
try {
  work = await mkdtemp(path.join(root, "work/chromium-fast-control-"));
  const profile = path.join(work, "profile"), temporary = path.join(work, "temp");
  await mkdir(profile); await mkdir(temporary);
  browserStartedAt = Date.now();
  chrome = spawn("C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe", ["--headless=new", "--remote-debugging-port=0",
    `--user-data-dir=${profile}`, "--no-first-run", "--no-default-browser-check", "--disable-background-networking",
    "--disable-component-update", "--disable-default-apps", "--disable-domain-reliability", "--disable-extensions",
    "--disable-features=MediaRouter,OptimizationGuideModelDownloading,OptimizationHints,OptimizationTargetPrediction",
    "--disable-sync", "--metrics-recording-only", "about:blank"],
  { cwd: root, env: { ...process.env, TEMP: temporary, TMP: temporary }, windowsHide: true, stdio: "ignore" });
  monitor = await startChromiumMemoryMonitor(chrome.pid, temporary); observerStartedAt = Date.now();
  const deadline = browserStartedAt + 240000;
  let port;
  while (Date.now() < browserStartedAt + 30000) {
    try { port = Number((await readFile(path.join(profile, "DevToolsActivePort"), "utf8")).split(/\r?\n/)[0]); if (port) break; } catch { /* bounded launch */ }
    await delay(100); await drain();
  }
  assert.ok(port);
  browser = await chromium.connectOverCDP(`http://127.0.0.1:${port}`);
  browserVersion = browser.version();
  const page = browser.contexts()[0].pages()[0]; assert.equal(page.url(), "about:blank");
  const born = Date.now();
  while (Date.now() < deadline) {
    await drain();
    const last = samples.at(-1);
    if (!baseline) {
      baselineCandidates.push({ ...last, elapsedMs: Date.now() - born });
      baseline = stableWindow(baselineCandidates);
      if (baseline) process.stdout.write(`EARLY blank diagnostic baseline ${(baseline.privateBytes / 1024 ** 2).toFixed(3)} MiB; never replaced.\n`);
      assert.ok(baseline || Date.now() - born < 45000, "No delayed/larger baseline fallback");
    }
    // Five slow reference queries only, after the EARLY baseline is fixed.
    // Independent native thread keeps sampling throughout each CIM query.
    if (baseline && cimComparisons.length < 5) {
      const startedAt = Date.now(); let tree, error = null;
      try { tree = await sampleChromiumTree(chrome.pid); }
      catch (e) { tree = { privateBytes: null, rssBytes: null, processes: null }; error = String(e); }
      const completedAt = Date.now();
      for (const row of tree.processes ?? []) metadata.set(`${row.pid}:${Date.parse(row.createdAt)}`,
        { type: row.type, utilitySubtype: row.utilitySubtype, sandboxType: row.sandboxType });
      assert.ok(metadata.size <= 128);
      cimComparisons.push({ startedAt, completedAt, durationMs: completedAt - startedAt, tree, error });
      await drain();
    }
    await delay(1000);
  }
  await drain();
  assert.ok(baseline?.stable);
  assert.ok(samples.filter((s) => s.privateBytes != null).length >= 2000);
  assert.ok(samples.some((s) => s.browserAgeMs > 230000));
  assert.equal(page.url(), "about:blank");
} catch (error) { failure = { name: error.name, message: error.message, stack: error.stack }; process.exitCode = 1; }
finally {
  await monitor?.close();
  await browser?.close().catch(() => {});
  if (chrome?.pid && chrome.exitCode == null && chrome.signalCode == null) {
    await exec("taskkill.exe", ["/PID", String(chrome.pid), "/T", "/F"], { windowsHide: true }).catch(() => {});
  }
  if (work) {
    assert.equal(path.dirname(work), path.join(root, "work")); assert.equal((await lstat(work)).isSymbolicLink(), false);
    assert.equal(await realpath(work), path.join(await realpath(path.join(root, "work")), path.basename(work)));
    await rm(work, { recursive: true, force: true, maxRetries: 5, retryDelay: 500 }); cleanupComplete = true;
  }
  const valid = samples.filter((s) => s.privateBytes != null), gaps = valid.slice(1).map((s, i) => Date.parse(s.timestamp) - Date.parse(valid[i].timestamp));
  const peak = valid.reduce((p, s) => p == null || s.privateBytes > p.privateBytes ? s : p, null);
  const processIdentities = new Map();
  for (const s of valid) for (const p of s.processes) {
    const key = `${p.pid}:${p.creationFileTime}`, prior = processIdentities.get(key);
    if (!prior || p.privateBytes > prior.peakPrivateBytes) processIdentities.set(key,
      { ...p, peakPrivateBytes: p.privateBytes, peakBrowserAgeMs: s.browserAgeMs, peakTimestamp: s.timestamp,
        observedSamples: (prior?.observedSamples ?? 0) + 1 });
    else prior.observedSamples++;
  }
  const sourceHashes = Object.fromEntries(await Promise.all([
    "scripts/diagnose-fast-chromium-memory.mjs", "scripts/lib/persistent-chromium-memory.mjs",
    "scripts/lib/windows-tree-monitor.cs", "scripts/lib/windows-tree-monitor.ps1", "scripts/lib/chromium-private-memory.mjs",
  ].map(async (file) => [file, sha(await readFile(path.join(root, file)))])));
  const nativeMs = valid.map((s) => s.nativeElapsedMs).sort((a,b) => a-b);
  const report = { recordedAt: new Date().toISOString(), status: failure ? "failed-diagnostic" : "completed-diagnostic",
    scope: "Changed 100-ms native read-only OS observer on blank Chrome; no file, conversion, production site, engine staging or public acceptance; never a replacement/larger acceptance baseline",
    browserVersion, intervalMs: 100, browserStartedAt, observerStartedAt, baseline, samples, cimComparisons,
    sourceHashes, failure, publicAcceptance: false, peak, processPeaks: [...processIdentities.values()],
    observer: { pid: monitor?.pid, cpuDeltaMs: cpuEnd - cpuStart, observedWallMs: Date.now() - observerStartedAt,
      medianNativeDurationMs: nativeMs[Math.floor(nativeMs.length / 2)] ?? null, maximumNativeDurationMs: nativeMs.at(-1) ?? null,
      maximumValidSampleGapMs: Math.max(0, ...gaps), unavailableSamples: samples.length - valid.length },
    cleanup: { repositoryLocalProfileAndCompilerScratchRemoved: cleanupComplete, observerStopped: true,
      inputFilesSelected: 0, conversionsPerformed: 0, privateEngineStaged: false } };
  await mkdir(path.dirname(path.join(root, reportBase)), { recursive: true });
  await writeFile(path.join(root, `${reportBase}.json`), `${JSON.stringify(report, null, 2)}\n`, { flag: "wx" });
  await writeFile(path.join(root, `${reportBase}.csv`), "timestamp,privateBytes,rssBytes,nativeElapsedMs,sampleError\n" + samples.map((s) =>
    [s.timestamp, s.privateBytes ?? "", s.rssBytes ?? "", s.nativeElapsedMs, s.sampleError ?? ""].join(",")).join("\n") + "\n", { flag: "wx" });
  process.stdout.write(`${JSON.stringify({ report: `${reportBase}.json`, status: report.status, samples: samples.length,
    observer: report.observer, failure, peakPrivateMiB: peak?.privateBytes / 1024 ** 2 }, null, 2)}\n`);
}
