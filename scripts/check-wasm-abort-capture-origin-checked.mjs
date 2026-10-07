// Real Chromium + actual unchanged decoder, SYNTHETIC malloc/OOM control ONLY.
// No user file, converter, native FFmpeg, staged asset, heap growth, or acceptance.
import assert from "node:assert/strict";
import { chromium } from "@playwright/test";
import { execFile, spawn } from "node:child_process";
import { createHash } from "node:crypto";
import { createReadStream } from "node:fs";
import { access, mkdir, readFile, stat, writeFile } from "node:fs/promises";
import { createServer } from "node:http";
import path from "node:path";
import { promisify } from "node:util";
import { createOwnedRuntimeScratch } from "./lib/owned-runtime-scratch.mjs";
import { inspectStressHostMemory } from "./lib/host-memory-preflight.mjs";
import { sampleChromiumTree } from "./lib/chromium-private-memory.mjs";
import { observeOwnedProcessExit, queryProcessIdentity } from "./lib/owned-process-exit-observation.mjs";
import { classifyPrivateRequest } from "./lib/private-browser-request.mjs";
import { microsecondBirth } from "./lib/microsecond-native-type-join.mjs";
import { readWasmFunctionNames, symbolizeWasmStack } from "./lib/wasm-stack-symbols.mjs";
const root = path.resolve(import.meta.dirname, ".."), MiB = 1048576;
const sha = bytes => createHash("sha256").update(bytes).digest("hex");
const candidate = path.join(root, "work/mpeg2-split-pipeline-37479749443");
const output = path.join(root, "evidence/wasm-abort-capture-control-origin-checked-2026-10-08.json");
await assert.rejects(access(output), { code: "ENOENT" });
const host = await inspectStressHostMemory(); assert.equal(host.safeToStart, true, "Unchanged2GiB host preflight");
const manifest = JSON.parse(await readFile(path.join(candidate, "build-manifest.json")));
for (const [file, hash] of Object.entries(manifest.artifacts)) {
  assert.ok((await stat(path.join(candidate, file))).size <= 16 * MiB);
  assert.equal(sha(await readFile(path.join(candidate, file))), hash, file);
}
const workerSource = `import decoderFactory from "/decoder.mjs";
import {createBoundedWasmAbortCapture} from "/capture.mjs";
let core; let actualMalloc; let emitted=null; let originalCalls=0;
const capture=createBoundedWasmAbortCapture({role:"decoder",emit:row=>{emitted=row;}});
self.onmessage=async event=>{
  try {
    if(event.data==="load") {
      core=await decoderFactory({locateFile:()=>"/decoder.wasm",print:()=>{},printErr:()=>{},
        onAbort:capture.withPriorOnAbort(()=>{originalCalls++;}),
        instantiateWasm(imports,receive){
          WebAssembly.instantiateStreaming(fetch("/decoder.wasm"),imports).then(result=>{
            actualMalloc=result.instance.exports.malloc;
            receive(result.instance,result.module);
          },error=>self.postMessage({phase:"control-error",message:String(error).slice(0,2048)}));
          return {};
        }});
      if(core.HEAPU8.byteLength!==33554432)throw new Error("Actual heap changed");
      self.postMessage({phase:"loaded",heapBytes:core.HEAPU8.byteLength,
        shared:core.HEAPU8.buffer instanceof SharedArrayBuffer,originIsolated:self.crossOriginIsolated,
        capture:capture.report(),stackLimit:Error.stackTraceLimit??null});
    }else if(event.data==="synthetic-oom") {
      const beforeLimit=Error.stackTraceLimit??null; let failure=null;
      try{actualMalloc(33554432);}catch(error){failure={message:String(error.message).slice(0,1024),stack:String(error.stack).slice(0,8192)};}
      self.postMessage({phase:"terminal",heapBytes:core.HEAPU8.byteLength,originalCalls,
        capture:capture.report(),emitted,beforeLimit,afterLimit:Error.stackTraceLimit??null,failure,
        syntheticRequestedAllocationBytes:33554432,syntheticFunctionCall:"actual-instance.exports.malloc",converterInvoked:false});
    }else throw new Error("Unexpected control command");
  }catch(error){self.postMessage({phase:"control-error",message:String(error).slice(0,2048)});}
};`;
const files = new Map([
  ["/decoder.mjs", [path.join(candidate, "within-mpeg2-split.mjs"), "text/javascript"]],
  ["/decoder.wasm", [path.join(candidate, "within-mpeg2-split.wasm"), "application/wasm"]],
  ["/capture.mjs", [path.join(root, "scripts/lib/bounded-wasm-abort-capture.mjs"), "text/javascript"]],
]);
const runtime = await createOwnedRuntimeScratch("wasm-abort-control-");
let server, chrome, browser, page, origin, browserVersion, result, rootIdentity;
let failure = null, closeRequestError = null, nativeIdentities = [], serverError = null, chromeError = null;
const snapshots = [], forbiddenRequests = [], browserLocalRequests = [], cleanup = {};
const flags = ["--headless=new", "--remote-debugging-port=0", `--user-data-dir=${path.join(runtime.directory, "profile")}`,
  "--no-first-run", "--no-default-browser-check", "--disable-background-networking", "--disable-component-update",
  "--disable-default-apps", "--disable-domain-reliability", "--disable-extensions",
  "--disable-features=MediaRouter,OptimizationGuideModelDownloading,OptimizationHints,OptimizationTargetPrediction",
  "--disable-sync", "--metrics-recording-only", "about:blank"];
try {
  await mkdir(path.join(runtime.directory, "profile"));
  server = createServer((request, response) => {
    response.setHeader("Cross-Origin-Opener-Policy", "same-origin");
    response.setHeader("Cross-Origin-Embedder-Policy", "require-corp");
    response.setHeader("Cross-Origin-Resource-Policy", "same-origin");
    response.setHeader("Cache-Control", "no-store");
    response.setHeader("Content-Security-Policy", "default-src 'self'; script-src 'self' 'wasm-unsafe-eval'; worker-src 'self'; connect-src 'self'");
    const pathname = new URL(request.url, "http://127.0.0.1").pathname;
    if (request.method !== "GET") { response.writeHead(405); response.end(); return; }
    if (pathname === "/") { response.setHeader("Content-Type", "text/html"); response.end("<!doctype html><title>Synthetic Wasm abort control, not converter</title>"); return; }
    if (pathname === "/worker.mjs") { response.setHeader("Content-Type", "text/javascript"); response.end(workerSource); return; }
    const file = files.get(pathname);
    if (!file) { response.writeHead(404); response.end(); return; }
    response.setHeader("Content-Type", file[1]);
    const stream = createReadStream(file[0], { highWaterMark: 65536 });
    stream.on("error", error => { serverError = String(error).slice(0, 512); response.destroy(error); });
    stream.pipe(response);
  });
  await new Promise((resolve, reject) => { server.once("error", reject); server.listen(0, "127.0.0.1", resolve); });
  origin = `http://127.0.0.1:${server.address().port}`;
  chrome = spawn("C:/Program Files/Google/Chrome/Application/chrome.exe", flags,
    { cwd: root, env: runtime.env, windowsHide: true, stdio: "ignore" });
  chrome.once("error", error => { chromeError = String(error).slice(0, 512); });
  if (chrome.pid) {
    rootIdentity = await queryProcessIdentity(chrome.pid);
    assert.ok(rootIdentity, "Owned Chrome root identity must be observed");
    assert.equal(rootIdentity.parentPid, process.pid);
    nativeIdentities.push(rootIdentity);
  }
  const deadline = Date.now() + 30000; let port;
  while (Date.now() < deadline && !port) {
    assert.equal(chromeError, null); assert.equal(chrome.exitCode, null, "Owned Chrome exited during startup");
    try { port = Number((await readFile(path.join(runtime.directory, "profile/DevToolsActivePort"), "utf8")).split(/\r?\n/)[0]); }
    catch { /* Owned fresh Chrome startup only. Missing is unavailable, not0. */ }
    if (!port) await new Promise(resolve => setTimeout(resolve, 250));
  }
  assert.ok(port); browser = await chromium.connectOverCDP(`http://127.0.0.1:${port}`);
  browserVersion = browser.version(); const context = browser.contexts()[0]; page = context.pages()[0];
  context.on("request", request => {
    let frameUrl = null; try { frameUrl = request.frame().url(); } catch { /* Dedicated worker request. */ }
    const detail = { url: request.url(), method: request.method(), postData: request.postData(), frameUrl,
      serviceWorkerUrl: request.serviceWorker()?.url() ?? null };
    // Same strict source-aware guard as the full original driver. Exact local
    // Chrome TTS script is never allowed when initiated by this control page.
    const kind = classifyPrivateRequest(detail, origin);
    if (kind === "forbidden" && forbiddenRequests.length < 32) forbiddenRequests.push(detail);
    if (kind === "browser-local" && browserLocalRequests.length < 32) browserLocalRequests.push(detail);
  });
  const blank = await sampleChromiumTree(chrome.pid);
  const sampledRoot = blank.processes.find(p => p.pid === chrome.pid);
  assert.equal(microsecondBirth(sampledRoot.createdAt), microsecondBirth(rootIdentity.createdAt));
  assert.equal(sampledRoot.parentPid, rootIdentity.parentPid);
  snapshots.push({ phase: "blank-control-snapshot-NOT-stable-baseline", ...blank });
  nativeIdentities = blank.processes;
  await page.goto(origin);
  const loaded = await page.evaluate(async () => {
    window.abortControlWorker = new Worker("/worker.mjs", { type: "module" });
    const worker = window.abortControlWorker;
    const value = await new Promise((resolve, reject) => {
      const timeout = setTimeout(() => reject(new Error("Control load deadline")), 30000);
      worker.onmessage = event => { clearTimeout(timeout); resolve(event.data); };
      worker.onerror = event => { clearTimeout(timeout); reject(new Error(event.message)); };
      worker.postMessage("load");
    }); return value;
  });
  assert.equal(loaded.phase, "loaded", JSON.stringify(loaded));
  assert.equal(loaded.heapBytes, 32 * MiB); assert.equal(loaded.shared, true); assert.equal(loaded.originIsolated, true);
  assert.equal(loaded.capture.first, null); assert.equal(loaded.capture.captureStarted, false);
  const active = await sampleChromiumTree(chrome.pid);
  snapshots.push({ phase: "loaded-control-snapshot-NOT-peak-acceptance", ...active });
  nativeIdentities = [...new Map(snapshots.flatMap(s => s.processes).map(p => [`${p.pid}:${p.createdAt}`, p])).values()];
  const terminal = await page.evaluate(async () => {
    const worker = window.abortControlWorker;
    try { return await new Promise((resolve, reject) => {
      const timeout = setTimeout(() => reject(new Error("Control OOM deadline")), 30000);
      worker.onmessage = event => { clearTimeout(timeout); resolve(event.data); };
      worker.onerror = event => { clearTimeout(timeout); reject(new Error(event.message)); };
      worker.postMessage("synthetic-oom");
    }); } finally { worker.terminate(); delete window.abortControlWorker; }
  });
  result = { loaded, terminal }; cleanup.workerTerminated = true;
  assert.equal(terminal.phase, "terminal", JSON.stringify(terminal));
  assert.equal(terminal.heapBytes, 32 * MiB); assert.equal(terminal.originalCalls, 1);
  assert.equal(terminal.beforeLimit, terminal.afterLimit);
  assert.match(terminal.failure?.message ?? "", /Cannot enlarge memory arrays/);
  assert.equal(terminal.capture.maximumRecords, 1); assert.equal(terminal.capture.queuedRecords, 0);
  assert.equal(terminal.capture.first.stackLimitRestored, true); assert.equal(terminal.capture.emitFailure, null);
  assert.equal(terminal.capture.nativeErrorSuppressed, false); assert.deepEqual(terminal.emitted, terminal.capture.first);
  const actual = await readFile(path.join(candidate, "within-mpeg2-split.wasm"));
  const names = readWasmFunctionNames(actual);
  result.actualBinarySha256 = sha(actual); result.actualBinaryNames = names.size;
  result.symbolizedAbortFrames = symbolizeWasmStack(terminal.capture.first.stack, names);
  assert.ok(result.symbolizedAbortFrames.some(frame => frame.functionNameFromActualBinary === "sbrk"));
  assert.ok(result.symbolizedAbortFrames.some(frame => frame.functionNameFromActualBinary === "emscripten_builtin_malloc"));
  assert.deepEqual(forbiddenRequests, []); assert.equal(serverError, null);
} catch (error) { failure = { message: String(error.message).slice(0, 2048), stack: String(error.stack).slice(0, 8192) }; }
finally {
  // Cleanup dependencies stay sequential, but one failed action cannot skip
  // later server/identity/runtime actions or prevent retaining the failure proof.
  cleanup.errors = [];
  const attempt = async (step, action) => {
    try { await action(); }
    catch (error) { cleanup.errors.push({ step, message: String(error).slice(0, 1024) }); }
  };
  if (page && !page.isClosed()) await attempt("worker-termination", async () => {
    await page.evaluate(() => { window.abortControlWorker?.terminate(); delete window.abortControlWorker; });
    cleanup.workerTerminated = true;
  });
  // Startup may fail before the normal connection. Only this fresh profile's
  // endpoint is eligible for a bounded normal-lifecycle close; never kill apps.
  if (!browser && chrome?.pid) await attempt("startup-close-connection", async () => {
    const port = Number((await readFile(path.join(runtime.directory, "profile/DevToolsActivePort"), "utf8")).split(/\r?\n/)[0]);
    assert.ok(Number.isInteger(port) && port > 0 && port <= 65535);
    browser = await chromium.connectOverCDP(`http://127.0.0.1:${port}`, { timeout: 5000 });
  });
  if (browser) {
    try { const session = await browser.newBrowserCDPSession(); await session.send("Browser.close"); cleanup.normalBrowserCloseRequested = true; }
    catch (error) { closeRequestError = String(error).slice(0, 512); }
    await attempt("browser-disconnect", () => browser.close());
  }
  if (!rootIdentity && chrome?.pid) await attempt("root-identity-fallback", async () => {
    const observed = await queryProcessIdentity(chrome.pid);
    assert.ok(observed && observed.parentPid === process.pid, "Missing original root identity is not proof of absence");
    rootIdentity = observed; nativeIdentities.push(observed);
  });
  if (rootIdentity) await attempt("root-exit-observation", async () => {
    cleanup.rootExit = await observeOwnedProcessExit(rootIdentity);
    assert.equal(cleanup.rootExit.status, "owned-identity-absent");
  });
  if (server) await attempt("server-close", async () => {
    server.closeAllConnections();
    if (server.listening) await new Promise((resolve, reject) => server.close(error => error ? reject(error) : resolve()));
    cleanup.serverClosed = true;
  });
  if (nativeIdentities.length) await attempt("all-sampled-births-absence", async () => {
    const query = [...new Set(nativeIdentities.map(p => p.pid))].map(pid => `ProcessId = ${pid}`).join(" or ");
    const { stdout } = await promisify(execFile)("powershell.exe", ["-NoProfile", "-NonInteractive", "-Command",
      `$ErrorActionPreference = 'Stop'; ConvertTo-Json -InputObject @(Get-CimInstance Win32_Process -Filter '${query}' | ForEach-Object { @{pid=$_.ProcessId;parentPid=$_.ParentProcessId;createdAt=$_.CreationDate.ToUniversalTime().ToString('o')} }) -Compress`],
    { env: runtime.env, windowsHide: true, timeout: 15000, maxBuffer: 131072 });
    const current = JSON.parse(stdout);
    assert.deepEqual(current.filter(p => nativeIdentities.some(old => old.pid === p.pid && old.parentPid === p.parentPid &&
      microsecondBirth(old.createdAt) === microsecondBirth(p.createdAt))), []);
    cleanup.allSampledNativeBirthsAbsent = true; cleanup.checkedNativeIdentities = nativeIdentities.length;
    cleanup.observedProcesses = current;
  });
  await attempt("runtime-removal", async () => {
    await runtime.close(); await assert.rejects(access(runtime.directory), { code: "ENOENT" }); cleanup.runtimeProfileRemoved = true;
  });
  if (cleanup.errors.length && !failure) failure = { message: "Owned cleanup failed; see cleanup.errors", stack: null };
}
const sourcePins = {};
for (const file of ["scripts/check-wasm-abort-capture-origin-checked.mjs", "scripts/lib/private-browser-request.mjs", "scripts/lib/bounded-wasm-abort-capture.mjs", "scripts/lib/wasm-stack-symbols.mjs"])
  sourcePins[file] = sha(await readFile(path.join(root, file)));
const proof = { recordedAt: new Date().toISOString(), status: failure ? "failed-synthetic-abort-control" : "passed-synthetic-abort-control",
  scope: "Actual unchanged decoder binary in dedicated Chromium worker, intentional SYNTHETIC32MiB malloc request; no media/converter",
  hostPreflight: host, browserVersion, flags, workerSource, workerSourceSha256: sha(workerSource), sourcePins,
  result, snapshots, nativeIdentities, failure, closeRequestError, serverError, chromeError, forbiddenRequests, browserLocalRequests, cleanup,
  runtimeDirectory: runtime.directory, decoderArtifactSources: manifest.sources,
  browserConversionsPerformed: 0, protectedSourceRead: false, nativeConverterUsed: false,
  primaryMemoryAcceptance: false, primaryIncrementalPrivateMiB: null, publicAcceptance: false,
  heapGrowthAllowed: false, debuggerPauseOrHeapDumpUsed: false, actualOriginalOomAllocationCallsite: null,
  caveat: "This controls only the failure hook and binary-name join. Synthetic malloc is NOT the old106112frame HEVC allocation, its size, live heap or original cause. Snapshot samples are NOT stable blank/continuous peak/250MiB conversion acceptance." };
const json = JSON.stringify(proof, null, 2) + "\n"; assert.ok(Buffer.byteLength(json) < 131072);
await writeFile(output, json, { flag: "wx" });
console.log(JSON.stringify({ output, status: proof.status, failure, frames: result?.symbolizedAbortFrames, cleanup }));
if (failure) process.exitCode = 1;
