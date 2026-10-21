// Finite allocation experiment only: no conversion, public qualification or
// replacement memory metric. Execute the actual pinned capability functions on
// an inert same-origin page so their process costs can be distinguished from UI.
import "./lib/hidden-unit-subprocesses.mjs";
import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { createServer } from "node:http";
import { readFile, mkdir, writeFile, statfs } from "node:fs/promises";
import path from "node:path";
import ts from "typescript";
import { chromium } from "playwright";
import { createOwnedRuntimeScratch, finishOwnedCleanup } from "./lib/owned-runtime-scratch.mjs";
import { inspectStressHostMemory } from "./lib/host-memory-preflight.mjs";
import { inspectInstalledChromePin, assertInstalledChromePinsEqual } from "./lib/installed-chrome-pin.mjs";
import { startChromiumMemoryMonitor } from "./lib/persistent-chromium-memory.mjs";
import { sampleChromiumTree, stableWindow } from "./lib/chromium-private-memory.mjs";
import { annotateNativeProcessTypes } from "./lib/chromium-attribution.mjs";
import { auditVpxDecoderArtifact } from "./lib/vpx-decoder-artifact.mjs";

const root = path.resolve(import.meta.dirname, ".."), flags = process.argv.slice(2);
assert.ok(flags.length <= 1 && flags.every(x => ["--software-video-probe", "--software-canvas-probe", "--wasm-worker-lifecycle", "--codec-worker-lifecycle"].includes(x)));
assert.equal(process.platform, "win32", "This experiment uses the actual Windows private-memory observer");
const variant = flags[0]?.slice(2) ?? "original-probes";
const wasmLifecycle = variant === "wasm-worker-lifecycle" || variant === "codec-worker-lifecycle";
const sourceFile = path.join(root, "lib/browser-capabilities.ts"), source = await readFile(sourceFile, "utf8");
const sha = x => createHash("sha256").update(x).digest("hex");
const start = source.indexOf("  let offscreenCanvas = false;"), end = source.indexOf("  const [opfs, storageEstimate", start);
assert.ok(start > 0 && end > start && source.indexOf("  let offscreenCanvas = false;", start + 1) === -1);
let candidate = source;
if (variant === "software-video-probe") {
  assert.equal(source.split("{ codec:").length - 1, 3);
  candidate = source.replaceAll("{ codec:", '{ hardwareAcceleration: "prefer-software", codec:');
}
let canvas = source.slice(start, end);
assert.equal(canvas.split('.getContext("2d")').length - 1, 1);
if (variant === "software-canvas-probe") canvas = canvas.replace('.getContext("2d")', '.getContext("2d", { willReadFrequently: true })');
const exportVideo = candidate.includes("export async function videoEncoderSupport(") ? "" : "videoEncoderSupport, ";
const moduleSource = ts.transpileModule(candidate + "\nexport { imageDecoderSupport, " + exportVideo + "audioEncoderSupport };\n" +
  "export function canvasProbe() {\n" + canvas + "return offscreenCanvas; }\n", {
  compilerOptions: { target: ts.ScriptTarget.ES2022, module: ts.ModuleKind.ES2022 }, reportDiagnostics: true,
});
assert.equal(moduleSource.diagnostics?.length ?? 0, 0);
const body = Buffer.from('<!doctype html><meta charset="utf-8"><title>Capability allocation diagnostic only</title><p>Inert capability allocation diagnostic</p>');
const moduleBytes = Buffer.from(moduleSource.outputText), startedAt = new Date().toISOString();
const reportFile = path.join(root, "output/playwright", startedAt.replaceAll(":", "-") + "-capability-memory-" + variant + ".json");
const report = { schemaVersion: 1, scope: "Inert-page capability allocation experiment, not production conversion or acceptance", variant,
  startedAt, sourceSha256: sha(source), moduleSha256: sha(moduleBytes), productionSourceChanged: false,
  browserFlagsChanged: false, forcedGc: false, publicAcceptance: false, conversionCoverage: false, failures: [] };
const samples = [], references = [], stages = [], phases = [{ phase: "blank", at: Date.now() }], forbiddenRequests = [];
let runtime, context, server, monitor, timer, pending = Promise.resolve(), busy = false, failure, browserRootPid;
let nativeCore;
const workerEvents = [];
const pause = ms => new Promise(resolve => setTimeout(resolve, ms));
const phase = label => phases.push({ phase: label, at: Date.now() });
async function drain() {
  if (!monitor) return;
  const batch = await monitor.drain(); assert.ok(samples.length + batch.samples.length <= 3000);
  for (const sample of batch.samples) samples.push({ ...sample,
    phase: phases.findLast(x => x.at <= Date.parse(sample.timestamp))?.phase ?? "unavailable",
    elapsedMs: Date.parse(sample.timestamp) - Date.parse(startedAt) });
}
async function checkpoint(label, result = null) {
  assert.ok(references.length < 8);
  const startedAt = new Date().toISOString();
  const observation = await sampleChromiumTree(browserRootPid).then(tree => ({ tree, error: null }), error => ({ tree: null, error: String(error).slice(0, 512) }));
  references.push({ label, startedAt, completedAt: new Date().toISOString(), ...observation });
  stages.push({ label, result, ...observation });
}
try {
  report.host = await inspectStressHostMemory(); assert.equal(report.host.safeToStart, true);
  const disk = await statfs(root); assert.ok(disk.bavail * disk.bsize >= 2 * 1024 ** 3);
  report.browserPin = await inspectInstalledChromePin();
  const resources = new Map([["/", body], ["/probe.js", moduleBytes]]);
  if (wasmLifecycle) {
    report.scope = "Bare shared-Wasm-memory versus actual codec-factory worker retirement; no media or codec entrypoint invoked";
    nativeCore = await auditVpxDecoderArtifact(path.join(root, "work/vpx-chapter-end-39623553380"));
    report.nativeCore = { manifestSha256: nativeCore.manifestSha256, deliveredArtifacts: nativeCore.deliveredArtifacts,
      memoryLimits: nativeCore.memoryLimits, sourcePinsVerified: nativeCore.sourcePinsVerified, artifactPinsVerified: nativeCore.artifactPinsVerified };
    assert.deepEqual(nativeCore.memoryLimits, [{ imported: true, initialPages: 512, maximumPages: 1536, shared: true }]);
    for (const name of ["within-remux.mjs", "within-remux.wasm"]) resources.set("/" + name, await readFile(path.join(nativeCore.directory, name)));
    resources.set("/memory-worker.js", Buffer.from('globalThis.heldMemory = new WebAssembly.Memory({ initial: 512, maximum: 1536, shared: true }); const bytes = new Uint8Array(heldMemory.buffer); for (let at = 0; at < bytes.length; at += 4096) bytes[at] = 1; postMessage({ kind: "shared-memory-only", liveBytes: bytes.length, initialPages: 512, maximumPages: 1536 });'));
    resources.set("/core-worker.js", Buffer.from('import factory from "/within-remux.mjs"; globalThis.heldCore = await factory({ locateFile: name => "/" + name, withinBridge: { message() {}, cancelled() { return false; } }, print() {}, printErr() {} }); postMessage({ kind: "actual-core-factory-only-no-conversion", initialized: true, liveBytes: null, heapObservation: "Factory does not export HEAPU8; no guessed heap length" });'));
  }
  runtime = await createOwnedRuntimeScratch("capability-memory-");
  server = createServer((request, response) => {
    const valid = ["GET", "HEAD"].includes(request.method);
    const resource = resources.get(request.url) ?? null;
    response.writeHead(valid && resource ? 200 : 404, {
      "Content-Type": request.url?.endsWith(".wasm") ? "application/wasm" : /\.(?:m?js)$/.test(request.url) ? "text/javascript; charset=utf-8" : "text/html; charset=utf-8",
      "Cross-Origin-Opener-Policy": "same-origin", "Cross-Origin-Embedder-Policy": "require-corp",
      "Content-Security-Policy": "default-src 'none'; script-src 'self' 'wasm-unsafe-eval'; worker-src 'self'; connect-src 'self'; style-src 'none'",
      "Cache-Control": "no-store",
    });
    response.end(request.method === "HEAD" ? undefined : resource ?? "Not found");
  });
  await new Promise((resolve, reject) => { server.once("error", reject); server.listen(0, "127.0.0.1", resolve); });
  const origin = "http://127.0.0.1:" + server.address().port;
  context = await chromium.launchPersistentContext(path.join(runtime.directory, "profile"), {
    executablePath: report.browserPin.launcher.path, headless: true, env: runtime.env, serviceWorkers: "block",
  });
  const page = context.pages()[0] ?? await context.newPage();
  page.on("worker", worker => {
    assert.ok(workerEvents.length < 64); workerEvents.push({ type: "created", at: Date.now(), url: worker.url() });
    worker.once("close", () => { assert.ok(workerEvents.length < 64); workerEvents.push({ type: "closed", at: Date.now(), url: worker.url() }); });
  });
  report.browserVersion = context.browser().version();
  const cdp = await context.browser().newBrowserCDPSession(), info = await cdp.send("SystemInfo.getProcessInfo"); await cdp.detach();
  browserRootPid = info.processInfo.find(x => x.type === "browser")?.id; assert.ok(browserRootPid);
  monitor = await startChromiumMemoryMonitor(browserRootPid, runtime.directory, 100);
  const observations = [], windows = [];
  for (let attempt = 0; attempt < 20; attempt++) {
    await pause(2100); await drain(); const latest = samples.at(-1); assert.ok(latest); observations.push(latest);
    const stable = stableWindow(observations, 8000); if (stable) windows.push(stable);
    if (windows.length >= 2) break;
  }
  assert.ok(windows.length >= 2); report.blankBaseline = windows.reduce((a, b) => a.privateBytes < b.privateBytes ? a : b);
  timer = setInterval(() => { if (busy) return; busy = true;
    pending = drain().catch(error => { failure ??= error; }).finally(() => { busy = false; }); }, 500);
  await checkpoint("stable-blank");
  await context.route("**/*", async route => {
    const request = route.request();
    if (new URL(request.url()).origin !== origin || !["GET", "HEAD"].includes(request.method()) || request.postData() !== null) {
      if (forbiddenRequests.length < 32) forbiddenRequests.push(request.method() + " " + request.url().slice(0, 256)); await route.abort();
    } else await route.continue();
  });
  phase("inert-page"); assert.equal((await page.goto(origin)).status(), 200);
  await page.evaluate(async () => { window.__capabilityDiagnostic = await import("/probe.js"); });
  await pause(2100); await checkpoint("inert-page-before-probes");
  if (wasmLifecycle) for (const kind of variant === "codec-worker-lifecycle" ? ["core"] : ["memory", "core"]) for (let index = 1; index <= 9; index++) {
    phase(kind + "-worker-" + index);
    const [worker, result] = await Promise.all([page.waitForEvent("worker", { timeout: 10000 }), page.evaluate(async kind => {
      if (globalThis.__memoryDiagnosticWorker) throw new Error("Only one diagnostic worker may be live");
      const worker = new Worker("/" + kind + "-worker.js", { type: "module" }); globalThis.__memoryDiagnosticWorker = worker;
      let timer;
      try { return await new Promise((resolve, reject) => {
        timer = setTimeout(() => reject(new Error("Diagnostic worker initialization deadline")), 10000);
        worker.onmessage = event => resolve(event.data); worker.onerror = event => reject(new Error(event.message));
      }); } finally { clearTimeout(timer); }
    }, kind)]);
    if (kind === "memory") assert.equal(result.liveBytes, 33554432);
    else { assert.equal(result.initialized, true); assert.equal(result.liveBytes, null); }
    await pause(800);
    if (index === 1 || (kind === "core" && index === 9)) await checkpoint(kind + "-" + index + "-live", result);
    const closed = new Promise(resolve => worker.once("close", resolve));
    await page.evaluate(() => { globalThis.__memoryDiagnosticWorker.terminate(); globalThis.__memoryDiagnosticWorker = null; });
    let exitTimer;
    try { await Promise.race([closed, new Promise((_, reject) => { exitTimer = setTimeout(() => reject(new Error("Owned diagnostic worker exit unverified")), 5000); })]); }
    finally { clearTimeout(exitTimer); }
    phase(kind + "-retired-" + index); await pause(400);
    if (index === 9) await checkpoint(kind + "-" + index + "-retired");
    const last = samples.at(-1)?.privateBytes;
    assert.ok(last === null || (Number.isFinite(last) && last < 1024 ** 3), "Stop the allocation diagnosis at1GiB, never exhaust the host");
  }
  for (const method of wasmLifecycle ? [] : ["canvasProbe", "videoEncoderSupport", "audioEncoderSupport", "imageDecoderSupport"]) {
    phase(method);
    const result = await page.evaluate(async method => {
      let timer;
      try { return await Promise.race([window.__capabilityDiagnostic[method](), new Promise((_, reject) => { timer = setTimeout(() => reject(new Error("Capability probe exceeded5s")), 5000); })]); }
      finally { clearTimeout(timer); }
    }, method);
    await pause(2100); await checkpoint(method, result);
  }
  clearInterval(timer); await pending; await drain(); assert.equal(failure, undefined);
  assert.equal(forbiddenRequests.length, 0); assert.equal(sha(await readFile(sourceFile)), report.sourceSha256);
  assertInstalledChromePinsEqual(report.browserPin, await inspectInstalledChromePin());
  if (nativeCore) assert.equal((await auditVpxDecoderArtifact(nativeCore.directory)).manifestSha256, nativeCore.manifestSha256);
  report.sourceAndBrowserPinsVerified = true; report.status = "completed-diagnostic-not-route-acceptance";
} catch (error) { report.status = "failed"; report.failures.push(String(error.stack ?? error)); process.exitCode = 1; }
finally {
  clearInterval(timer); await pending;
  try {
    try {
      await finishOwnedCleanup([
        async () => { if (monitor) { try { await drain(); } finally { await monitor.close(); monitor = undefined; } } },
        async () => { if (context) { await context.close(); context = undefined; } },
        async () => { if (server) { await new Promise((resolve, reject) => server.close(error => error ? reject(error) : resolve())); server = undefined; } },
      ]);
    } finally { if (runtime) await runtime.close(); }
    report.disposableDataRemoved = true;
  } catch (error) { report.failures.push(String(error)); process.exitCode = 1; }
  if (browserRootPid) annotateNativeProcessTypes(samples, references, browserRootPid);
  report.finishedAt = new Date().toISOString(); report.stages = stages; report.samples = samples; report.forbiddenRequests = forbiddenRequests;
  report.workerEvents = workerEvents;
  report.unavailableSamples = samples.filter(x => x.privateBytes === null).length;
  await mkdir(path.dirname(reportFile), { recursive: true }); await writeFile(reportFile, JSON.stringify(report, null, 2) + "\n");
  console.log(JSON.stringify({ report: reportFile, status: report.status, variant, stages: stages.map(x => ({
    label: x.label, result: x.result, privateBytes: x.tree?.privateBytes ?? null,
    gpuPrivateBytes: x.tree?.processes.find(p => p.type === "gpu-process")?.privateBytes ?? null, error: x.error })), cleanup: report.disposableDataRemoved }));
}
