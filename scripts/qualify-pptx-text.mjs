// Scoped change control, not a replacement for the cross-profile release gate.
import "./lib/hidden-unit-subprocesses.mjs";
import assert from "node:assert/strict";
import { execFile, spawn } from "node:child_process";
import { createHash } from "node:crypto";
import { once } from "node:events";
import { constants, createReadStream } from "node:fs";
import { copyFile, mkdir, readFile, readdir, stat, statfs, writeFile } from "node:fs/promises";
import { createServer } from "node:net";
import path from "node:path";
import { setTimeout as pause } from "node:timers/promises";
import { promisify } from "node:util";
import { gzipSync } from "node:zlib";
import { chromium } from "playwright";
import { generatePresentationStressFixture } from "./generate-presentation-stress-fixtures.mjs";
import { startClassifiedChromiumMemoryMonitor } from "./lib/birth-type-capture.mjs";
import { boundedErrorDetails } from "./lib/bounded-error-details.mjs";
import { cancelBrowserConversionBeforeCleanup } from "./lib/cancel-browser-conversion-before-cleanup.mjs";
import { connectRealmSampler } from "./lib/cdp-realm-memory.mjs";
import { stableWindow } from "./lib/chromium-private-memory.mjs";
import { completeNewBrowserJob } from "./lib/docx-direct-control.mjs";
import { summarizeDocxHtmlRunMemory } from "./lib/docx-html-scaling-control.mjs";
import { encodeBoundedValidationChunk } from "./lib/bounded-validation-chunk.mjs";
import { inspectStressHostMemory } from "./lib/host-memory-preflight.mjs";
import { inspectInstalledChromePin } from "./lib/installed-chrome-pin.mjs";
import { isCompatibilityStaticPath } from "./lib/installed-compatibility-plan.mjs";
import { bindLargeDocumentOutputValidationBacking, assertOpfsOutputValidationBackingUnchanged } from "./lib/opfs-output-validation-backing.mjs";
import { cleanupOwnedChromium } from "./lib/owned-chromium-cleanup.mjs";
import { startOwnedProductionTestServer } from "./lib/owned-production-test-server.mjs";
import { createOwnedRuntimeScratch, finishOwnedCleanup } from "./lib/owned-runtime-scratch.mjs";
import { classifyPrivateRequest } from "./lib/private-browser-request.mjs";
import { queryReliableProcessIdentity } from "./lib/reliable-owned-identity.mjs";
import { selectOwnedLocalBrowserFile } from "./lib/select-owned-local-browser-file.mjs";
import { createPptxRendererDiagnostic } from "./lib/pptx-renderer-attribution.mjs";

assert.equal(process.platform, "win32");
const noScreencastDiagnostic = process.argv[2] === "--diagnose-no-screencast";
const verifyHandleMetrics = process.argv[2] === "--verify-published-handle-metrics";
const handleDiagnostic = process.argv[2] === "--diagnose-published-handle" || verifyHandleMetrics;
const publishedDiagnostic = process.argv[2] === "--diagnose-published-renderer" || handleDiagnostic;
assert.equal(process.argv.length, noScreencastDiagnostic || publishedDiagnostic ? 3 : 2);
const root = path.resolve(import.meta.dirname, "..");
const stamp = new Date().toISOString().replaceAll(/[:.]/g, "-");
const base = `evidence/${stamp}-${verifyHandleMetrics ? "pptx-handle-metrics" : handleDiagnostic ? "pptx-published-handle" : publishedDiagnostic ? "pptx-published-renderer" : "pptx-text-normal-services"}`;
const execute = promisify(execFile);
const sha = bytes => createHash("sha256").update(bytes).digest("hex");
const hashFile = async file => {
  const digest = createHash("sha256");
  for await (const chunk of createReadStream(file, { highWaterMark: 262144 })) digest.update(chunk);
  return digest.digest("hex");
};
if (!publishedDiagnostic) assert.equal(
  await hashFile(path.join(root, "workers/pptx-conversion.ts")),
  await hashFile(path.join(root, "workers/pptx-namespace-candidate.ts")),
  "Use a disposable review checkout with the exact candidate at workers/pptx-conversion.ts and build it first; the public route is deliberately unchanged.",
);
const original = async () => ({ bytes: (await stat(path.join(root, "test.mkv"))).size,
  sha256: await hashFile(path.join(root, "test.mkv")) });
const historical = JSON.parse(await readFile(path.join(root, "fixtures/stress/presentations/presentation-128m.pptx.json")));
const limits = { primaryMiB: 250, cleanupMiB: 96, sampleCap: 6000, realmCap: 300, requestCap: 512 };
const report = {
  schemaVersion: 1, startedAt: new Date().toISOString(), status: "running", cases: [], failures: [],
  profileId: "pptx-to-txt", scope: "Public PPTX namespace/visibility change control with native fixture, three exact historical-size repeats, and adverse recovery",
  headed: false, browserServicesDisabled: false, nativePickerVerified: false, nativeConversionUsed: false,
  normalInstalledUserProfileUsed: false,
  diskMode: handleDiagnostic ? "shared-direct-handle-opfs-adapter" : "async-opfs-file-stream", limits, sourcePins: {},
  diagnosticOnly: noScreencastDiagnostic || publishedDiagnostic,
  traceScreenshots: !noScreencastDiagnostic && !publishedDiagnostic,
  memoryFormula: "(peak complete spawned Chrome process-tree private bytes - earliest stable same clean blank Chrome private bytes) / 1048576",
  requestCount: 0, forbiddenRequests: [], realmObservations: [],
};
let runtime, server, child, identity, browser, context, page, monitor, realms, pending, realmPending, timer, start, end, tracing, attribution;
let rejectStop;
const stop = new Promise((_, reject) => { rejectStop = reject; });
void stop.catch(() => {});
const samples = [];
const guard = promise => Promise.race([stop, promise]);
function fail(error) {
  report.status = "failed-not-acceptance";
  report.failures.push(...boundedErrorDetails(error));
  process.exitCode = 1;
}
const drain = () => pending ??= (async () => {
  const batch = await monitor.drain();
  assert.equal(batch.overflow, false);
  assert.ok(samples.length + batch.samples.length <= limits.sampleCap);
  samples.push(...batch.samples);
  if (start !== undefined) for (const row of batch.samples) {
    const time = Date.parse(row.timestamp);
    if (time >= start && (end === undefined || time <= end) && row.privateBytes !== null) {
      assert.ok((row.privateBytes - report.blankBaseline.privateBytes) / 1048576 <= limits.primaryMiB,
        "Unchanged 250 MiB full-process-tree safety stop");
    }
  }
})().finally(() => { pending = undefined; });
const sampleRealms = () => realmPending ??= (async () => {
  assert.ok(report.realmObservations.length < limits.realmCap);
  report.realmObservations.push({ timestamp: new Date().toISOString(), ...await realms.sample() });
})().finally(() => { realmPending = undefined; });
async function stable() {
  const rows = [], deadline = Date.now() + 30000;
  while (Date.now() < deadline) {
    await drain();
    const row = samples.at(-1);
    if (row && row.sequence !== rows.at(-1)?.sequence) rows.push({ ...row, elapsedMs: Date.parse(row.timestamp) });
    const result = stableWindow(rows);
    if (result) return result;
    await pause(1000);
  }
  throw new Error("Unchanged 30s/8s/5-sample/2% stability window unavailable");
}

try {
  report.hostMemory = await inspectStressHostMemory();
  assert.equal(report.hostMemory.safeToStart, true);
  const disk = await statfs(root);
  report.diskFreeBytes = disk.bavail * disk.bsize;
  assert.ok(report.diskFreeBytes >= 2 * 1024 ** 3);
  report.protectedOriginalBefore = await original();
  assert.deepEqual(report.protectedOriginalBefore, { bytes: 2958573265, sha256: "31f36695b5b44c62125a9e4264e84dc085accd21c02cc3487aae597f54b9db34" });
  report.browserBefore = await inspectInstalledChromePin();
  report.executedHead = (await execute(process.env.WITHIN_GIT_EXECUTABLE ?? "git", ["rev-parse", "HEAD"],
    { cwd: root, windowsHide: true, timeout: 10000 })).stdout.trim();
  for (const file of ["workers/pptx-conversion.ts", "workers/pptx-namespace-candidate.ts", "workers/conversion.worker.ts", "lib/capability-registry.ts",
    "scripts/qualify-pptx-text.mjs", "scripts/lib/pptx-native-control.py", "scripts/generate-presentation-stress-fixtures.mjs"]) {
    report.sourcePins[file] = await hashFile(path.join(root, file));
  }
  if (publishedDiagnostic) {
    report.scope = "One exact historical-size conversion through the unchanged published worker; allocator and source removal intervention, not acceptance";
    report.sourcePins["scripts/lib/pptx-renderer-attribution.mjs"] = await hashFile(path.join(root, "scripts/lib/pptx-renderer-attribution.mjs"));
    assert.notEqual(report.sourcePins["workers/pptx-conversion.ts"], report.sourcePins["workers/pptx-namespace-candidate.ts"]);
    const workers = (await readdir(path.join(root, "dist/client/assets")))
      .filter(name => /^conversion\.worker-[A-Za-z0-9_-]+\.js$/.test(name));
    assert.equal(workers.length, 1);
    report.builtConversionWorker = { name: workers[0],
      sha256: await hashFile(path.join(root, "dist/client/assets", workers[0])) };
  }
  const assets = new Set(), assetRoot = path.join(root, "dist/client");
  for (const entry of await readdir(assetRoot, { withFileTypes: true, recursive: true })) {
    assert.equal(entry.isSymbolicLink(), false);
    if (!entry.isFile()) continue;
    assert.ok(assets.size < 8192);
    assets.add("/" + path.relative(assetRoot, path.join(entry.parentPath, entry.name)).split(path.sep).map(encodeURIComponent).join("/"));
  }
  const config = path.join(root, "dist/server/wrangler.json");
  const build = JSON.parse(await readFile(config, "utf8"));
  assert.equal(build.assets.directory, "../client"); assert.equal(build.assets.run_worker_first, true);
  report.build = { configSha256: await hashFile(config), workerSha256: await hashFile(path.join(path.dirname(config), build.main)), assets: assets.size };
  runtime = await createOwnedRuntimeScratch("pptx-text-");
  const env = { ...runtime.env, PYTHONDONTWRITEBYTECODE: "1", WRANGLER_SEND_METRICS: "false" };
  const native = async (...args) => JSON.parse((await execute("python",
    ["-B", "scripts/lib/pptx-native-control.py", ...args],
    { cwd: root, env, windowsHide: true, timeout: 30000, maxBuffer: 16384 })).stdout);
  const nativeFixture = path.join(runtime.directory, "native.pptx");
  if (!publishedDiagnostic) report.nativeFixture = await native("generate", nativeFixture);
  const fixtureBasename = handleDiagnostic ? "within-test-presentation-128m.pptx" : "presentation-128m.pptx";
  const largeFixture = path.join(runtime.directory, fixtureBasename);
  report.largeFixture = await generatePresentationStressFixture(runtime.directory, fixtureBasename);
  assert.deepEqual(report.largeFixture, historical, "Use the exact historical stress input and golden output");
  assert.equal(await hashFile(largeFixture), historical.sha256);
  const sample = path.join(runtime.directory, "sample.pptx");
  const dtd = path.join(runtime.directory, "unsafe-doctype.pptx");
  const escape = path.join(runtime.directory, "unsafe-reference.pptx");
  for (const file of publishedDiagnostic ? [] : [sample, dtd, escape]) {
    await copyFile(path.join(root, "fixtures/presentations", path.basename(file)), file, constants.COPYFILE_EXCL);
  }
  const port = await new Promise((resolve, reject) => {
    const probe = createServer(); probe.once("error", reject);
    probe.listen(0, "127.0.0.1", () => { const port = probe.address().port; probe.close(error => error ? reject(error) : resolve(port)); });
  });
  server = await startOwnedProductionTestServer({ root, directory: runtime.directory, env, port });
  const profile = path.join(runtime.directory, "profile");
  report.launchArguments = ["--headless=new", "--remote-debugging-port=0", `--user-data-dir=${profile}`,
    "--no-first-run", "--no-default-browser-check", "about:blank"];
  child = spawn(report.browserBefore.launcher.path, report.launchArguments, { cwd: root, env, windowsHide: true, stdio: "ignore" });
  await once(child, "spawn");
  identity = await queryReliableProcessIdentity(child.pid); assert.ok(identity);
  report.browserIdentity = identity;
  monitor = await startClassifiedChromiumMemoryMonitor(child.pid, runtime.directory, 100);
  let portString;
  for (let attempt = 0; attempt < 100; attempt++) {
    assert.equal(child.exitCode, null);
    try {
      portString = (await readFile(path.join(profile, "DevToolsActivePort"), "utf8")).split(/\r?\n/)[0];
      if (/^\d+$/.test(portString)) break;
    } catch (error) { if (error.code !== "ENOENT") throw error; }
    await pause(200);
  }
  assert.match(portString ?? "", /^\d+$/);
  const debug = `http://127.0.0.1:${portString}`;
  browser = await chromium.connectOverCDP(debug, { timeout: 20000 });
  assert.equal(browser.contexts().length, 1);
  context = browser.contexts()[0];
  page = context.pages().find(page => page.url() === "about:blank"); assert.ok(page);
  report.blankBaseline = await stable();
  const version = await (await fetch(debug + "/json/version", { signal: AbortSignal.timeout(3000) })).json();
  report.protocolBrowser = version.Browser;
  realms = await connectRealmSampler(version.webSocketDebuggerUrl, server.baseURL);
  await context.addInitScript(`window.__WITHIN_AUDIO_VALIDATION_CHUNK__=(${encodeBoundedValidationChunk});window.__WITHIN_PPTX_COMPLETE__=(${completeNewBrowserJob});`);
  if (handleDiagnostic) await context.addInitScript(() => {
    const original = Worker.prototype.postMessage;
    Worker.prototype.postMessage = function (...args) {
      const message = args[0];
      if (message?.type === "start" && message.profileId === "pptx-to-txt") {
        if (window.__WITHIN_PPTX_DESTINATION__) throw new Error("Only one diagnostic job expected");
        window.__WITHIN_PPTX_DESTINATION__ = {
          mode: message.destination?.mode ?? null,
          actualHandle: message.destination?.handle instanceof FileSystemFileHandle,
          sourceBytes: message.file?.size ?? null,
        };
      }
      return Reflect.apply(original, this, args);
    };
  });
  await context.route("**/*", async route => {
    const request = route.request(), method = request.method(); report.requestCount++;
    let frameUrl = null; try { frameUrl = request.frame()?.url() ?? null; } catch { /* worker-owned */ }
    const category = classifyPrivateRequest({ method, url: request.url(), frameUrl, serviceWorkerUrl: request.serviceWorker()?.url() ?? null,
      postData: ["GET", "HEAD"].includes(method) ? request.postData() : "forbidden-body-not-read" }, server.baseURL);
    if (report.requestCount > limits.requestCap ||
        !(category === "browser-local" || category === "app-static" && isCompatibilityStaticPath(request.url(), server.baseURL, assets))) {
      if (report.forbiddenRequests.length < 16) report.forbiddenRequests.push({ method, category, urlSha256: sha(request.url()) });
      rejectStop(new Error("Request outside exact built-asset/privacy policy"));
      await route.abort();
    } else await route.continue();
  });
  await context.tracing.start({ screenshots: report.traceScreenshots, snapshots: false, sources: false }); tracing = true;
  const ready = () => page.waitForFunction(() => window.__WITHIN_TEST__?.getState().workerStatus === "ready", undefined, { timeout: 20000 });
  const open = async (query = "?test=1") => {
    await guard(page.goto(server.baseURL + "/" + query, { timeout: 20000 }));
    await guard(ready());
    assert.ok(await page.evaluate(() => crossOriginIsolated && typeof navigator.storage.getDirectory === "function"));
  };
  await open(handleDiagnostic ? "?test=1&directory=1" : "?test=1");
  report.loadedIdle = await guard(stable()); start = Date.now();
  if (publishedDiagnostic) {
    const nextNative = async () => {
      const afterSequence = samples.at(-1)?.sequence ?? -1;
      for (let attempt = 0; attempt < 25; attempt++) {
        await drain();
        const last = samples.at(-1);
        if (last?.sequence > afterSequence && last.privateBytes !== null) return last;
        await pause(100);
      }
      return null;
    };
    attribution = await createPptxRendererDiagnostic({ page, context, browser, realms, nextNative, directory: runtime.directory });
    await guard(attribution.sample("loaded"));
  }
  timer = setInterval(() => {
    void drain().catch(rejectStop);
    if (!attribution && Math.floor(Date.now() / 500) % 4 === 0) void sampleRealms().catch(rejectStop);
  }, 500);
  const opfsNames = () => page.evaluate(async () => {
    const names = [];
    for await (const name of (await navigator.storage.getDirectory()).keys()) {
      if (names.length >= 16) throw new Error("Finite OPFS inventory required");
      names.push(name);
    }
    return names;
  });
  const choose = async (kind, file) => {
    const row = { kind, startedAt: Date.now() }; report.cases.push(row);
    row.input = await guard(selectOwnedLocalBrowserFile(page, file, runtime.directory));
    row.sourceBytes = row.input.selectedFileBytes;
    await guard(page.locator('[data-testid="format-select"]').selectOption("pptx-to-txt", { timeout: 15000 }));
    return row;
  };
  const cleanup = async row => {
    await guard(ready());
    assert.deepEqual(await opfsNames(), []);
    row.cleanup = await guard(stable()); row.endedAt = Date.now();
    row.cleanupGatePassed = (row.cleanup.privateBytes - report.loadedIdle.privateBytes) / 1048576 <= limits.cleanupMiB;
    if (!publishedDiagnostic) assert.ok(row.cleanupGatePassed, "Unchanged 96 MiB cleanup gate");
  };
  const convert = async (kind, file, validate, hidden = false) => {
    const row = await choose(kind, file);
    if (attribution) await guard(attribution.sample("selected"));
    const job = guard(page.evaluate(() => window.__WITHIN_PPTX_COMPLETE__({
      getState: () => window.__WITHIN_TEST__.getState(),
      start: () => document.querySelector('[data-testid="convert-button"]').click(),
      nextFrame: () => new Promise(resolve => requestAnimationFrame(resolve)), now: () => performance.now(),
    })));
    const [state] = await Promise.all([job, attribution ? (async () => {
      await guard(page.waitForFunction(() => {
        const state = window.__WITHIN_TEST__?.getState();
        return state?.jobState === "running" && state.metrics?.outputBytes >= 8 * 1024 * 1024;
      }, undefined, { timeout: 20000 }));
      await guard(attribution.sample("active"));
    })() : undefined]);
    row.metrics = state.metrics;
    assert.equal(state.error, null); assert.equal(state.selectedProfileId, "pptx-to-txt");
    assert.equal(state.metrics.inputBytes, row.sourceBytes);
    assert.equal(state.metrics.pendingOperations, 0); assert.equal(state.metrics.queuedBytes, 0);
    for (const key of ["maxReadChunkBytes", "maxWriteChunkBytes", "peakQueuedBytes"]) {
      assert.ok(state.metrics[key] > 0 && state.metrics[key] <= 262144, key);
    }
    assert.equal(state.metrics.peakPendingOperations, 1);
    if (hidden) assert.match(state.warnings.join(" "), /1 hidden PPTX slide is included/);
    row.warnings = state.warnings;
    const name = handleDiagnostic ? state.batchOutputNames[0] : state.opfsName;
    if (handleDiagnostic) {
      assert.equal(state.opfsName, null);
      assert.equal(state.batchOutputNames.length, 1);
      row.destination = await page.evaluate(() => window.__WITHIN_PPTX_DESTINATION__);
      assert.deepEqual(row.destination, { mode: "handle", actualHandle: true, sourceBytes: row.sourceBytes });
      const activeWorkers = attribution.report().rows.find(phase => phase.phase === "active").realms.targets
        .filter(target => target.type === "worker");
      assert.ok(activeWorkers.some(target => /\/direct-file-writer\.worker-[^/]+\.js$/.test(new URL(target.url).pathname)),
        "Actual shared-bridge writer required");
      row.destination.observedWorkerRealms = activeWorkers.map(target => new URL(target.url).pathname);
      row.destination.reportedActiveWorkerCount = state.metrics.activeWorkerCount;
      row.destination.reportedSharedArrayBufferBytes = state.metrics.sharedArrayBufferBytes;
      if (verifyHandleMetrics) {
        assert.equal(state.metrics.activeWorkerCount, activeWorkers.length);
        assert.equal(state.metrics.activeWorkerCount, 2);
        // The bridge owns one 256 KiB payload, 4 KiB error area, and 8 Int32s.
        assert.equal(state.metrics.sharedArrayBufferBytes, 266272);
        row.destination.reportingVerified = true;
      }
    }
    assert.match(name, /^within-test-/);
    try {
      if (attribution) await guard(attribution.sample("complete"));
      const binding = await bindLargeDocumentOutputValidationBacking(page, profile, name, state.metrics.outputBytes);
      row.binding = binding.proof;
      row.validation = await guard(validate(binding.file));
      await assertOpfsOutputValidationBackingUnchanged(binding);
    } finally {
      await page.evaluate(async name => (await navigator.storage.getDirectory()).removeEntry(name), name);
    }
    await cleanup(row);
    if (attribution) {
      await guard(attribution.sample("cleanup-first"));
      await guard(page.getByRole("button", { name: "Remove", exact: true }).click({ timeout: 15000 }));
      await guard(page.waitForFunction(() => document.querySelector('[data-testid="file-input"]').files.length === 0,
        undefined, { timeout: 15000 }));
      row.afterRemove = await guard(stable());
      await guard(attribution.sample("removed"));
    }
  };
  const validateNative = file => native("validate", nativeFixture, file);
  const expected = historical.expectedByProfile["pptx-to-txt"];
  const validateLarge = async file => {
    const bytes = (await stat(file)).size, sha256 = await hashFile(file);
    assert.equal(bytes, expected.validationBytes); assert.equal(sha256, expected.validationSha256);
    return { bytes, sha256, exactGoldenMatch: true };
  };
  if (publishedDiagnostic) {
    await convert("published-large", largeFixture, validateLarge);
    const rows = attribution.report().rows;
    assert.ok(rows.every(row => row.renderer?.available), "Birth-matched page renderer not proven for every phase");
    assert.equal(new Set(rows.map(row => row.renderer.birth + ":" + row.renderer.pid)).size, 1, "Renderer changed between phases");
    assert.equal(rows.find(row => row.phase === "active").stateAtMark.job, "running", "Active dump was not captured while converting");
    report.status = handleDiagnostic
      ? "completed-published-handle-diagnostic-not-acceptance"
      : "completed-published-renderer-diagnostic-not-acceptance";
  } else {
    await convert("native", nativeFixture, validateNative, true);
    for (let repeat = 1; repeat <= 3; repeat++) await convert(`large-${repeat}`, largeFixture, validateLarge);
    const adverse = async (kind, file, expectedError) => {
      const row = await choose(kind, file);
      await guard(page.locator('[data-testid="convert-button"]').click({ timeout: 15000 }));
      await guard(page.waitForFunction(() => window.__WITHIN_TEST__?.getState().jobState === "error", undefined, { timeout: 20000 }));
      const state = await page.evaluate(() => window.__WITHIN_TEST__.getState());
      assert.match(state.error, expectedError); assert.equal(state.opfsName, null);
      row.error = state.error; row.metrics = state.metrics;
      await cleanup(row);
    };
    await adverse("dtd-rejected", dtd, /DTD/);
    await adverse("unsafe-reference-rejected", escape, /escapes its root/);
    await open("?test=1&fault=write");
    await adverse("write-error", sample, /destination rejected a bounded write/i);
    await open();
    await convert("legacy-fixture-recovery", sample, async file => {
      const expected = "Quarterly Plan\nRevenue\t₹42\nprivate 😀\nCell A\nCell B\n\nHidden appendix\n";
      assert.equal((await stat(file)).size, Buffer.byteLength(expected));
      assert.equal(await hashFile(file), sha(expected));
      return { bytes: Buffer.byteLength(expected), sha256: sha(expected), exactGoldenMatch: true };
    }, true);
    report.status = noScreencastDiagnostic ? "passed-no-screencast-diagnostic-not-acceptance" : "passed-pptx-text-change-control";
  }
  end = Date.now();
  assert.equal(await hashFile(largeFixture), historical.sha256);
  assert.deepEqual(report.forbiddenRequests, []);
} catch (error) { fail(error); }
finally {
  end ??= Date.now(); clearInterval(timer);
  await pending?.catch(fail); await realmPending?.catch(fail);
  if (attribution) { report.rendererDiagnostic = attribution.report(); await attribution.close().catch(fail); }
  if (realms) { report.realmObserver = realms.ownershipSummary(); realms.close(); }
  if (monitor) {
    await drain().catch(fail); await monitor.close().catch(fail);
    report.nativeObserver = monitor.ownershipSummary();
  }
  if (start !== undefined) {
    try {
      const completed = report.cases.filter(row => row.cleanup);
      for (const row of completed) row.memory = summarizeDocxHtmlRunMemory(samples, row.startedAt, row.endedAt,
        report.blankBaseline, report.loadedIdle, row.cleanup);
      const valid = samples.filter(row => row.privateBytes !== null && Date.parse(row.timestamp) >= start && Date.parse(row.timestamp) <= end);
      assert.ok(valid.length > 0);
      const peak = valid.reduce((a, b) => a.privateBytes >= b.privateBytes ? a : b);
      report.memory = { peak, validSamples: valid.length,
        unavailableSamples: samples.filter(row => row.privateBytes === null && Date.parse(row.timestamp) >= start && Date.parse(row.timestamp) <= end).length,
        incrementalPrivateMiB: (peak.privateBytes - report.blankBaseline.privateBytes) / 1048576 };
      assert.ok(report.memory.incrementalPrivateMiB <= limits.primaryMiB, "Unchanged whole-tree acceptance gate");
    } catch (error) { fail(error); }
  }
  try {
    if (page && !page.isClosed()) {
      report.jobCleanup = await cancelBrowserConversionBeforeCleanup(page);
      await page.evaluate(async () => {
        const directory = await navigator.storage.getDirectory();
        for await (const name of directory.keys()) if (/^within-(?:test|stage)-/.test(name)) await directory.removeEntry(name, { recursive: true });
      });
    }
    if (tracing) {
      const trace = report.status === "failed-not-acceptance" ? `output/playwright/${stamp}-pptx-text-failure.zip` : undefined;
      if (trace) await mkdir(path.join(root, "output/playwright"), { recursive: true });
      await context.tracing.stop(trace ? { path: path.join(root, trace) } : {});
      if (trace) report.failureTrace = trace;
    }
  } catch (error) { fail(error); }
  await finishOwnedCleanup([
    async () => {
      if (!identity) { assert.ok(!child?.pid, "Never terminate without an owned launch birth"); return; }
      report.browserCleanup = await cleanupOwnedChromium({ identity,
        observedPids: [...new Set(samples.flatMap(row => (row.processes ?? []).map(process => process.pid)))],
        disconnect: async () => { await browser?.close(); } });
      assert.equal(report.browserCleanup.status, "owned-observed-pids-absent");
    },
    async () => { if (server) report.serverCleanup = await server.close(); },
  ]).catch(fail);
  try {
    if (runtime) {
      assert.ok(!child?.pid || report.browserCleanup?.status === "owned-observed-pids-absent");
      assert.ok(!server || report.serverCleanup?.ownedRootAbsent);
      await runtime.close(); report.ownedRuntimeRemoved = true;
    }
    for (const [file, digest] of Object.entries(report.sourcePins)) assert.equal(await hashFile(path.join(root, file)), digest);
    if (report.browserBefore) assert.deepEqual(await inspectInstalledChromePin(), report.browserBefore);
    if (report.protectedOriginalBefore) {
      report.protectedOriginalAfter = await original();
      assert.deepEqual(report.protectedOriginalAfter, report.protectedOriginalBefore);
    }
  } catch (error) { fail(error); }
  const raw = Buffer.from(JSON.stringify(samples)), packed = gzipSync(raw);
  await writeFile(path.join(root, base + ".samples.json.gz"), packed, { flag: "wx" });
  report.nativeArchive = { path: base + ".samples.json.gz", bytes: packed.length, sha256: sha(packed), decodedSha256: sha(raw) };
  report.finishedAt = new Date().toISOString();
  await writeFile(path.join(root, base + ".json"), JSON.stringify(report, null, 2) + "\n", { flag: "wx" });
  console.log(JSON.stringify({ file: base + ".json", status: report.status, cases: report.cases.map(row => row.kind),
    memoryMiB: report.memory?.incrementalPrivateMiB, failures: report.failures }));
}
