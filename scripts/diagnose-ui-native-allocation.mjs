// Real production UI selection control, not a conversion or memory acceptance test.
import assert from "node:assert/strict";
import { chromium } from "@playwright/test";
import { execFile, spawn } from "node:child_process";
import { createHash } from "node:crypto";
import { createReadStream } from "node:fs";
import { access, mkdir, readFile, stat, statfs, writeFile } from "node:fs/promises";
import { createServer } from "node:net";
import path from "node:path";
import { promisify } from "node:util";
import { sampleChromiumTree } from "./lib/chromium-private-memory.mjs";
import { createOwnedRuntimeScratch } from "./lib/owned-runtime-scratch.mjs";
import { classifyPrivateRequest } from "./lib/private-browser-request.mjs";
const root = path.resolve(import.meta.dirname, ".."), exec = promisify(execFile), delay = ms => new Promise(resolve => setTimeout(resolve, ms));
const sha = bytes => createHash("sha256").update(bytes).digest("hex");
const original = await readFile(path.join(root, "scripts/mpeg2-split-single-navigation-memory.mjs"), "utf8");
assert.equal(sha(original), "acb179454985fdc2167f9e463d1d720b777d4c829d313d8e3ee45fdf82ff3417");
const spawnText = original.slice(original.indexOf('chrome = spawn('), original.indexOf('observer = await startParallelMemoryObserver'));
const argumentText = spawnText.slice(spawnText.indexOf('['), spawnText.lastIndexOf('], {'));
const args = [...argumentText.matchAll(/"([^"\n]*)"|`--user-data-dir=\$\{profile\}`/g)].map(match => match[1] ?? "PROFILE");
assert.equal(args.length, 14);
const fixture = path.join(root, "test.mkv"), expectedHash = "31f36695b5b44c62125a9e4264e84dc085accd21c02cc3487aae597f54b9db34";
async function verifySource() {
  assert.equal((await stat(fixture)).size, 2958573265);
  const hash = createHash("sha256"); for await (const chunk of createReadStream(fixture, { highWaterMark: 1048576 })) hash.update(chunk);
  assert.equal(hash.digest("hex"), expectedHash);
}
let runtime, chrome, server, browser, page, cdp, sampling = false, failure = null, browserVersion = null;
const rows = [], forbidden = [], cleanupErrors = [], profiles = [];
const cleanup = { samplingStopped: false, chromeStopped: false, serverStopped: false, runtimeRemoved: false, protectedFixtureUnchanged: false };
async function startup(operation) {
  const until = Date.now() + 30000;
  while (Date.now() < until) { try { const value = await operation(); if (value) return value; } catch { /* startup only */ } await delay(250); }
  throw new Error("UI diagnostic startup deadline");
}
async function snapshot(phase) {
  let tree = { privateBytes: null, rssBytes: null, processes: null }, error = null;
  try { tree = await sampleChromiumTree(chrome.pid); } catch (e) { error = String(e).slice(0, 512); }
  const state = await page.evaluate(() => window.__WITHIN_TEST__?.getState() ?? null);
  if (state) assert.equal(state.jobState, "idle", "Never start, synthesize or claim a conversion");
  const row = { phase, timestamp: new Date().toISOString(), ...tree, error,
    dom: await cdp.send("Memory.getDOMCounters"), heap: await cdp.send("Runtime.getHeapUsage"),
    selectedProfileId: state?.selectedProfileId ?? null, jobState: state?.jobState ?? null };
  assert.ok(rows.length < 16); rows.push(row); console.log(JSON.stringify({ phase, dom: row.dom, heap: row.heap }));
  if (sampling) {
    const value = await cdp.send("Memory.getSamplingProfile");
    // Reject oversized/unsupported payloads rather than silently accepting a truncated profile.
    assert.ok(Buffer.byteLength(JSON.stringify(value)) <= 524288, "Native sampling response cap");
    assert.ok(value.profile.samples.length <= 4096 && value.profile.modules.length <= 256);
    for (const sample of value.profile.samples) assert.ok(sample.stack.length <= 128);
    profiles.push({ phase, ...value });
  }
}
const stamp = new Date().toISOString().replaceAll(/[:.]/g, "-");
try {
  await verifySource(); const disk = await statfs(root); assert.ok(disk.bavail * disk.bsize >= 512 * 1024 ** 2);
  runtime = await createOwnedRuntimeScratch("ui-native-allocation-");
  const profile = path.join(runtime.directory, "profile"); await mkdir(profile);
  const port = await new Promise((resolve, reject) => { const listener = createServer(); listener.once("error", reject);
    listener.listen(0, "127.0.0.1", () => { const value = listener.address().port;
      listener.close(error => error ? reject(error) : resolve(value)); }); });
  const origin = `http://127.0.0.1:${port}`;
  server = spawn(process.execPath, ["node_modules/wrangler/bin/wrangler.js", "dev", "--config", "dist/server/wrangler.json", "--port", String(port)],
    { cwd: root, env: runtime.env, windowsHide: true, stdio: "ignore" });
  await startup(async () => (await fetch(origin)).ok);
  chrome = spawn("C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe",
    args.map(arg => arg === "PROFILE" ? `--user-data-dir=${profile}` : arg), { cwd: root, env: runtime.env, windowsHide: true, stdio: "ignore" });
  const debugPort = await startup(async () => Number((await readFile(path.join(profile, "DevToolsActivePort"), "utf8")).split(/\r?\n/)[0]));
  browser = await chromium.connectOverCDP(`http://127.0.0.1:${debugPort}`); browserVersion = browser.version();
  const context = browser.contexts()[0]; page = context.pages()[0]; cdp = await context.newCDPSession(page);
  context.on("request", request => {
    let frameUrl = null; try { frameUrl = request.frame().url(); } catch { /* worker */ }
    if (classifyPrivateRequest({ url: request.url(), method: request.method(), postData: request.postData(), frameUrl,
      serviceWorkerUrl: request.serviceWorker()?.url() ?? null }, origin) === "forbidden" && forbidden.length < 16)
      forbidden.push({ url: request.url(), method: request.method() });
  });
  await snapshot("blank-ui-control-only");
  await page.goto(`${origin}/?test=1&directory=1`); await page.waitForFunction(() => window.__WITHIN_TEST__?.getState().workerStatus === "ready");
  const fileCdp = await context.newCDPSession(page);
  try { const doc = await fileCdp.send("DOM.getDocument");
    const { nodeId } = await fileCdp.send("DOM.querySelector", { nodeId: doc.root.nodeId, selector: '[data-testid="file-input"]' });
    await fileCdp.send("DOM.setFileInputFiles", { nodeId, files: [fixture] });
  } finally { await fileCdp.detach(); }
  await page.locator('[data-testid="format-select"]').selectOption("mkv-to-mp4");
  await delay(2000);
  const choices = await page.locator('[data-testid="format-select"] option').evaluateAll(options => options.map(option => option.value));
  assert.ok(choices.includes("mkv-to-mp4") && choices.length < 256);
  const alternate = choices.find(value => value && value !== "mkv-to-mp4"); assert.ok(alternate);
  await snapshot("source-inspected-before-native-sampling");
  await cdp.send("Memory.startSampling", { samplingInterval: 524288, suppressRandomness: false }); sampling = true;
  await snapshot("native-sampling-start");
  const until = Date.now() + 60000;
  for (let i = 0; i < 60; i++) {
    assert.ok(Date.now() < until, "Bounded UI control deadline");
    await page.locator('[data-testid="format-select"]').selectOption(i % 2 ? "mkv-to-mp4" : alternate);
    await delay(250);
    if ((i + 1) % 20 === 0) await snapshot(`ui-selections-${i + 1}`);
  }
  await delay(3000); await snapshot("ui-control-settled-3s"); assert.deepEqual(forbidden, []);
} catch (error) { failure = String(error); process.exitCode = 1; }
finally {
  const attempt = async fn => { try { await fn(); } catch (e) { cleanupErrors.push(String(e)); process.exitCode = 1; } };
  await attempt(async () => { if (sampling) { await cdp.send("Memory.stopSampling"); cleanup.samplingStopped = true; } });
  await attempt(() => browser?.close());
  for (const [child, key] of [[chrome, "chromeStopped"], [server, "serverStopped"]]) await attempt(async () => {
    if (child?.pid && child.exitCode == null && child.signalCode == null)
      await exec("taskkill.exe", ["/PID", String(child.pid), "/T", "/F"], { windowsHide: true, timeout: 15000 });
    if (child?.pid) { const { stdout } = await exec("powershell.exe", ["-NoProfile", "-NonInteractive", "-Command",
      `@(Get-CimInstance Win32_Process -Filter 'ProcessId = ${child.pid}').Count`], { windowsHide: true, timeout: 15000 });
      assert.equal(Number(stdout.trim()), 0); cleanup[key] = true; }
  });
  await attempt(async () => { if (runtime) { await runtime.close(); await assert.rejects(access(runtime.directory), { code: "ENOENT" }); cleanup.runtimeRemoved = true; } });
  await attempt(async () => { await verifySource(); cleanup.protectedFixtureUnchanged = true; });
  const sourcePins = {};
  for (const file of ["scripts/diagnose-ui-native-allocation.mjs", "app/converter/ConverterApp.tsx", "scripts/mpeg2-split-single-navigation-memory.mjs",
    "scripts/lib/chromium-private-memory.mjs", "scripts/lib/owned-runtime-scratch.mjs"])
    sourcePins[file] = sha(await readFile(path.join(root, file)));
  const report = { recordedAt: new Date().toISOString(), status: failure || cleanupErrors.length ? "failed-diagnostic" : "completed-diagnostic",
    scope: "Actual production UI source inspection and60format-selection changes; native allocation/DOM control only",
    sourcePins, browserVersion, originalSourceBytes: 2958573265, originalSourceSha256: expectedHash,
    conversionsPerformed: 0, publicAcceptance: false, completeChromiumMemoryAcceptance: false,
    conversionSpeedAcceptance: false, nativeSamplingPerturbsMemory: true, rows, profiles, forbidden,
    failure, cleanupErrors, cleanup, ownedPids: { chrome: chrome?.pid ?? null, server: server?.pid ?? null }, runtimeDirectory: runtime?.directory ?? null };
  const json = JSON.stringify(report, null, 2); assert.ok(Buffer.byteLength(json) <= 4 * 1024 ** 2);
  const file = path.join(root, `output/playwright/${stamp}-ui-native-allocation.json`);
  await mkdir(path.dirname(file), { recursive: true }); await writeFile(file, json + "\n", { flag: "wx" }); console.log(file);
}
