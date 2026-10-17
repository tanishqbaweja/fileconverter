// Short browser-only tracing capability probe. Arithmetic Wasm fixture only:
// no user files, converter, media output, flags experiment or memory acceptance.
import "./lib/reliable-readonly-preflight.mjs";
import assert from "node:assert/strict";
import { spawn } from "node:child_process";
import { readFile, writeFile, statfs } from "node:fs/promises";
import path from "node:path";
import { gzipSync } from "node:zlib";
import { chromium } from "@playwright/test";
import { createOwnedRuntimeScratch } from "./lib/owned-runtime-scratch.mjs";
import { inspectStressHostMemory } from "./lib/host-memory-preflight.mjs";
import { inspectInstalledChromePin, assertInstalledChromePinsEqual } from "./lib/installed-chrome-pin.mjs";
import { queryReliableProcessIdentity } from "./lib/reliable-owned-identity.mjs";
import { observeOwnedProcessExit } from "./lib/owned-process-exit-observation.mjs";
import { sampleChromiumTree } from "./lib/chromium-private-memory.mjs";
import { sha } from "./lib/stable-ui-headless-baseline-recipe.mjs";
import { RECOVERY_TRACE_CATEGORIES, RECOVERY_TRACE_LIMITS, summarizeRecoveryExecution } from "./lib/recovery-execution-trace.mjs";
const root = path.resolve(import.meta.dirname, ".."), stamp = new Date().toISOString().replaceAll(/[:.]/g, "-");
const runtime = await createOwnedRuntimeScratch("recovery-trace-probe-");
const result = { recordedAt: new Date().toISOString(), status: "running-browser-capability-probe", sources: {},
  identity: null, sampledBirths: [], absences: [], categoriesBefore: null, categoriesAfter: null,
  browserVersion: null, rawArchive: null, summary: null, arithmeticResult: null, dataLossOccurred: null,
  fileInputs: 0, conversions: 0, acceptance: false, browserFlagsChangedFromQualification: false,
  runtimeDirectory: runtime.directory, runtimeRemoved: false, failure: null, cleanupErrors: [] };
const reportPath = `evidence/${stamp}-recovery-trace-capability.json`;
let browser, session, tracing = false;
try {
  const host = await inspectStressHostMemory(); assert.equal(host.safeToStart, true); result.host = host;
  const disk = await statfs(root); assert.ok(disk.bavail * disk.bsize >= 32 * 1024 ** 3);
  for (const file of ["scripts/probe-recovery-tracing.mjs", "scripts/lib/recovery-execution-trace.mjs", "package-lock.json"]) {
    const bytes = await readFile(path.join(root, file)); result.sources[file] = { sha256: sha(bytes), preimage: bytes.toString("base64") };
  }
  const pin = await inspectInstalledChromePin(); result.pinBefore = pin;
  const child = spawn(pin.launcher.path, ["--headless=new", "--remote-debugging-port=0", `--user-data-dir=${runtime.directory}`,
    "--no-first-run", "--no-default-browser-check", "--disable-background-networking", "--disable-component-update", "--disable-default-apps",
    "--disable-domain-reliability", "--disable-extensions", "--disable-features=MediaRouter,OptimizationGuideModelDownloading,OptimizationHints,OptimizationTargetPrediction",
    "--disable-sync", "--metrics-recording-only", "about:blank"], { cwd: root, env: runtime.env, windowsHide: true, stdio: "ignore" });
  child.on("error", () => {}); result.identity = await queryReliableProcessIdentity(child.pid); assert.equal(result.identity.parentPid, process.pid);
  await writeFile(path.join(root, reportPath), JSON.stringify(result, null, 2), { flag: "wx" });
  let port; const deadline = Date.now() + 30000;
  while (!port && Date.now() < deadline) {
    try { port = Number((await readFile(path.join(runtime.directory, "DevToolsActivePort"), "utf8")).split(/\r?\n/)[0]); } catch { /* bounded owned startup */ }
    if (!port) await new Promise(resolve => setTimeout(resolve, 250));
  }
  assert.ok(port); browser = await chromium.connectOverCDP(`http://127.0.0.1:${port}`); assert.equal(browser.version(), pin.version);
  const context = browser.contexts()[0], page = context.pages()[0]; await context.route("**/*", route => route.abort());
  result.sampledBirths.push(...(await sampleChromiumTree(child.pid)).processes);
  session = await browser.newBrowserCDPSession(); result.browserVersion = await session.send("Browser.getVersion");
  result.categoriesBefore = await session.send("Tracing.getCategories");
  assert.ok(Buffer.byteLength(JSON.stringify(result.categoriesBefore)) <= 524288);
  // Selection itself is tested even when discovery metadata omits a category.
  await session.send("Tracing.start", { transferMode: "ReturnAsStream", traceConfig: { recordMode: "recordUntilFull",
    traceBufferSizeInKb: RECOVERY_TRACE_LIMITS.chromiumBufferKiB, includedCategories: [...RECOVERY_TRACE_CATEGORIES, "v8"], excludedCategories: ["*"] } }); tracing = true;
  result.arithmeticResult = await page.evaluate(async () => {
    const bytes = new Uint8Array([0,97,115,109,1,0,0,0,1,7,1,96,2,127,127,1,127,3,2,1,0,7,7,1,3,97,100,100,0,0,10,9,1,7,0,32,0,32,1,106,11]);
    const compiled = await WebAssembly.compile(bytes), instance = await WebAssembly.instantiate(compiled);
    let sum = 0; for (let index = 0; index < 20000; index++) sum += instance.exports.add(index, 1);
    return { moduleBytes: bytes.length, calls: 20000, sum };
  });
  assert.equal(result.arithmeticResult.sum, 200010000);
  const finished = new Promise(resolve => session.once("Tracing.tracingComplete", resolve));
  await session.send("Tracing.end"); tracing = false; const reply = await finished;
  result.dataLossOccurred = reply.dataLossOccurred; assert.ok(reply.stream);
  const chunks = []; let bytes = 0;
  try {
    for (;;) {
      const row = await session.send("IO.read", { handle: reply.stream, size: RECOVERY_TRACE_LIMITS.readBytes });
      const value = Buffer.from(row.data, row.base64Encoded ? "base64" : "utf8"); bytes += value.length;
      assert.ok(value.length <= RECOVERY_TRACE_LIMITS.readBytes && bytes <= RECOVERY_TRACE_LIMITS.serializedBytes);
      chunks.push(value); if (row.eof) break;
    }
  } finally { await session.send("IO.close", { handle: reply.stream }); }
  const raw = Buffer.concat(chunks), compressed = gzipSync(raw, { level: 9 }); assert.ok(compressed.length <= RECOVERY_TRACE_LIMITS.compressedBytes);
  const archive = `outputs/reports/${stamp}-recovery-trace-capability.json.gz`;
  await writeFile(path.join(root, archive), compressed, { flag: "wx" });
  result.rawArchive = { path: archive, bytes: compressed.length, sha256: sha(compressed), restoredBytes: raw.length, restoredSha256: sha(raw) };
  result.summary = summarizeRecoveryExecution(JSON.parse(raw));
  const trace = JSON.parse(raw), wasmEvents = trace.traceEvents.filter(row => /wasm/i.test(row.name ?? ""));
  result.wasmEvents = wasmEvents.map(({ name, cat, ph, pid, tid, ts, dur, args }) => ({ name, cat, ph, pid, tid, ts, dur, args }));
  assert.ok(result.wasmEvents.length <= 256); result.categoriesAfter = await session.send("Tracing.getCategories");
  assert.equal(reply.dataLossOccurred, false); assert.ok(wasmEvents.length > 0, "Actual compiler events required, not merely accepted category strings");
  result.sampledBirths.push(...(await sampleChromiumTree(child.pid)).processes);
  result.pinAfter = await inspectInstalledChromePin(); assertInstalledChromePinsEqual(pin, result.pinAfter);
  for (const [file, record] of Object.entries(result.sources)) assert.equal(sha(await readFile(path.join(root, file))), record.sha256);
  result.status = "passed-browser-only-explicit-v8-event-selection-probe";
} catch (error) { result.failure = { message: error.message, stack: error.stack?.slice(0, 8192) }; process.exitCode = 1; }
finally {
  try { if (tracing) await session.send("Tracing.end"); await session?.detach(); }
  catch (error) { result.cleanupErrors.push(String(error)); }
  try { if (browser) { const close = await browser.newBrowserCDPSession(); await close.send("Browser.close").catch(() => {}); } }
  catch (error) { result.cleanupErrors.push(String(error)); }
  try {
    await browser?.close();
    const identities = [...new Map([result.identity, ...result.sampledBirths].filter(Boolean).map(row => [row.pid + ":" + row.createdAt, row])).values()];
    for (const identity of identities) { const absence = await observeOwnedProcessExit(identity); assert.equal(absence.status, "owned-identity-absent"); result.absences.push(absence); }
    await runtime.close(); result.runtimeRemoved = true;
  } catch (error) { result.cleanupErrors.push(String(error)); process.exitCode = 1; }
  if (result.failure || result.cleanupErrors.length) result.status = "failed-browser-only-trace-capability-probe";
  await writeFile(path.join(root, reportPath), JSON.stringify(result, null, 2) + "\n");
  console.log(JSON.stringify({ reportPath, status: result.status, listedBefore: result.categoriesBefore?.categories?.length,
    wasmEvents: result.wasmEvents?.map(row => ({ name: row.name, cat: row.cat })), failure: result.failure, cleanupErrors: result.cleanupErrors }));
}
