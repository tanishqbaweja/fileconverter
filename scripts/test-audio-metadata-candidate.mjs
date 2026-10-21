// Finite private qualification through the unchanged production UI/worker/I/O.
import "./lib/hidden-unit-subprocesses.mjs";
import assert from "node:assert/strict";
import { execFile, spawn } from "node:child_process";
import { createHash, randomUUID } from "node:crypto";
import { copyFile, lstat, mkdir, readFile, readdir, realpath, rm, statfs, writeFile } from "node:fs/promises";
import path from "node:path";
import { pathToFileURL } from "node:url";
import { promisify } from "node:util";
import { chromium } from "playwright";
import { auditAudioMetadataArtifact } from "./lib/audio-metadata-artifact.mjs";
import { createOwnedRuntimeScratch, finishOwnedCleanup } from "./lib/owned-runtime-scratch.mjs";
import { inspectStressHostMemory } from "./lib/host-memory-preflight.mjs";
import { inspectInstalledChromePin, assertInstalledChromePinsEqual } from "./lib/installed-chrome-pin.mjs";
import { queryProcessIdentity, observeOwnedProcessExit } from "./lib/owned-process-exit-observation.mjs";
import { startChromiumMemoryMonitor } from "./lib/persistent-chromium-memory.mjs";
import { stableWindow } from "./lib/chromium-private-memory.mjs";
const root = path.resolve(import.meta.dirname, ".."), exec = promisify(execFile), pause = ms => new Promise(resolve => setTimeout(resolve, ms));
assert.equal(process.argv.length, 3, "Pass one repository-owned candidate artifact directory");
const runtime = await createOwnedRuntimeScratch("audio-metadata-browser-");
const report = { startedAt: new Date().toISOString(), scope: "private25-field production-browser candidate qualification, not public promotion/full project",
  publicAcceptance: false, fullMetadataAcceptance: false, artworkAcceptance: false, scalingAcceptance: false, failures: [] };
const env = { ...runtime.env, NODE_OPTIONS: [process.env.NODE_OPTIONS ?? "", "--import=" + pathToFileURL(path.join(root, "scripts/lib/hidden-unit-subprocesses.mjs")).href].filter(Boolean).join(" "),
  WRANGLER_SEND_METRICS: "false", NEXT_TELEMETRY_DISABLED: "1" };
const sha = bytes => createHash("sha256").update(bytes).digest("hex"), staged = [], samples = [], identities = [];
const sourceFiles = ["scripts/test-audio-metadata-candidate.mjs", "scripts/lib/audio-metadata-artifact.mjs",
  "scripts/lib/persistent-chromium-memory.mjs", "scripts/lib/chromium-private-memory.mjs",
  "scripts/lib/owned-runtime-scratch.mjs", "tests/browser/audio-expanded-metadata.spec.ts", "playwright.config.ts"];
async function sourcePins() { return Object.fromEntries(await Promise.all(sourceFiles.map(async file => [file, sha(await readFile(path.join(root, file)))]))); }
let server, serverIdentity, browserServer, browser, monitor, timer, pending = Promise.resolve(), busy = false, monitorFailure, browserPin;
let serverLog = "";
const snapshot = async () => { const batch = await monitor.drain(); assert.ok(samples.length + batch.samples.length <= 3000);
  for (const sample of batch.samples) samples.push({ ...sample, elapsedMs: Date.parse(sample.timestamp) - Date.parse(report.startedAt) }); };
async function cleanupCaseLeases() {
  let contents;
  try { contents = await readFile(path.join(runtime.directory, "case-leases.jsonl"), "utf8"); }
  catch (error) { if (error.code === "ENOENT") return; throw error; }
  assert.ok(contents.length <= 8192); const lines = contents.trim().split("\n").filter(Boolean); assert.ok(lines.length <= 6);
  const work = await realpath(path.join(root, "work"));
  for (const line of lines) {
    const lease = JSON.parse(line), relative = path.relative(work, lease.directory);
    assert.ok(relative && !relative.startsWith("..") && !path.isAbsolute(relative) && path.dirname(lease.directory) === work);
    assert.ok(path.basename(lease.directory).startsWith("audio-expanded-metadata-"));
    let info;
    try { info = await lstat(lease.directory, { bigint: true }); } catch (error) { if (error.code === "ENOENT") continue; throw error; }
    assert.ok(info.isDirectory() && !info.isSymbolicLink()); assert.equal(info.dev.toString(), lease.dev); assert.equal(info.ino.toString(), lease.ino);
    assert.equal(await realpath(lease.directory), lease.directory); await rm(lease.directory, { recursive: true });
  }
}
try {
  report.executedSourcePins = await sourcePins();
  const disk = await statfs(root); assert.ok(disk.bavail * disk.bsize >= 2 * 1024 ** 3);
  report.hostMemory = await inspectStressHostMemory(); assert.equal(report.hostMemory.safeToStart, true);
  browserPin = await inspectInstalledChromePin(); report.browser = browserPin;
  report.artifact = await auditAudioMetadataArtifact(process.argv[2]);
  await exec(process.execPath, ["node_modules/vinext/dist/cli.js", "build"], { cwd: root, env, windowsHide: true, timeout: 180000, maxBuffer: 4 * 1024 ** 2 });
  for (const file of ["within-remux.mjs", "within-remux.wasm"]) {
    const target = path.join(root, "dist/client/engines/remux", file), backup = path.join(runtime.directory, file);
    const originalHash = sha(await readFile(target)); assert.equal(originalHash, sha(await readFile(path.join(root, "public/engines/remux", file))));
    await copyFile(target, backup);
    const row = { file, target, backup, originalHash, candidateHash: report.artifact.deliveredArtifacts[file], staged: false }; staged.push(row);
    await copyFile(path.join(report.artifact.directory, file), target); row.staged = true;
    const identity = await lstat(target, { bigint: true }); row.identity = { dev: identity.dev.toString(), ino: identity.ino.toString() };
    assert.equal(sha(await readFile(target)), row.candidateHash);
  }
  const port = 3219, base = `http://127.0.0.1:${port}`, { createServer } = await import("node:net"), probe = createServer();
  await new Promise((resolve, reject) => { probe.once("error", reject); probe.listen(port, "127.0.0.1", resolve); });
  await new Promise(resolve => probe.close(resolve));
  server = spawn(process.execPath, ["node_modules/wrangler/bin/wrangler.js", "dev", "--config", "dist/server/wrangler.json", "--port", String(port), "--persist-to", path.join(runtime.directory, "wrangler")],
    { cwd: root, env, windowsHide: true, stdio: ["pipe", "pipe", "pipe"] });
  serverIdentity = await queryProcessIdentity(server.pid); assert.ok(serverIdentity); identities.push(serverIdentity);
  for (const pipe of [server.stdout, server.stderr]) pipe.on("data", value => { serverLog = (serverLog + value.toString()).slice(-16384); });
  let ready = false;
  for (let attempt = 0; attempt < 60; attempt++) { assert.equal(server.exitCode, null, serverLog);
    try { if ((await fetch(base)).ok) { ready = true; break; } } catch {} await pause(500); }
  assert.ok(ready, serverLog);
  browserServer = await chromium.launchServer({ executablePath: browserPin.launcher.path, headless: true, env });
  const browserIdentity = await queryProcessIdentity(browserServer.process().pid); assert.ok(browserIdentity); identities.push(browserIdentity);
  browser = await chromium.connect(browserServer.wsEndpoint());
  const blankContext = await browser.newContext({ serviceWorkers: "block" }); await blankContext.newPage();
  monitor = await startChromiumMemoryMonitor(browserIdentity.pid, runtime.directory, 100);
  const monitorIdentity = await queryProcessIdentity(monitor.pid); assert.ok(monitorIdentity); identities.push(monitorIdentity);
  const observations = [], windows = [];
  for (let attempt = 0; attempt < 20; attempt++) { await pause(2100); await snapshot(); observations.push(samples.at(-1));
    const stable = stableWindow(observations, 8000); if (stable) windows.push(stable); if (windows.length >= 2) break; }
  assert.ok(windows.length >= 2); report.blankBaseline = windows.reduce((lower, value) => value.privateBytes < lower.privateBytes ? value : lower);
  report.baselineTopology = "One retained clean blank page; test contexts subsequently open in the same Chromium instance. All processes remain counted; no baseline replacement or GC.";
  const runToken = randomUUID(), descriptor = path.join(runtime.directory, "candidate.json");
  await writeFile(descriptor, JSON.stringify({ scope: report.artifact.scope, publicAcceptance: false, runToken,
    manifestSha256: report.artifact.manifestSha256, compiledSourceSha256: report.artifact.core.compiledSourceSha256,
    deliveredArtifacts: report.artifact.deliveredArtifacts, fixtures: report.artifact.fixtures }), { flag: "wx" });
  timer = setInterval(() => { if (busy) return; busy = true;
    pending = snapshot().catch(error => { monitorFailure ??= error; }).finally(() => { busy = false; }); }, 500);
  report.suiteStartedAt = new Date().toISOString();
  const artifactOutput = path.join(root, "output/playwright", report.startedAt.replaceAll(":", "-") + "-audio-metadata-candidate");
  try {
    const result = await exec(process.execPath, ["node_modules/@playwright/test/cli.js", "test", "tests/browser/audio-expanded-metadata.spec.ts", "--reporter=line", "--output=" + artifactOutput],
      { cwd: root, env: { ...env, WITHIN_TEST_PORT: String(port), WITHIN_REUSE_SERVER: "1", WITHIN_AUDIO_METADATA_CANDIDATE_RECEIPT: descriptor,
        WITHIN_AUDIO_METADATA_WS_ENDPOINT: browserServer.wsEndpoint() }, windowsHide: true, timeout: 240000, maxBuffer: 4 * 1024 ** 2 });
    report.suiteExitCode = 0; report.suiteLog = (result.stdout + result.stderr).slice(-16384);
  } catch (error) { report.suiteExitCode = error.code ?? null; report.suiteLog = String(error.stdout ?? "").slice(-16384) + String(error.stderr ?? "").slice(-4096); }
  report.suiteFinishedAt = new Date().toISOString(); clearInterval(timer); await pending; await snapshot(); await monitor.close(); monitor = null;
  assert.equal(monitorFailure, undefined);
  report.cases = [];
  for (const name of await readdir(path.join(root, "output/playwright"))) if (name.startsWith("audio-expanded-metadata-") && name.endsWith(".json")) {
    const bytes = await readFile(path.join(root, "output/playwright", name)); assert.ok(bytes.length <= 262144);
    const result = JSON.parse(bytes); if (result.privateCandidate?.runToken === runToken) report.cases.push({ path: "output/playwright/" + name, sha256: sha(bytes), result });
  }
  report.nativeSamples = samples;
  const suiteSamples = samples.filter(sample => sample.privateBytes !== null && Date.parse(sample.timestamp) >= Date.parse(report.suiteStartedAt));
  assert.ok(suiteSamples.length); const peak = suiteSamples.reduce((peak, value) => value.privateBytes > peak.privateBytes ? value : peak);
  report.memory = { scope: "small six-context suite only, not scaling/repeat/current whole-project acceptance", intervalMs: 100, peak,
    validSamples: samples.filter(sample => sample.privateBytes !== null).length, unavailableSamples: samples.filter(sample => sample.privateBytes === null),
    incrementalPrivateMiB: (peak.privateBytes - report.blankBaseline.privateBytes) / 1048576, limitMiB: 250 };
  assert.equal(report.suiteExitCode, 0, report.suiteLog); assert.equal(report.cases.length, 6);
  for (const row of report.cases) { assert.equal(row.result.status, "passed-private-candidate-metadata-check"); assert.equal(row.result.identicalBaselineFixtureVerified, true); }
  report.metadataFixVerifiedForSixSmallCases = true;
  report.postSourcePins = await sourcePins(); assert.deepEqual(report.postSourcePins, report.executedSourcePins);
  assertInstalledChromePinsEqual(browserPin, await inspectInstalledChromePin());
  assert.ok(report.memory.incrementalPrivateMiB <= 250, "Complete-tree private-memory gate failed");
  report.status = "passed-private-small-browser-metadata-qualification-not-promotion";
} catch (error) { report.status = "failed"; report.failures.push(String(error.stack ?? error)); report.serverLog = serverLog; }
finally {
  clearInterval(timer); await pending;
  await finishOwnedCleanup([
    async () => { if (monitor) await monitor.close(); },
    async () => { if (browser) await browser.close(); if (browserServer) await browserServer.close(); },
    async () => { if (server && server.exitCode === null) { assert.deepEqual(await queryProcessIdentity(server.pid), serverIdentity);
      await exec("taskkill.exe", ["/PID", String(server.pid), "/T", "/F"], { windowsHide: true, timeout: 15000, maxBuffer: 16384 }); } },
  ]).catch(error => { report.failures.push(String(error)); report.status = "failed"; });
  const cleanup = [];
  for (const identity of identities) cleanup.push(await observeOwnedProcessExit(identity));
  let restorationSucceeded = true;
  await finishOwnedCleanup([
    ...staged.filter(row => row.staged).map(row => async () => {
      const current = await lstat(row.target, { bigint: true }); assert.equal(current.dev.toString(), row.identity.dev); assert.equal(current.ino.toString(), row.identity.ino);
      assert.equal(sha(await readFile(row.target)), row.candidateHash, "Do not overwrite an independently rebuilt asset");
      await copyFile(row.backup, row.target); assert.equal(sha(await readFile(row.target)), row.originalHash);
    }), cleanupCaseLeases,
  ]).catch(error => { restorationSucceeded = false; report.failures.push(String(error)); report.status = "failed"; });
  try {
    await runtime.close();
    report.cleanup = { observations: cleanup, allOwnedRootsAbsent: cleanup.every(row => row.status === "owned-identity-absent"),
      stockGeneratedEngineRestored: restorationSucceeded, candidateFixturesOutputsProfilesScratchRemoved: restorationSucceeded, publicFilesNeverWritten: true };
    assert.equal(report.cleanup.allOwnedRootsAbsent, true);
  } catch (error) { report.failures.push(String(error.stack ?? error)); report.status = "failed"; }
  report.finishedAt = new Date().toISOString();
  const output = path.join(root, "outputs/reports", report.startedAt.replaceAll(":", "-") + "-audio-metadata-browser-candidate.json");
  await mkdir(path.dirname(output), { recursive: true }); await writeFile(output, JSON.stringify(report, null, 2) + "\n", { flag: "wx" });
  console.log(JSON.stringify({ report: output, status: report.status, cases: report.cases?.length, metadataFixVerified: report.metadataFixVerifiedForSixSmallCases,
    memory: report.memory?.incrementalPrivateMiB, failures: report.failures, cleanup: report.cleanup }));
  if (report.status === "failed") process.exitCode = 1;
}
