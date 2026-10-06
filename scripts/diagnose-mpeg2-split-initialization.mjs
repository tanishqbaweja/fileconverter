// Bounded initialization/navigation attribution, NOT original conversion acceptance.
import assert from "node:assert/strict";
import { chromium } from "@playwright/test";
import { execFile, spawn } from "node:child_process";
import { createHash } from "node:crypto";
import { access, mkdir, readFile, rm, statfs, writeFile } from "node:fs/promises";
import { createServer } from "node:net";
import path from "node:path";
import { promisify } from "node:util";
import { sampleChromiumTree, stableWindow } from "./lib/chromium-private-memory.mjs";
import { startParallelMemoryObserver } from "./lib/parallel-memory-observer.mjs";
import { connectRealmSampler } from "./lib/cdp-realm-memory.mjs";
import { createOwnedRuntimeScratch } from "./lib/owned-runtime-scratch.mjs";
import { classifyPrivateRequest } from "./lib/private-browser-request.mjs";

const root = path.resolve(import.meta.dirname, ".."), exec = promisify(execFile);
const delay = ms => new Promise(resolve => setTimeout(resolve, ms));
const sha = bytes => createHash("sha256").update(bytes).digest("hex");
const workerFile = "dist/client/engines/remux/_private_split_initialization_diagnostic.mjs";
const workerBytes = await readFile(path.join(root, "scripts/lib/split-initialization-worker.mjs"));
const stamp = new Date().toISOString().replaceAll(/[:.]/g, "-");
const output = path.join(root, `outputs/reports/${stamp}-split-initialization-attribution.json`);
let runtime, server, chrome, browser, page, observer, realms, browserCdp, pageCdp;
let staged = false, workerCreated = false, baseline = null, tracing = false, failure = null;
let browserVersion = null, nativeMemory = null;
const cleanup = { runtimeRemoved: false, assetsRestored: false, diagnosticWorkerRemoved: false };
const rows = [], forbidden = [], traceChunks = [], cleanupErrors = [];
let traceBytes = 0, traceOverflow = false;
let traceDataLossOccurred = null, traceParseError = null;
const environment = () => ({ ...runtime.env, WRANGLER_SEND_METRICS: "false" });
const runNode = args => exec(process.execPath, args, { cwd: root, env: environment(), windowsHide: true, timeout: 30000 });
const stopOwned = async child => {
  if (child?.pid && child.exitCode == null && child.signalCode == null)
    await exec("taskkill.exe", ["/PID", String(child.pid), "/T", "/F"], { windowsHide: true, timeout: 15000 });
};
async function startup(operation) {
  const deadline = Date.now() + 30000;
  while (Date.now() < deadline) {
    try { const result = await operation(); if (result) return result; } catch { /* startup only */ }
    await delay(250);
  }
  throw new Error("Owned initialization diagnostic startup deadline");
}
async function snapshot(phase, { memoryDump = true } = {}) {
  observer.setPhase(phase);
  let tree, error = null;
  try { tree = await sampleChromiumTree(chrome.pid); }
  catch (e) { tree = { privateBytes: null, rssBytes: null, processes: null }; error = String(e).slice(0, 512); }
  const row = { timestamp: new Date().toISOString(), elapsedMs: Date.now() - begin,
    phase, ...tree, error, realms: await realms.sample(), dom: await pageCdp.send("Memory.getDOMCounters").catch(() => null) };
  if (tracing && memoryDump) row.memoryDump = await browserCdp.send("Tracing.requestMemoryDump", { levelOfDetail: "light", deterministic: false })
    .catch(e => ({ error: String(e).slice(0, 512), success: false }));
  assert.ok(rows.length < 64); rows.push(row);
  await observer.through(Date.now());
  row.nativePhasePeak = observer.peaks([phase]).peak;
  console.log(JSON.stringify({ phase, privateMiB: row.privateBytes == null ? null : row.privateBytes / 1048576,
    dom: row.dom, dump: row.memoryDump ?? null }));
  return row;
}
async function action(value) {
  const result = await page.evaluate(value => new Promise((resolve, reject) => {
    const worker = window.__PRIVATE_SPLIT_INITIALIZATION_WORKER__;
    const timer = setTimeout(() => { worker.onmessage = null; reject(new Error("Module initialization diagnostic deadline")); }, 30000);
    worker.onmessage = ({ data }) => { clearTimeout(timer); worker.onmessage = null;
      if (data.error) reject(new Error(data.error)); else resolve(data); };
    worker.postMessage(value);
  }), value);
  assert.equal(result.conversionsPerformed, 0); return result;
}
const begin = Date.now();
try {
  const disk = await statfs(root);
  assert.ok(disk.bavail * disk.bsize > 512 * 1024 ** 2);
  runtime = await createOwnedRuntimeScratch("split-init-attribution-");
  await runNode(["scripts/stage-mpeg2-split-direct.mjs", "stage"]); staged = true;
  await writeFile(path.join(root, workerFile), workerBytes, { flag: "wx" }); workerCreated = true;
  const port = await new Promise((resolve, reject) => {
    const listener = createServer(); listener.once("error", reject);
    listener.listen(0, "127.0.0.1", () => { const value = listener.address().port;
      listener.close(error => error ? reject(error) : resolve(value)); });
  });
  const origin = `http://127.0.0.1:${port}`, profile = path.join(runtime.directory, "profile"); await mkdir(profile);
  server = spawn(process.execPath, ["node_modules/wrangler/bin/wrangler.js", "dev", "--config", "dist/server/wrangler.json", "--port", String(port)],
    { cwd: root, env: environment(), windowsHide: true, stdio: "ignore" });
  await startup(async () => (await fetch(origin)).ok);
  chrome = spawn("C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe", ["--headless=new", "--remote-debugging-port=0", `--user-data-dir=${profile}`,
    "--no-first-run", "--no-default-browser-check", "--disable-background-networking", "--disable-component-update", "--disable-default-apps",
    "--disable-domain-reliability", "--disable-extensions", "--disable-features=MediaRouter,OptimizationGuideModelDownloading,OptimizationHints,OptimizationTargetPrediction",
    "--disable-sync", "--metrics-recording-only", "about:blank"], { cwd: root, env: environment(), windowsHide: true, stdio: "ignore" });
  observer = await startParallelMemoryObserver(chrome.pid, runtime.directory);
  const debugPort = await startup(async () => Number((await readFile(path.join(profile, "DevToolsActivePort"), "utf8")).split(/\r?\n/)[0]));
  browser = await chromium.connectOverCDP(`http://127.0.0.1:${debugPort}`); browserVersion = browser.version();
  const context = browser.contexts()[0]; page = context.pages()[0];
  const version = await (await fetch(`http://127.0.0.1:${debugPort}/json/version`)).json();
  realms = await connectRealmSampler(version.webSocketDebuggerUrl, origin);
  browserCdp = await browser.newBrowserCDPSession(); pageCdp = await context.newCDPSession(page);
  context.on("request", request => {
    let frameUrl = null; try { frameUrl = request.frame().url(); } catch { /* worker */ }
    if (classifyPrivateRequest({ url: request.url(), method: request.method(), postData: request.postData(), frameUrl,
      serviceWorkerUrl: request.serviceWorker()?.url() ?? null }, origin) === "forbidden" && forbidden.length < 16)
      forbidden.push({ method: request.method(), url: request.url() });
  });
  const candidates = [], deadline = Date.now() + 45000;
  while (Date.now() < deadline && !baseline) {
    candidates.push(await snapshot("blank-baseline", { memoryDump: false })); baseline = stableWindow(candidates);
    if (!baseline) await delay(1000);
  }
  assert.ok(baseline?.stable, "No delayed/larger diagnostic baseline substitution");
  await browserCdp.send("Tracing.start", { transferMode: "ReturnAsStream", traceConfig: {
    recordMode: "recordUntilFull", traceBufferSizeInKb: 4096, includedCategories: ["disabled-by-default-memory-infra"],
    excludedCategories: ["*"], memoryDumpConfig: { allowed_dump_modes: ["light"], triggers: [] } } }); tracing = true;
  const query = `${origin}/?test=1&directory=1`;
  await page.goto(query); await page.waitForFunction(() => window.__WITHIN_TEST__?.getState().workerStatus === "ready");
  await delay(1000); await snapshot("loaded-single-navigation");
  await page.goto(query); await page.waitForFunction(() => window.__WITHIN_TEST__?.getState().workerStatus === "ready");
  await snapshot("loaded-redundant-navigation-immediate");
  await delay(3000); await snapshot("loaded-redundant-navigation-3s");
  await page.evaluate(() => { window.__PRIVATE_SPLIT_INITIALIZATION_WORKER__ = new Worker("/engines/remux/_private_split_initialization_diagnostic.mjs", { type: "module" }); });
  await delay(1000); await snapshot("diagnostic-worker-without-wasm");
  observer.setPhase("encoder-initializing"); const encoder = await action("encoder");
  assert.equal(encoder.encoderBytes, 16777216); await snapshot("encoder-initialized");
  observer.setPhase("decoder-initializing"); const decoder = await action("decoder");
  assert.equal(decoder.encoderBytes + decoder.decoderBytes, 50331648); await snapshot("both-modules-initialized");
  await delay(3000); await snapshot("both-modules-retained-3s");
  await action("release");
  await page.evaluate(() => { window.__PRIVATE_SPLIT_INITIALIZATION_WORKER__.terminate(); delete window.__PRIVATE_SPLIT_INITIALIZATION_WORKER__; });
  await delay(3000); await snapshot("diagnostic-worker-terminated-3s");
  assert.deepEqual(forbidden, []);
} catch (e) { failure = { message: String(e), stack: e.stack }; process.exitCode = 1; }
finally {
  const attempt = async fn => { try { await fn(); } catch (e) { cleanupErrors.push(String(e)); process.exitCode = 1; } };
  await attempt(async () => {
    if (!tracing) return;
    const completed = new Promise(resolve => browserCdp.once("Tracing.tracingComplete", resolve));
    await browserCdp.send("Tracing.end");
    let timer; let result;
    try { result = await Promise.race([completed, new Promise((_, reject) => { timer = setTimeout(() => reject(new Error("Tracing shutdown deadline")), 15000); })]); }
    finally { clearTimeout(timer); }
    traceDataLossOccurred = result.dataLossOccurred;
    assert.ok(result.stream);
    try {
      for (;;) {
        const chunk = await browserCdp.send("IO.read", { handle: result.stream, size: 262144 });
        const bytes = chunk.base64Encoded ? Buffer.from(chunk.data, "base64") : Buffer.from(chunk.data);
        traceBytes += bytes.length;
        if (traceBytes > 8 * 1024 * 1024) { traceOverflow = true; break; }
        traceChunks.push(bytes);
        if (chunk.eof) break;
      }
    } finally { await browserCdp.send("IO.close", { handle: result.stream }); }
  });
  await attempt(async () => { if (observer) { observer.setPhase("finally-cleanup"); await observer.stop(); nativeMemory = observer.report(); } });
  await attempt(() => realms?.close());
  await attempt(() => browser?.close());
  await attempt(() => stopOwned(chrome)); await attempt(() => stopOwned(server));
  await attempt(async () => {
    if (workerCreated) { assert.equal(sha(await readFile(path.join(root, workerFile))), sha(workerBytes)); await rm(path.join(root, workerFile));
      await assert.rejects(access(path.join(root, workerFile)), { code: "ENOENT" }); cleanup.diagnosticWorkerRemoved = true; }
  });
  await attempt(async () => { if (staged) { await runNode(["scripts/stage-mpeg2-split-direct.mjs", "restore"]); cleanup.assetsRestored = true; } });
  await attempt(async () => { if (runtime) { await runtime.close(); await assert.rejects(access(runtime.directory), { code: "ENOENT" }); cleanup.runtimeRemoved = true; } });
  const sources = ["scripts/diagnose-mpeg2-split-initialization.mjs", "scripts/lib/split-initialization-worker.mjs", "scripts/stage-mpeg2-split-direct.mjs"];
  const sourcePins = Object.fromEntries(await Promise.all(sources.map(async file => [file, sha(await readFile(path.join(root, file)))])));
  let trace = null;
  await mkdir(path.dirname(output), { recursive: true });
  if (!traceOverflow && traceChunks.length) {
    try {
      trace = JSON.parse(Buffer.concat(traceChunks).toString());
      await writeFile(output.replace(".json", "-memory-trace.json"), JSON.stringify(trace), { flag: "wx" });
    } catch (e) { traceParseError = String(e).slice(0, 512); process.exitCode = 1; }
  }
  const report = { scope: "private-browser-initialization-and-navigation-attribution-not-conversion-acceptance",
    status: failure || cleanupErrors.length || traceParseError || traceOverflow || traceDataLossOccurred ? "failed-diagnostic" : "completed-diagnostic", browserVersion, sourcePins,
    baseline, rows, nativeMemory, tracing: { bytes: traceBytes, overflow: traceOverflow, maximumTraceBytes: 8388608,
      chromiumBufferBytes: 4194304, perturbsMemory: true, events: trace?.traceEvents?.length ?? null,
      dataLossOccurred: traceDataLossOccurred, parseError: traceParseError },
    forbidden, failure, cleanupErrors, originalRead: false, mediaIoCalls: 0, conversionsPerformed: 0, publicAcceptance: false,
    completeChromiumMemoryAcceptance: false, ownedPids: { chrome: chrome?.pid, server: server?.pid, observer: observer?.pid },
    runtimeDirectory: runtime?.directory, cleanup };
  if (report.status === "failed-diagnostic") process.exitCode = 1;
  assert.ok(Buffer.byteLength(JSON.stringify(report)) < 4 * 1024 * 1024);
  await writeFile(output, JSON.stringify(report, null, 2) + "\n", { flag: "wx" });
  console.log(`${report.status}: ${output}`);
}
