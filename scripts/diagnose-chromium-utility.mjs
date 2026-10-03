/* Browser-service isolation, NOT a conversion or acceptance test. No fixture,
 * selected user file, native converter, private engine staging or uploads. */
import assert from "node:assert/strict";
import { chromium } from "@playwright/test";
import { execFile, spawn } from "node:child_process";
import { createHash } from "node:crypto";
import { lstat, mkdir, mkdtemp, readFile, realpath, rm, statfs, writeFile } from "node:fs/promises";
import { createServer } from "node:net";
import path from "node:path";
import { promisify } from "node:util";
import { sampleChromiumTree } from "./lib/chromium-private-memory.mjs";
import { classifyPrivateRequest } from "./lib/private-browser-request.mjs";

const root = path.resolve(import.meta.dirname, "..");
const blankOnly = process.argv[2] === "--blank-only";
assert.ok(process.argv.length === 2 || (process.argv.length === 3 && blankOnly), "Only --blank-only is supported");
const exec = promisify(execFile), delay = (ms) => new Promise((resolve) => setTimeout(resolve, ms));
const samples = [], requestDiagnostics = [], observedUtilities = new Set();
const startedAt = Date.now(), intervalMs = 1000;
const stamp = new Date().toISOString().replaceAll(/[:.]/g, "-");
const reportBase = path.join(root, "outputs/reports", `${stamp}-chromium-utility-isolation`);
let work, server, chrome, browser, rootPid, failure = null, browserVersion = null;
const sourceHashes = Object.fromEntries(await Promise.all(["scripts/diagnose-chromium-utility.mjs", "scripts/lib/chromium-private-memory.mjs",
  "scripts/lib/private-browser-request.mjs"].map(async (file) => [file, createHash("sha256").update(await readFile(path.join(root, file))).digest("hex")])));
const disk = await statfs(root);
assert.ok(disk.bavail * disk.bsize > 512 * 1024 ** 2, "Require 512 MiB free for the disposable owned browser profile");
async function waitFor(operation, label) {
  const deadline = Date.now() + 30_000;
  while (Date.now() < deadline) {
    try { const value = await operation(); if (value) return value; } catch { /* bounded startup observation */ }
    await delay(250);
  }
  throw new Error(`${label} did not start`);
}
async function availablePort() {
  return new Promise((resolve, reject) => {
    const listener = createServer(); listener.once("error", reject);
    listener.listen(0, "127.0.0.1", () => { const port = listener.address().port;
      listener.close((error) => error ? reject(error) : resolve(port)); });
  });
}
async function observe(phase, milliseconds) {
  const deadline = Date.now() + milliseconds;
  process.stdout.write(`Observing ${phase} for ${milliseconds / 1000}s; full tree retained, no acceptance baseline.\n`);
  while (Date.now() < deadline) {
    const sampleStartedAt = Date.now();
    let tree, sampleError = null;
    try { tree = await sampleChromiumTree(rootPid); }
    catch (error) { tree = { processes: null, privateBytes: null, rssBytes: null }; sampleError = String(error); }
    samples.push({ phase, timestamp: new Date(sampleStartedAt).toISOString(), elapsedMs: sampleStartedAt - startedAt, ...tree, sampleError });
    if (samples.length >= 512) throw new Error("Diagnostic history cap reached");
    for (const entry of tree.processes ?? []) {
      if (entry.type !== "utility") continue;
      const key = `${entry.pid}:${entry.utilitySubtype}`;
      if (!observedUtilities.has(key)) {
        observedUtilities.add(key);
        process.stdout.write(`${phase}: utility ${entry.pid} ${entry.utilitySubtype ?? "unavailable"}, ${(entry.privateBytes / 1024 ** 2).toFixed(2)} MiB.\n`);
      }
    }
    await delay(Math.max(0, intervalMs - (Date.now() - sampleStartedAt)));
  }
}
async function stopOwned(child) {
  if (child?.pid && child.exitCode == null) await exec("taskkill.exe", ["/PID", String(child.pid), "/T", "/F"], { windowsHide: true }).catch(() => {});
}
try {
  work = await mkdtemp(path.join(root, "work/chromium-utility-diagnostic-"));
  const profile = path.join(work, "profile"), temporary = path.join(work, "temp");
  await mkdir(profile); await mkdir(temporary);
  const environment = { ...process.env, TEMP: temporary, TMP: temporary, WRANGLER_SEND_METRICS: "false" };
  const port = await availablePort(), origin = `http://127.0.0.1:${port}`;
  if (!blankOnly) {
    server = spawn(process.execPath, ["node_modules/wrangler/bin/wrangler.js", "dev", "--config", "dist/server/wrangler.json", "--port", String(port)],
      { cwd: root, env: environment, windowsHide: true, stdio: "ignore" });
    await waitFor(async () => (await fetch(origin)).ok, "production server");
  }
  chrome = spawn("C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe", ["--headless=new", "--remote-debugging-port=0",
    `--user-data-dir=${profile}`, "--no-first-run", "--no-default-browser-check", "--disable-background-networking",
    "--disable-component-update", "--disable-default-apps", "--disable-domain-reliability", "--disable-extensions",
    "--disable-features=MediaRouter,OptimizationGuideModelDownloading,OptimizationHints,OptimizationTargetPrediction",
    "--disable-sync", "--metrics-recording-only", "about:blank"], { cwd: root, env: environment, windowsHide: true, stdio: "ignore" });
  rootPid = chrome.pid;
  const portNumber = await waitFor(async () => Number((await readFile(path.join(profile, "DevToolsActivePort"), "utf8")).split(/\r?\n/)[0]), "Chrome");
  browser = await chromium.connectOverCDP(`http://127.0.0.1:${portNumber}`);
  browserVersion = browser.version();
  const context = browser.contexts()[0], page = context.pages()[0];
  context.on("request", (request) => {
    let frameUrl = null; try { frameUrl = request.frame().url(); } catch { /* worker request */ }
    const detail = { url: request.url(), method: request.method(), postData: request.postData(), frameUrl,
      serviceWorkerUrl: request.serviceWorker()?.url() ?? null };
    const classification = classifyPrivateRequest(detail, origin);
    if (classification !== "app-static" && requestDiagnostics.length < 32) requestDiagnostics.push({ ...detail, classification });
  });
  await page.goto("about:blank"); await observe("blank-only", blankOnly ? 240_000 : 120_000);
  if (!blankOnly) {
    await page.goto(`${origin}/?test=1`);
    await page.waitForFunction(() => window.__WITHIN_TEST__?.getState().workerStatus === "ready");
    assert.equal(await page.evaluate(() => crossOriginIsolated), true);
    await observe("production-site-idle-no-file", 120_000);
  }
  for (const phase of blankOnly ? ["blank-only"] : ["blank-only", "production-site-idle-no-file"]) {
    assert.ok(samples.filter((sample) => sample.phase === phase && sample.privateBytes != null).length >= (blankOnly ? 200 : 100),
      `Insufficient valid full-tree observations for ${phase}`);
  }
} catch (error) {
  failure = { name: error.name, message: error.message, stack: error.stack }; process.exitCode = 1;
} finally {
  await browser?.close().catch(() => {}); await stopOwned(chrome); await stopOwned(server);
  if (work) { assert.ok(path.dirname(work) === path.join(root, "work") && path.basename(work).startsWith("chromium-utility-diagnostic-"));
    assert.equal((await lstat(work)).isSymbolicLink(), false);
    assert.equal(await realpath(work), path.join(await realpath(path.join(root, "work")), path.basename(work)));
    await rm(work, { recursive: true, force: true, maxRetries: 5, retryDelay: 500 }); }
  const report = { recordedAt: new Date().toISOString(), status: failure ? "failed-diagnostic" : "completed-diagnostic",
    scope: `${blankOnly ? "Blank page only, no production site loaded" : "Blank and production-loaded idle"} utility-service isolation, no input file or conversion. NOT a replacement/larger acceptance baseline or any conversion-memory pass.`,
    mode: blankOnly ? "blank-only-240s" : "blank-120s-then-production-idle-120s",
    sourceHashes, browserVersion, samples, requestDiagnostics, failure, publicProfilesChanged: false,
    inputFilesSelected: 0, conversionsPerformed: 0, cleanup: { ownedProfileTempAndServerRemoved: true, privateEngineStaged: false } };
  await mkdir(path.dirname(reportBase), { recursive: true });
  await writeFile(`${reportBase}.json`, `${JSON.stringify(report, null, 2)}\n`, { flag: "wx" });
  await writeFile(`${reportBase}.csv`, "timestamp,phase,pid,type,utilitySubtype,privateBytes,rssBytes\n" + samples.flatMap((sample) =>
    sample.processes?.map((entry) => [sample.timestamp, sample.phase, entry.pid, entry.type, entry.utilitySubtype ?? "", entry.privateBytes, entry.rssBytes].join(",")) ??
      [[sample.timestamp, sample.phase, "", "", "", "", ""].join(",")]).join("\n") + "\n", { flag: "wx" });
  process.stdout.write(`Retained utility diagnostic: ${reportBase}.json\n${failure ? failure.message : "Diagnostic completed; no conversion acceptance is claimed."}\n`);
}
