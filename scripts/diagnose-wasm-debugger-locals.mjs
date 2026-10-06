// Prerequisite only: tiny Wasm call + debugger locals, NO source media or codec.
import assert from "node:assert/strict";
import { chromium } from "@playwright/test";
import { access, mkdir, readFile, writeFile } from "node:fs/promises";
import { createHash } from "node:crypto";
import path from "node:path";
import { createOwnedRuntimeScratch } from "./lib/owned-runtime-scratch.mjs";
import { connectDebuggerTransport } from "./lib/cdp-debugger-transport.mjs";
import { attachFailureLocalCapture } from "./lib/cdp-failure-local-capture.mjs";
const root = path.resolve(import.meta.dirname, ".."), stamp = new Date().toISOString().replaceAll(/[:.]/g, "-");
const output = path.join(root, `output/playwright/${stamp}-wasm-debugger-locals.json`);
let runtime, context, transport, inspector, capture = null, failure = null, evaluation = null, browserVersion = null;
const cleanup = { contextClosed: false, runtimeRemoved: false }, cleanupErrors = [];
// (module (import "env" "inspect" (func (param i32)))
//   (func (export "probe") (param i32) local.get 0 call 0))
const bytes = [0,97,115,109,1,0,0,0,1,5,1,96,1,127,0,2,15,1,3,101,110,118,7,105,110,115,112,101,99,116,0,0,
  3,2,1,0,7,9,1,5,112,114,111,98,101,0,1,10,8,1,6,0,32,0,16,0,11];
assert.equal(WebAssembly.validate(new Uint8Array(bytes)), true);
const sourceFiles = ["scripts/diagnose-wasm-debugger-locals.mjs", "scripts/lib/cdp-bounded-local-scopes.mjs",
  "scripts/lib/cdp-debugger-transport.mjs", "scripts/lib/cdp-failure-local-capture.mjs", "scripts/lib/owned-runtime-scratch.mjs"];
const sourcePins = Object.fromEntries(await Promise.all(sourceFiles.map(async file => [file,
  createHash("sha256").update(await readFile(path.join(root, file))).digest("hex")])));
try {
  runtime = await createOwnedRuntimeScratch("wasm-locals-prerequisite-");
  context = await chromium.launchPersistentContext(path.join(runtime.directory, "profile"), {
    executablePath: "C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe", headless: true, env: runtime.env,
    args: ["--remote-debugging-port=0"] });
  browserVersion = context.browser().version();
  const page = context.pages()[0];
  const port = Number((await readFile(path.join(runtime.directory, "profile/DevToolsActivePort"), "utf8")).split(/\r?\n/)[0]);
  assert.ok(Number.isInteger(port) && port > 0);
  const version = await (await fetch(`http://127.0.0.1:${port}/json/version`)).json();
  transport = await connectDebuggerTransport(version.webSocketDebuggerUrl);
  const workerUrl = await page.evaluate(bytes => {
    const url = URL.createObjectURL(new Blob([`onmessage = () => {
      let hostValue = null;
      const instance = new WebAssembly.Instance(new WebAssembly.Module(new Uint8Array(${JSON.stringify(bytes)})),
        { env: { inspect(value) { hostValue = value; debugger; } } });
      instance.exports.probe(123456); postMessage({hostValue});
    }; postMessage("ready");`], { type: "text/javascript" }));
    window.probeWorker = new Worker(url);
    return new Promise(resolve => { window.probeWorker.onmessage = () => resolve(url); });
  }, bytes);
  const { targetInfos } = await transport.send("Target.getTargets");
  const workers = targetInfos.filter(target => target.type === "worker" && target.url === workerUrl);
  assert.equal(workers.length, 1);
  inspector = await attachFailureLocalCapture(transport, workers[0].targetId, new Set(["probe"]));
  const invoke = page.evaluate(() => new Promise(resolve => {
    window.probeWorker.onmessage = event => resolve(event.data); window.probeWorker.postMessage("probe");
  }));
  let timer;
  try {
    evaluation = await Promise.race([invoke, new Promise((_, reject) => {
      timer = setTimeout(() => reject(new Error("Debugger prerequisite deadline")), 15000);
    })]);
  } finally { clearTimeout(timer); }
  const observed = await inspector.report();
  assert.equal(observed.pauses, 1); assert.deepEqual(observed.errors, []);
  assert.equal(observed.wasmScriptsObserved, 1); assert.equal(observed.captures.length, 1);
  capture = observed.captures[0];
  assert.equal(evaluation.hostValue, 123456);
  const wasmFrame = capture.frames.find(frame => /wasm-function|probe/.test(frame.functionName));
  assert.ok(wasmFrame, "Native Wasm frame required, not just JavaScript host argument");
  assert.ok(JSON.stringify(wasmFrame.scopes).includes("123456"), "Wasm locals did not expose the known argument");
} catch (error) { failure = { message: String(error), stack: error.stack }; process.exitCode = 1; }
finally {
  const attempt = async operation => { try { await operation(); } catch (error) { cleanupErrors.push(String(error)); process.exitCode = 1; } };
  await attempt(async () => { if (inspector) await inspector.close(); else transport?.close(); });
  await attempt(async () => { if (context) { await context.close(); cleanup.contextClosed = true; } });
  await attempt(async () => { if (runtime) { await runtime.close(); await assert.rejects(access(runtime.directory), { code: "ENOENT" }); cleanup.runtimeRemoved = true; } });
  const report = { scope: "tiny-component-only prerequisite, not production conversion or memory acceptance",
    status: failure || cleanupErrors.length ? "failed-prerequisite" : "passed-prerequisite", browserVersion,
    originalRead: false, mediaIoCalls: 0, conversionsPerformed: 0, publicAcceptance: false,
    completeChromiumMemoryAcceptance: false, binaryBytes: bytes.length, evaluation, capture, failure, cleanup, cleanupErrors,
    runtimeDirectory: runtime?.directory ?? null, sourcePins, dedicatedWorkerTransportVerified: Boolean(capture),
    originalFileUsed: false };
  await mkdir(path.dirname(output), { recursive: true });
  await writeFile(output, JSON.stringify(report, null, 2) + "\n", { flag: "wx" }); console.log(`${report.status}: ${output}`);
}
