import "./lib/reliable-readonly-preflight.mjs";
import assert from "node:assert/strict";
import { spawn } from "node:child_process";
import { readFile, writeFile, statfs } from "node:fs/promises";
import path from "node:path";
import { chromium } from "@playwright/test";
import { createOwnedRuntimeScratch } from "./lib/owned-runtime-scratch.mjs";
import { inspectStressHostMemory } from "./lib/host-memory-preflight.mjs";
import { inspectInstalledChromePin, assertInstalledChromePinsEqual } from "./lib/installed-chrome-pin.mjs";
import { queryReliableProcessIdentity } from "./lib/reliable-owned-identity.mjs";
import { observeOwnedProcessExit } from "./lib/owned-process-exit-observation.mjs";
import { sampleChromiumTree } from "./lib/chromium-private-memory.mjs";
import { sha } from "./lib/stable-ui-headless-baseline-recipe.mjs";
import { exerciseJspiCapability } from "./lib/jspi-capability-fixture.mjs";
const root = path.resolve(import.meta.dirname, ".."), stamp = new Date().toISOString().replaceAll(/[:.]/g, "-");
const runtime = await createOwnedRuntimeScratch("jspi-capability-probe-");
const reportPath = `evidence/${stamp}-jspi-capability.json`;
const result = { recordedAt: new Date().toISOString(), status: "running-browser-only-jspi-probe", sources: {},
  identity: null, sampledBirths: [], absences: [], runtimeDirectory: runtime.directory, runtimeRemoved: false,
  page: null, worker: null, requestedNetworkUrls: [], browserVersion: null, failure: null, cleanupErrors: [],
  fileInputs: 0, conversions: 0, browserFlagsChangedFromQualification: false, memoryAcceptance: false, publicAcceptance: false };
let browser;
try {
  result.host = await inspectStressHostMemory(); assert.equal(result.host.safeToStart, true);
  const disk = await statfs(root); assert.ok(disk.bavail * disk.bsize >= 32 * 1024 ** 3);
  for (const file of ["scripts/probe-jspi.mjs", "scripts/lib/jspi-capability-fixture.mjs", "package-lock.json"]) {
    const bytes = await readFile(path.join(root, file)); result.sources[file] = { sha256: sha(bytes), preimage: bytes.toString("base64") };
  }
  result.pinBefore = await inspectInstalledChromePin();
  const child = spawn(result.pinBefore.launcher.path, ["--headless=new", "--remote-debugging-port=0", `--user-data-dir=${runtime.directory}`,
    "--no-first-run", "--no-default-browser-check", "--disable-background-networking", "--disable-component-update", "--disable-default-apps",
    "--disable-domain-reliability", "--disable-extensions", "--disable-features=MediaRouter,OptimizationGuideModelDownloading,OptimizationHints,OptimizationTargetPrediction",
    "--disable-sync", "--metrics-recording-only", "about:blank"], { cwd: root, env: runtime.env, windowsHide: true, stdio: "ignore" });
  child.on("error", () => {}); result.identity = await queryReliableProcessIdentity(child.pid); assert.equal(result.identity.parentPid, process.pid);
  await writeFile(path.join(root, reportPath), JSON.stringify(result, null, 2), { flag: "wx" });
  let port; const deadline = Date.now() + 30000;
  while (!port && Date.now() < deadline) {
    try { port = Number((await readFile(path.join(runtime.directory, "DevToolsActivePort"), "utf8")).split(/\r?\n/)[0]); } catch { /* owned startup only */ }
    if (!port) await new Promise(resolve => setTimeout(resolve, 250));
  }
  assert.ok(port); browser = await chromium.connectOverCDP(`http://127.0.0.1:${port}`);
  assert.equal(browser.version(), result.pinBefore.version);
  const context = browser.contexts()[0], page = context.pages()[0]; page.setDefaultTimeout(15000);
  await context.route("**/*", route => {
    assert.ok(result.requestedNetworkUrls.length < 16); result.requestedNetworkUrls.push(route.request().url()); return route.abort();
  });
  result.sampledBirths.push(...(await sampleChromiumTree(child.pid)).processes);
  const session = await browser.newBrowserCDPSession(); result.browserVersion = await session.send("Browser.getVersion"); await session.detach();
  result.page = await page.evaluate(exerciseJspiCapability);
  result.worker = await page.evaluate(async source => {
    const url = URL.createObjectURL(new Blob([`(${source})().then(result=>postMessage({result}),error=>postMessage({error:String(error)}));`], { type: "text/javascript" }));
    let worker, timer;
    try {
      worker = new Worker(url);
      return await new Promise((resolve, reject) => {
        timer = setTimeout(() => reject(new Error("Owned arithmetic worker deadline")), 10000);
        worker.onmessage = event => event.data.error ? reject(new Error(event.data.error)) : resolve(event.data.result);
        worker.onerror = event => reject(new Error(event.message));
      });
    } finally { clearTimeout(timer); worker?.terminate(); URL.revokeObjectURL(url); }
  }, exerciseJspiCapability.toString());
  assert.deepEqual(result.worker, result.page); assert.equal(result.page.moduleBytes, 56);
  result.sampledBirths.push(...(await sampleChromiumTree(child.pid)).processes);
  result.pinAfter = await inspectInstalledChromePin(); assertInstalledChromePinsEqual(result.pinBefore, result.pinAfter);
  for (const [file, record] of Object.entries(result.sources)) assert.equal(sha(await readFile(path.join(root, file))), record.sha256);
  assert.deepEqual(result.requestedNetworkUrls, []); result.status = "passed-page-and-worker-stable-jspi-arithmetic-only";
} catch (error) { result.failure = { message: error.message, stack: error.stack?.slice(0, 8192) }; process.exitCode = 1; }
finally {
  try { if (browser) { const close = await browser.newBrowserCDPSession(); await close.send("Browser.close").catch(() => {}); } }
  catch (error) { result.cleanupErrors.push(String(error)); }
  try {
    await browser?.close();
    const identities = [...new Map([result.identity, ...result.sampledBirths].filter(Boolean).map(row => [row.pid + ":" + row.createdAt, row])).values()];
    for (const identity of identities) { const absence = await observeOwnedProcessExit(identity); assert.equal(absence.status, "owned-identity-absent"); result.absences.push(absence); }
    await runtime.close(); result.runtimeRemoved = true;
  } catch (error) { result.cleanupErrors.push(String(error)); process.exitCode = 1; }
  if (result.failure || result.cleanupErrors.length) result.status = "failed-browser-only-jspi-probe";
  result.finishedAt = new Date().toISOString();
  await writeFile(path.join(root, reportPath), JSON.stringify(result, null, 2) + "\n");
  console.log(JSON.stringify({ reportPath, status: result.status, page: result.page, worker: result.worker,
    births: result.absences.length, runtimeRemoved: result.runtimeRemoved, failure: result.failure, cleanupErrors: result.cleanupErrors }));
}
