// Matched page-load diagnostic only. No selected input, converter job or promotion.
import assert from "node:assert/strict";
import { spawn, execFile } from "node:child_process";
import { createHash } from "node:crypto";
import { createReadStream } from "node:fs";
import { access, lstat, mkdir, readFile, realpath, stat } from "node:fs/promises";
import { createServer } from "node:http";
import path from "node:path";
import { pipeline } from "node:stream/promises";
import { promisify } from "node:util";
import { chromium } from "@playwright/test";
import { rejectNonStaticRequest } from "../../lib/static-host-request-policy.ts";
import { createOwnedRuntimeScratch } from "./owned-runtime-scratch.mjs";
import { inspectStressHostMemory } from "./host-memory-preflight.mjs";
import { queryReliableProcessIdentity } from "./reliable-owned-identity.mjs";
import { observeOwnedProcessExit } from "./owned-process-exit-observation.mjs";
import { inspectInstalledChromePin, assertInstalledChromePinsEqual } from "./installed-chrome-pin.mjs";
import { startParallelMemoryObserver } from "./parallel-memory-observer.mjs";
import { startChromiumMemoryMonitor as startBirthAwareMonitor } from "./birth-aware-chromium-memory.mjs";
import { sampleChromiumTree, stableWindow } from "./chromium-private-memory.mjs";
import { connectRealmSampler } from "./cdp-realm-memory.mjs";

const execute = promisify(execFile), pause = ms => new Promise(resolve => setTimeout(resolve, ms));
const hashFile = async filename => { const digest = createHash("sha256"); for await (const bytes of createReadStream(filename, { highWaterMark: 262144 })) digest.update(bytes); return digest.digest("hex"); };
const median = values => { assert.equal(values.length, 3); return [...values].sort((a, b) => a - b)[1]; };
export function summarizeShellLoadPairs(rows) {
  assert.equal(rows.length, 6);
  const pairs = [0, 2, 4].map(start => {
    const pair = rows.slice(start, start + 2), baseline = pair.find(row => row.variant === "production"), candidate = pair.find(row => row.variant === "static");
    assert.ok(baseline && candidate && Number.isFinite(baseline.incrementalLoadPrivateMiB) && Number.isFinite(candidate.incrementalLoadPrivateMiB));
    return { baselineMiB: baseline.incrementalLoadPrivateMiB, candidateMiB: candidate.incrementalLoadPrivateMiB,
      candidateReductionMiB: baseline.incrementalLoadPrivateMiB - candidate.incrementalLoadPrivateMiB };
  });
  return { pairs, baselineMedianMiB: median(pairs.map(pair => pair.baselineMiB)), candidateMedianMiB: median(pairs.map(pair => pair.candidateMiB)),
    pairedReductionMedianMiB: median(pairs.map(pair => pair.candidateReductionMiB)),
    candidateLowerInEveryPair: pairs.every(pair => pair.candidateReductionMiB > 0),
    scope: "Three matched clean-session page-load pairs only; not conversion memory, speed, statistical confidence or release acceptance" };
}

async function startStaticPreview(directory, htmlFilename, proof) {
  assert.equal(await realpath(directory), directory);
  const rules = (await readFile(path.join(directory, "_headers"), "utf8")).trim().split(/\r?\n\s*\r?\n/).map(block => {
    const [pattern, ...lines] = block.split(/\r?\n/); assert.match(pattern, /^\/[a-z/]*\*$/);
    return { prefix: pattern.slice(0, -1), headers: Object.fromEntries(lines.map(line => { const match = /^\s+([A-Za-z-]+): (.+)$/.exec(line); assert.ok(match); return [match[1], match[2]]; })) };
  });
  const mime = { ".js": "text/javascript", ".mjs": "text/javascript", ".css": "text/css", ".html": "text/html", ".wasm": "application/wasm",
    ".json": "application/json", ".svg": "image/svg+xml", ".png": "image/png", ".txt": "text/plain", ".webmanifest": "application/manifest+json", ".woff2": "font/woff2" };
  const server = createServer(async (req, res) => {
    try {
      const url = new URL(req.url, "http://127.0.0.1"), headers = {};
      for (const rule of rules) if (url.pathname.startsWith(rule.prefix)) Object.assign(headers, rule.headers);
      const denied = rejectNonStaticRequest(new Request(url, { method: req.method }));
      if (denied) { denied.headers.forEach((value, key) => { headers[key] = value; }); res.writeHead(denied.status, { ...headers, "Content-Length": "0" }); res.end(); return; }
      const segments = decodeURIComponent(url.pathname).split("/").filter(Boolean);
      if (segments.some(segment => segment.startsWith(".") || /[\\:\0]/.test(segment) || ["_headers", "_redirects"].includes(segment))) { res.writeHead(404, headers); res.end(); return; }
      const filename = path.resolve(directory, segments.length ? segments.join("/") : htmlFilename); assert.ok(filename.startsWith(directory + path.sep));
      const info = await lstat(filename);
      if (!info.isFile() || info.isSymbolicLink() || await realpath(filename) !== filename) { res.writeHead(404, headers); res.end(); return; }
      res.writeHead(200, { ...headers, "Content-Type": mime[path.extname(filename)] ?? "application/octet-stream", "Content-Length": String(info.size) });
      if (req.method === "HEAD") res.end(); else await pipeline(createReadStream(filename, { highWaterMark: 65536 }), res);
    } catch (error) { if (!res.headersSent) { res.writeHead(error.code === "ENOENT" || error.code === "ENOTDIR" ? 404 : 500); res.end(); } else res.destroy(); }
  });
  server.requestTimeout = 10000; server.headersTimeout = 10000; server.maxConnections = 32;
  await new Promise((resolve, reject) => { server.once("error", reject); server.listen(0, "127.0.0.1", resolve); });
  return { origin: `http://127.0.0.1:${server.address().port}`, async close() { server.closeAllConnections(); await new Promise((resolve, reject) => server.close(error => error ? reject(error) : resolve())); proof.staticServerClosed = true; } };
}

async function stopKnown(child, identity) {
  if (!child || child.exitCode !== null || child.signalCode !== null) return;
  assert.ok(identity); assert.deepEqual(await queryReliableProcessIdentity(child.pid), identity);
  await execute("taskkill.exe", ["/PID", String(child.pid), "/T", "/F"], { windowsHide: true, timeout: 15000, maxBuffer: 16384 });
}

export async function runStaticShellMemoryComparison({ root, runtime, clientDirectory, htmlFilename, report }) {
  assert.equal(process.platform, "win32");
  const proof = { scope: "Matched normal-profile whole-Chromium PAGE-LOAD only; zero file selection/conversion; exact early blank baseline and no process exclusions",
    safeToRemoveRuntime: false, staticServerClosed: true, cases: [], failures: [], conversionsPerformed: 0, filesSelected: 0, headed: false,
    normalBrowserServicesChanged: false, formula: "(peak simultaneous full-tree private bytes during page load and loaded idle - earliest stable clean blank full-tree private bytes) / 1048576",
    conversionMemoryAcceptance: false, publicPromotion: false };
  report.memoryComparison = proof; report.browserLaunched = null;
  let preview, production, productionBirth, productionLog = "";
  const original = path.join(root, "test.mkv");
  const originalIdentity = async () => ({ bytes: (await stat(original)).size, sha256: await hashFile(original) });
  try {
    proof.hostMemoryBefore = await inspectStressHostMemory(); assert.equal(proof.hostMemoryBefore.safeToStart, true);
    proof.protectedOriginalBefore = await originalIdentity(); report.userFilesRead = true; report.protectedOriginalReadForChecksumOnly = true;
    assert.deepEqual(proof.protectedOriginalBefore, { bytes: 2958573265, sha256: "31f36695b5b44c62125a9e4264e84dc085accd21c02cc3487aae597f54b9db34" });
    proof.browserPinBefore = await inspectInstalledChromePin();
    preview = await startStaticPreview(clientDirectory, htmlFilename, proof);
    proof.staticServerClosed = false;
    const lease = createServer(); await new Promise(resolve => lease.listen(0, "127.0.0.1", resolve));
    const productionPort = lease.address().port; await new Promise(resolve => lease.close(resolve));
    const productionOrigin = `http://127.0.0.1:${productionPort}`;
    production = spawn(process.execPath, ["node_modules/wrangler/bin/wrangler.js", "dev", "--config", "dist/server/wrangler.json", "--port", String(productionPort), "--persist-to", path.join(runtime.directory, "baseline-wrangler")],
      { cwd: root, env: { ...runtime.env, WRANGLER_SEND_METRICS: "false" }, windowsHide: true, stdio: ["ignore", "pipe", "pipe"] });
    production.on("error", error => { productionLog += String(error); });
    for (const pipe of [production.stdout, production.stderr]) pipe.on("data", value => { productionLog = (productionLog + value.toString()).slice(-16384); });
    productionBirth = await queryReliableProcessIdentity(production.pid); assert.ok(productionBirth); proof.productionBirth = productionBirth;
    let ready = false;
    const startupDeadline = Date.now() + 30000;
    while (Date.now() < startupDeadline) { assert.equal(production.exitCode, null, productionLog);
      try { const response = await fetch(productionOrigin, { method: "HEAD", signal: AbortSignal.timeout(2000) }); if (response.status === 200) { ready = true; break; } } catch { /* finite startup */ }
      await pause(500);
    }
    assert.ok(ready, productionLog);
    proof.headerPreflight = [];
    for (const origin of [productionOrigin, preview.origin]) {
      const response = await fetch(origin, { method: "HEAD", signal: AbortSignal.timeout(5000) });
      const headers = Object.fromEntries(["content-security-policy", "cross-origin-opener-policy", "cross-origin-embedder-policy", "cross-origin-resource-policy", "x-content-type-options"].map(key => [key, response.headers.get(key)]));
      proof.headerPreflight.push({ status: response.status, headers }); assert.equal(response.status, 200);
    }
    assert.deepEqual(proof.headerPreflight[0], proof.headerPreflight[1], "Same actual security/isolation headers");
    proof.order = ["production", "static", "static", "production", "production", "static"];
    for (const [index, variant] of proof.order.entries()) {
      proof.hostMemoryLatest = await inspectStressHostMemory(); assert.equal(proof.hostMemoryLatest.safeToStart, true);
      const row = { index, variant, samples: [], realms: [], failures: [] }; proof.cases.push(row);
      const caseRuntime = await createOwnedRuntimeScratch("shell-memory-case-");
      let chrome, birth, browser, observer, nativeMonitor, observerBirth, realmSampler;
      try {
        const profile = path.join(caseRuntime.directory, "profile"); await mkdir(profile);
        row.arguments = ["--headless=new", "--remote-debugging-port=0", `--user-data-dir=${profile}`, "--no-first-run", "--no-default-browser-check", "about:blank"];
        chrome = spawn(proof.browserPinBefore.launcher.path, row.arguments, { cwd: root, env: caseRuntime.env, windowsHide: true, stdio: "ignore" });
        birth = await queryReliableProcessIdentity(chrome.pid); assert.ok(birth); row.chromeBirth = birth;
        observer = await startParallelMemoryObserver(chrome.pid, caseRuntime.directory, { startMonitor: async (...args) => { nativeMonitor = await startBirthAwareMonitor(...args); return nativeMonitor; } });
        observerBirth = await queryReliableProcessIdentity(observer.pid); assert.ok(observerBirth); row.observerBirth = observerBirth;
        const deadline = Date.now() + 30000; let lines;
        while (Date.now() < deadline && !lines) { assert.equal(chrome.exitCode, null);
          try { lines = (await readFile(path.join(profile, "DevToolsActivePort"), "utf8")).trim().split(/\r?\n/); } catch { await pause(250); }
        }
        assert.ok(lines && Number(lines[0]) > 0);
        browser = await chromium.connectOverCDP(`http://127.0.0.1:${Number(lines[0])}`); row.browserVersion = browser.version();
        assert.equal(row.browserVersion, proof.browserPinBefore.version);
        const context = browser.contexts()[0], page = context.pages()[0]; assert.equal(page.url(), "about:blank");
        const baselineStarted = Date.now(), baselineDeadline = baselineStarted + 30000;
        while (Date.now() < baselineDeadline && !row.blankBaseline) {
          assert.equal(page.url(), "about:blank"); observer.healthy();
          let tree = { privateBytes: null, rssBytes: null, processes: null }, sampleError = null;
          try { tree = await sampleChromiumTree(chrome.pid); } catch (error) { sampleError = String(error); }
          row.samples.push({ timestamp: new Date().toISOString(), elapsedMs: Date.now() - baselineStarted, ...tree, sampleError });
          row.blankBaseline = stableWindow(row.samples);
          if (!row.blankBaseline) await pause(1000);
        }
        assert.equal(row.blankBaseline?.stable, true, "Earliest blank stability deadline; never replace it with a later loaded baseline");
        row.baselineAdjusted = false;
        const origin = variant === "production" ? productionOrigin : preview.origin;
        observer.setPhase("page-load");
        realmSampler = await connectRealmSampler(`ws://127.0.0.1:${Number(lines[0])}${lines[1]}`, origin);
        row.realms.push({ phase: "blank", ...await realmSampler.sample() });
        const forbiddenRequests = []; let requestOverflow = false;
        context.on("request", request => { const url = new URL(request.url()); if (!["GET", "HEAD"].includes(request.method()) || url.origin !== origin) {
          if (forbiddenRequests.length < 32) forbiddenRequests.push({ method: request.method(), url: request.url().slice(0, 1024) }); else requestOverflow = true;
        } });
        const navigationStarted = performance.now();
        await page.goto(origin + "/", { waitUntil: "domcontentloaded", timeout: 30000 });
        await page.locator(".readiness.ready").waitFor({ state: "visible", timeout: 30000 });
        row.readyMs = performance.now() - navigationStarted;
        assert.equal(await page.locator('input[type="file"]').evaluate(input => input.files.length), 0);
        assert.equal(await page.evaluate(() => window.crossOriginIsolated), true);
        assert.equal(await page.evaluate(() => Boolean(window.__WITHIN_TEST__)), false, "Normal URL, not the test-mode branch");
        row.realms.push({ phase: "ready", ...await realmSampler.sample() });
        row.processDescriptors = (await sampleChromiumTree(chrome.pid)).processes;
        observer.setPhase("loaded-idle");
        await pause(20000);
        row.realms.push({ phase: "idle", ...await realmSampler.sample() });
        assert.deepEqual(forbiddenRequests, []); assert.equal(requestOverflow, false); row.forbiddenRequests = forbiddenRequests;
        await observer.through(Date.now());
        row.loadPeak = observer.peaks(["page-load", "loaded-idle"]); assert.ok(row.loadPeak.validSamples > 0);
        assert.equal(row.loadPeak.unavailableSamples, 0, "Incomplete page-load coverage cannot establish an optimization");
        row.incrementalLoadPrivateMiB = (row.loadPeak.peak.privateBytes - row.blankBaseline.privateBytes) / 1048576;
        row.idlePeak = observer.peaks(["loaded-idle"]);
        observer.setPhase("cleanup");
        report.browserLaunched = true;
      } catch (error) { row.failures.push(String(error.stack ?? error)); throw error; }
      finally {
        const cleanupErrors = [], attempt = async action => { try { await action(); } catch (error) { cleanupErrors.push(String(error)); } };
        await attempt(async () => { realmSampler?.close(); });
        await attempt(async () => {
          if (observer) { const current = await queryReliableProcessIdentity(observer.pid); if (current) assert.deepEqual(current, observerBirth);
            await observer.stop(); row.nativeMemory = observer.report(); row.nativeOwnership = nativeMonitor.ownershipSummary(); }
        });
        await attempt(async () => { await browser?.close(); });
        await attempt(async () => { await stopKnown(chrome, birth); });
        row.processCleanup = [];
        const identities = [birth, ...(row.nativeMemory?.identities ?? [])].filter(Boolean);
        const unique = [...new Map(identities.map(identity => [`${identity.pid}:${identity.createdAt}`, identity])).values()];
        for (const identity of unique) await attempt(async () => { const absence = await observeOwnedProcessExit(identity); row.processCleanup.push(absence); assert.equal(absence.status, "owned-identity-absent"); });
        if (observerBirth) await attempt(async () => { row.observerCleanup = await observeOwnedProcessExit(observerBirth); assert.equal(row.observerCleanup.status, "owned-identity-absent"); });
        row.safeToRemoveRuntime = cleanupErrors.length === 0 && (!chrome || chrome.exitCode !== null || chrome.signalCode !== null);
        if (row.safeToRemoveRuntime) await attempt(async () => { await caseRuntime.close(); await assert.rejects(access(caseRuntime.directory), { code: "ENOENT" }); row.runtimeRemoved = true; });
        row.cleanupErrors = cleanupErrors;
        if (cleanupErrors.length) throw new Error("Page-load owned cleanup unavailable: " + cleanupErrors.join(" | "));
      }
      console.log(JSON.stringify({ case: index + 1, variant, incrementalLoadPrivateMiB: row.incrementalLoadPrivateMiB, readyMs: row.readyMs, runtimeRemoved: row.runtimeRemoved }));
    }
    proof.summary = summarizeShellLoadPairs(proof.cases);
    proof.browserPinAfter = await inspectInstalledChromePin(); assertInstalledChromePinsEqual(proof.browserPinBefore, proof.browserPinAfter);
    proof.status = "completed-matched-page-load-diagnostic-not-conversion-acceptance";
  } catch (error) { proof.status = "failed-matched-page-load-diagnostic"; proof.failures.push(String(error.stack ?? error)); throw error; }
  finally {
    const errors = [], attempt = async action => { try { await action(); } catch (error) { errors.push(String(error)); } };
    await attempt(async () => { await preview?.close(); });
    await attempt(async () => { await stopKnown(production, productionBirth); });
    if (productionBirth) await attempt(async () => { proof.productionCleanup = await observeOwnedProcessExit(productionBirth); assert.equal(proof.productionCleanup.status, "owned-identity-absent"); });
    if (proof.protectedOriginalBefore) await attempt(async () => { proof.protectedOriginalAfter = await originalIdentity(); assert.deepEqual(proof.protectedOriginalAfter, proof.protectedOriginalBefore); });
    proof.productionLog = productionLog; proof.cleanupErrors = errors;
    proof.safeToRemoveRuntime = errors.length === 0 && proof.cases.every(row => row.runtimeRemoved === true) && proof.staticServerClosed === true &&
      (!production || production.exitCode !== null || production.signalCode !== null);
    if (errors.length) throw new Error("Matched diagnostic outer cleanup: " + errors.join(" | "));
  }
}
