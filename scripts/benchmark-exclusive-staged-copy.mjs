// Controlled6.414GB storage-only comparison; NOT a substitute for the original
// media conversion, its full source, fidelity, memory or three-run gate.
import assert from "node:assert/strict";
import { spawn } from "node:child_process";
import { createHash } from "node:crypto";
import { createReadStream } from "node:fs";
import { access, readFile, readdir, stat, statfs, writeFile } from "node:fs/promises";
import { createServer } from "node:http";
import path from "node:path";
import { gzipSync, gunzipSync } from "node:zlib";
import { chromium } from "@playwright/test";
import { sha } from "./lib/stable-ui-headless-baseline-recipe.mjs";
import { createOwnedRuntimeScratch, finishOwnedCleanup } from "./lib/owned-runtime-scratch.mjs";
import { inspectStressHostMemory } from "./lib/host-memory-preflight.mjs";
import { inspectInstalledChromePin, assertInstalledChromePinsEqual } from "./lib/installed-chrome-pin.mjs";
import { queryProcessIdentity, observeOwnedProcessExit } from "./lib/owned-process-exit-observation.mjs";
import { sampleChromiumTree, stableWindow } from "./lib/chromium-private-memory.mjs";
import { startParallelMemoryObserver } from "./lib/parallel-memory-observer.mjs";
import { makeStagedCopyDiagnosticWorker } from "./lib/staged-copy-diagnostic-worker.mjs";
assert.equal(process.argv.length, 2);
const root = path.resolve(import.meta.dirname, ".."), stamp = new Date().toISOString().replaceAll(/[:.]/g, "-");
const output = `evidence/${stamp}-exclusive-staged-copy.json`, runtime = await createOwnedRuntimeScratch("exclusive-staged-copy-");
const pause = ms => new Promise(resolve => setTimeout(resolve, ms));
const state = { recordedAt: new Date().toISOString(), status: "starting", scope: "controlled-production-loop-storage-only-not-media-acceptance",
  output, runtimeDirectory: runtime.directory, browserMode: "headless", windowsHidden: true, noDocker: true,
  fixtureBytes: 6414309978, formula: "peak complete Chromium tree private bytes minus same stable blank instance private bytes",
  primaryLimitMiB: 250, host: null, diskFreeBytes: null, browserPin: null, blank: null, runs: [], adverse: [],
  forbiddenRequests: [], identities: [], sourcePins: {}, postSourcePins: {}, failure: null, cleanupErrors: [],
  mediaConversionAcceptance: false, fullOriginalAcceptance: false, publicAcceptance: false, nativeConvertersUsed: false };
let server, chrome, browser, observer, page, origin, nativeReport;
const hashFile = async file => { const h = createHash("sha256"); for await (const bytes of createReadStream(file, { highWaterMark: 1048576 })) h.update(bytes); return h.digest("hex"); };
const checkpoint = () => writeFile(path.join(root, output), JSON.stringify(state, null, 2) + "\n");
const birth = async (child, role) => { const identity = await queryProcessIdentity(child.pid); assert.ok(identity && identity.parentPid === process.pid); state.identities.push({ role, identity }); return identity; };
async function stableBlank() {
  const started = Date.now(), samples = [];
  while (Date.now() - started < 45000) {
    samples.push({ ...await sampleChromiumTree(chrome.pid), elapsedMs: Date.now() - started, timestamp: new Date().toISOString() });
    const stable = stableWindow(samples); if (stable) return stable;
    await pause(1000);
  }
  throw new Error("Storage diagnostic blank did not stabilize");
}
async function filesOfSize(directory, size) {
  const found = [], directories = [directory]; let count = 0;
  while (directories.length) for (const entry of await readdir(directories.pop(), { withFileTypes: true })) {
    assert.ok(++count <= 20000 && !entry.isSymbolicLink()); const file = path.join(entry.parentPath, entry.name);
    if (entry.isDirectory()) directories.push(file); else if (entry.isFile() && (await stat(file)).size === size) found.push(file);
  }
  return found;
}
async function command(operation) {
  return page.evaluate(data => new Promise((resolve, reject) => {
    const worker = window.copyDiagnosticWorker, id = ++window.copyDiagnosticSequence;
    const timer = setTimeout(() => { worker.removeEventListener("message", listener); reject(new Error("Copy diagnostic operation timed out")); }, 600000);
    function listener({ data: response }) { if (response.id !== id) return; clearTimeout(timer); worker.removeEventListener("message", listener); resolve(response); }
    worker.addEventListener("message", listener); worker.postMessage({ ...data, id });
  }), operation);
}
try {
  state.host = await inspectStressHostMemory(); assert.equal(state.host.safeToStart, true);
  const disk = await statfs(root); state.diskFreeBytes = disk.bavail * disk.bsize; assert.ok(state.diskFreeBytes >= 32 * 1024 ** 3);
  const workerSource = await readFile(path.join(root, "workers/conversion.worker.ts"), "utf8"), recipe = makeStagedCopyDiagnosticWorker(workerSource);
  state.recipe = recipe; delete state.recipe.generated;
  const workerText = makeStagedCopyDiagnosticWorker(workerSource).generated;
  const files = ["scripts/benchmark-exclusive-staged-copy.mjs", "scripts/lib/staged-copy-diagnostic-worker.mjs", "scripts/lib/exclusive-staged-writer.mjs",
    "scripts/lib/exclusive-staged-writer.d.mts", "scripts/lib/exclusive-stage-worker-recipe.mjs", "workers/conversion.worker.ts"];
  for (let i = 0; i < files.length; i++) if (files[i].endsWith(".mjs")) {
    const source = await readFile(path.join(root, files[i]), "utf8");
    for (const match of source.matchAll(/^import(?:(?!;)[\s\S])*?from\s+"(\.[^"]+)"\s*;/gm)) {
      const next = path.relative(root, path.resolve(root, path.dirname(files[i]), match[1])).replaceAll("\\", "/");
      assert.ok(!next.startsWith("..") && !path.isAbsolute(next)); if (!files.includes(next)) files.push(next);
    }
  }
  assert.ok(files.length <= 128); const preimages = {};
  for (const file of files) { const bytes = await readFile(path.join(root, file)); assert.ok(bytes.length <= 2097152); state.sourcePins[file] = sha(bytes); preimages[file] = bytes.toString("base64"); }
  const rawSources = Buffer.from(JSON.stringify({ sourcePins: state.sourcePins, preimages, generatedWorker: workerText })); assert.ok(rawSources.length <= 2097152);
  const sourceZip = gzipSync(rawSources, { level: 9 }); assert.deepEqual(gunzipSync(sourceZip), rawSources);
  const sourceArchive = `outputs/reports/${stamp}-exclusive-staged-copy-sources.json.gz`; await writeFile(path.join(root, sourceArchive), sourceZip, { flag: "wx" });
  state.sourceArchive = { path: sourceArchive, bytes: sourceZip.length, sha256: sha(sourceZip), restoredBytes: rawSources.length, restoredSha256: sha(rawSources) };
  state.browserPin = await inspectInstalledChromePin();
  server = createServer((request, response) => {
    const routes = { "/": ["text/html", "<!doctype html><meta charset=utf-8><title>Storage-only diagnostic</title>"], "/copy-worker.mjs": ["text/javascript", workerText], "/favicon.ico": ["image/x-icon", ""] };
    const asset = routes[request.url]; response.writeHead(asset ? 200 : 404, { "Content-Type": asset?.[0] ?? "text/plain", "Cache-Control": "no-store",
      "Cross-Origin-Opener-Policy": "same-origin", "Cross-Origin-Embedder-Policy": "require-corp",
      "Content-Security-Policy": "default-src 'self'; script-src 'self'; worker-src 'self'; connect-src 'self'; object-src 'none'; base-uri 'none'" }); response.end(asset?.[1] ?? "Not found");
  });
  await new Promise(resolve => server.listen(0, "127.0.0.1", resolve)); origin = `http://127.0.0.1:${server.address().port}`;
  const profile = path.join(runtime.directory, "profile");
  chrome = spawn("C:/Program Files/Google/Chrome/Application/chrome.exe", ["--headless=new", "--remote-debugging-port=0", "--no-first-run", "--no-default-browser-check", `--user-data-dir=${profile}`, "about:blank"],
    { cwd: root, env: runtime.env, windowsHide: true, stdio: "ignore" }); chrome.on("error", () => {}); await birth(chrome, "headless-chrome");
  const deadline = Date.now() + 30000; let port;
  while (Date.now() < deadline && !port) { try { port = Number((await readFile(path.join(profile, "DevToolsActivePort"), "utf8")).split("\n")[0]); } catch { await pause(250); } }
  assert.ok(port > 0); browser = await chromium.connectOverCDP(`http://127.0.0.1:${port}`);
  const context = browser.contexts()[0]; page = context.pages()[0]; assert.equal(page.url(), "about:blank");
  observer = await startParallelMemoryObserver(chrome.pid, runtime.directory); await birth({ pid: observer.pid }, "native-memory-observer");
  state.status = "five-minute-blank-settlement"; await checkpoint(); console.log(JSON.stringify({ output, pid: process.pid, root: state.identities[0], estimatedMinutes: 15 }));
  const early = await stableBlank(); observer.setPhase("blank-startup-settle"); await pause(300000); observer.setPhase("blank-baseline");
  state.blank = await stableBlank(); assert.ok(state.blank.privateBytes <= early.privateBytes, "No larger replacement baseline");
  await context.route("**/*", async route => {
    const request = route.request(); if (request.method() === "GET" && [origin + "/", origin + "/copy-worker.mjs", origin + "/favicon.ico"].includes(request.url())) return route.continue();
    if (state.forbiddenRequests.length < 16) state.forbiddenRequests.push({ method: request.method(), url: request.url().slice(0, 256) }); await route.abort();
  });
  await page.goto(origin); await page.evaluate(() => { window.copyDiagnosticSequence = 0; window.copyDiagnosticWorker = new Worker("/copy-worker.mjs", { type: "module" }); });
  observer.setPhase("fixture-generation"); const generated = await command({ op: "generate" }); assert.equal(generated.error, undefined); state.generated = generated.result;
  const sourceFiles = await filesOfSize(profile, state.fixtureBytes); assert.equal(sourceFiles.length, 1); const sourceFile = sourceFiles[0];
  const expected = createHash("sha256"), pattern = Buffer.alloc(65536); for (let i = 0; i < pattern.length; i++) pattern[i] = (i * 31 + 17) & 255;
  for (let at = 0; at < state.fixtureBytes; at += pattern.length) expected.update(pattern.subarray(0, Math.min(pattern.length, state.fixtureBytes - at)));
  state.fixtureSha256 = expected.digest("hex"); assert.equal(await hashFile(sourceFile), state.fixtureSha256);
  for (const [index, mode] of ["convenience", "exclusive", "exclusive", "convenience", "convenience", "exclusive"].entries()) {
    const phase = `copy-${index + 1}-${mode}`; await observer.through(observer.setPhase(phase));
    const result = await command({ op: "copy", mode }); assert.equal(result.error, undefined); assert.equal(result.result.outputBytes, state.fixtureBytes);
    const finished = Date.now(); await observer.through(finished); observer.setPhase(`validation-${index + 1}`);
    const outputFiles = (await filesOfSize(profile, state.fixtureBytes)).filter(file => file !== sourceFile); assert.equal(outputFiles.length, 1);
    const hash = await hashFile(outputFiles[0]); assert.equal(hash, state.fixtureSha256);
    const native = observer.peaks([phase]); assert.ok(native.validSamples > 0 && native.peak);
    const incremental = (native.peak.privateBytes - state.blank.privateBytes) / 1048576;
    const row = { number: index + 1, ...result.result, outputSha256: hash, incrementalTreePrivateMiB: incremental,
      peakTreePrivateBytes: native.peak.privateBytes, peakTreeRssBytes: native.peakRssBytes, validSamples: native.validSamples, unavailableSamples: native.unavailableSamples };
    state.runs.push(row); assert.equal((await command({ op: "remove" })).result.removed, true); await assert.rejects(access(outputFiles[0]), { code: "ENOENT" });
    assert.ok(incremental <= 250, "Storage diagnostic also exceeded250MiB; not a route acceptance");
    if (mode === "exclusive") { assert.equal(row.writer.locks, 1); assert.equal(row.writer.releases, 1); assert.equal(row.writer.retainedWriter, false); }
    observer.setPhase(`cleanup-${index + 1}`); await pause(2000); await checkpoint();
  }
  for (const fault of [{ mode: "exclusive", cancelAfterBytes: 1048576 }, { mode: "exclusive", fault: "permission" }, { mode: "exclusive", fault: "quota" }]) {
    observer.setPhase("adverse"); const result = await command({ op: "copy", ...fault });
    assert.equal(result.error?.name, fault.cancelAfterBytes ? "AbortError" : fault.fault === "quota" ? "QuotaExceededError" : "NotAllowedError");
    assert.equal(result.cleanup.outputRemoved, true); state.adverse.push({ ...fault, ...result });
    assert.deepEqual(await filesOfSize(profile, state.fixtureBytes), [sourceFile]);
  }
  assert.deepEqual(state.forbiddenRequests, []); state.status = "six-exact-large-copies-and-three-adverse-cases-passed-not-media-acceptance";
} catch (error) { state.failure = { name: error.name, message: String(error.message).slice(0, 2048), stack: String(error.stack).slice(0, 4096) }; state.status = "failed-not-media-acceptance"; }
finally {
  try { await finishOwnedCleanup([
    async () => { if (observer) { await observer.stop(); nativeReport = observer.report(); } },
    async () => { if (browser) await browser.close(); },
    async () => { if (server) await new Promise((resolve, reject) => server.close(error => error ? reject(error) : resolve())); },
  ]); } catch (error) { state.cleanupErrors.push(String(error).slice(0, 2048)); }
  if (chrome?.exitCode == null && chrome?.signalCode == null) {
    const launch = state.identities.find(row => row.role === "headless-chrome");
    if (launch) {
      try {
        const current = await queryProcessIdentity(chrome.pid);
        if (current && current.parentPid === launch.identity.parentPid && current.createdAt === launch.identity.createdAt) chrome.kill();
      } catch (error) { state.cleanupErrors.push(String(error)); }
    }
  }
  let allOwnedGone = true;
  for (const row of state.identities) { try { row.exitObservation = await observeOwnedProcessExit(row.identity); assert.equal(row.exitObservation.status, "owned-identity-absent"); } catch (error) { allOwnedGone = false; state.cleanupErrors.push(String(error)); } }
  try { assert.equal(allOwnedGone, true, "Never remove scratch under a live owned process"); await runtime.close(); await assert.rejects(access(runtime.directory), { code: "ENOENT" }); state.runtimeRemoved = true; } catch (error) { state.cleanupErrors.push(String(error)); }
  try {
    const browserAfter = await inspectInstalledChromePin(); if (state.browserPin) assertInstalledChromePinsEqual(state.browserPin, browserAfter); state.browserPinAfter = browserAfter;
    for (const [file, hash] of Object.entries(state.sourcePins)) { state.postSourcePins[file] = sha(await readFile(path.join(root, file))); assert.equal(state.postSourcePins[file], hash); }
    if (nativeReport) { const raw = Buffer.from(JSON.stringify(nativeReport)); assert.ok(raw.length <= 8388608); const zip = gzipSync(raw, { level: 9 }); assert.deepEqual(gunzipSync(zip), raw);
      const file = `outputs/reports/${stamp}-exclusive-staged-copy-native.json.gz`; await writeFile(path.join(root, file), zip, { flag: "wx" }); state.nativeArchive = { path: file, bytes: zip.length, sha256: sha(zip), restoredBytes: raw.length, restoredSha256: sha(raw) }; }
  } catch (error) { state.cleanupErrors.push(String(error)); }
  state.finishedAt = new Date().toISOString(); await checkpoint();
}
console.log(JSON.stringify({ output, status: state.status, runs: state.runs.map(row => ({ mode: row.mode, elapsedMs: row.elapsedMs, incrementalTreePrivateMiB: row.incrementalTreePrivateMiB })), failure: state.failure, cleanupErrors: state.cleanupErrors }));
if (state.failure || state.cleanupErrors.length) process.exitCode = 1;
