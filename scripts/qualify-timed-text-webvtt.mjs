// Production-browser MP4 timed-text control. Not route promotion or a scaling test.
import "./lib/hidden-unit-subprocesses.mjs";
import assert from "node:assert/strict";
import { execFile, spawn } from "node:child_process";
import { createHash } from "node:crypto";
import { once } from "node:events";
import { lstat, mkdir, readFile, realpath, statfs, writeFile } from "node:fs/promises";
import { createServer } from "node:net";
import path from "node:path";
import { setTimeout as pause } from "node:timers/promises";
import { promisify } from "node:util";
import { gzipSync } from "node:zlib";
import { startClassifiedChromiumMemoryMonitor } from "./lib/birth-type-capture.mjs";
import { encodeBoundedValidationChunk } from "./lib/bounded-validation-chunk.mjs";
import { cancelAfterRealBrowserPayload } from "./lib/browser-payload-cancellation.mjs";
import { cancelBrowserConversionBeforeCleanup } from "./lib/cancel-browser-conversion-before-cleanup.mjs";
import { connectRealmSampler } from "./lib/cdp-realm-memory.mjs";
import { stableWindow } from "./lib/chromium-private-memory.mjs";
import { inspectStressHostMemory } from "./lib/host-memory-preflight.mjs";
import { assertInstalledChromePinsEqual, inspectInstalledChromePin } from "./lib/installed-chrome-pin.mjs";
import { assertOpfsOutputValidationBackingUnchanged, bindOpfsOutputValidationBacking } from "./lib/opfs-output-validation-backing.mjs";
import { cleanupOwnedChromium, queryObservedPidCensus } from "./lib/owned-chromium-cleanup.mjs";
import { startOwnedProductionTestServer } from "./lib/owned-production-test-server.mjs";
import { createOwnedRuntimeScratch } from "./lib/owned-runtime-scratch.mjs";
import { reconcileChromiumBirths } from "./lib/reconcile-chromium-births.mjs";
import { queryReliableProcessIdentity } from "./lib/reliable-owned-identity.mjs";
import { selectOwnedLocalBrowserFile } from "./lib/select-owned-local-browser-file.mjs";
import { assertTimedTextLaunch, assertTimedTextTerminal, classifyTimedTextBrowserRequest, collectTimedTextStaticPaths, CLEANUP_MIB_LIMIT,
  observeTimedTextLaunches, PRIVATE_MIB_LIMIT, summarizeTimedTextMemory, validateTimedTextPhysicalOutput } from "./lib/timed-text-browser-control.mjs";
import { createTimedTextCancellationFixture, TIMED_TEXT_CANCEL_OUTPUT_NAME as outputName } from "./lib/timed-text-browser-fixture.mjs";

const repo = path.resolve(import.meta.dirname, ".."), exec = promisify(execFile), mib = 1048576;
const sha = bytes => createHash("sha256").update(bytes).digest("hex");
const systemDrive = process.env.SystemDrive;
const minimumDiskBytes = 512 * mib;
const preflightOnly = process.argv[2] === "--preflight";
assert.equal(process.argv.length, preflightOnly ? 3 : 2);
assert.equal(process.platform, "win32", "Windows Chrome whole-tree observer required");
assert.match(systemDrive ?? "", /^[A-Z]:$/i, "Windows system drive unavailable");
const disk = await statfs(systemDrive + path.sep);
assert.ok(disk.bavail * disk.bsize >= minimumDiskBytes,
  `System drive has ${disk.bavail * disk.bsize} free bytes; need ${minimumDiskBytes} before any build, fixture or browser launch`);
const repositoryDisk = await statfs(repo);
assert.ok(repositoryDisk.bavail * repositoryDisk.bsize >= minimumDiskBytes, "Not enough space on repository drive");
const hostMemory = await inspectStressHostMemory();
assert.equal(hostMemory.safeToStart, true, "Host requires at least 2 GiB each of free physical and virtual memory");
if (preflightOnly) {
  console.log(JSON.stringify({ status: "headroom-pass-browser-not-launched", hostMemory, minimumDiskBytes,
    systemFreeBytes: disk.bavail * disk.bsize, repositoryFreeBytes: repositoryDisk.bavail * repositoryDisk.bsize }));
  process.exit(0);
}

const stamp = new Date().toISOString().replaceAll(/[:.]/g, "-"), samples = [];
const report = { status: "not-completed", stamp, scope: "private-headless-mp4-timed-text-direct-handle-control", hostMemory,
  sourcePins: {}, cases: [], forbiddenRequests: [], requestCount: 0, realmSamples: [], failures: [],
  systemFreeBytes: disk.bavail * disk.bsize, repositoryFreeBytes: repositoryDisk.bavail * repositoryDisk.bsize,
  privateMiBLimit: PRIVATE_MIB_LIMIT, cleanupMiBLimit: CLEANUP_MIB_LIMIT,
  memoryFormula: "(peak complete Chrome process-tree private bytes - same stable clean blank Chrome private bytes) / 1048576",
  headless: true, headedVerified: false, nativePickerVerified: false, externalDestinationVerified: false,
  browserServicesDisabled: false, protectedOriginalRead: false, publicPromotion: false, scalingVerified: false,
  destinationScope: "Real FileSystemFileHandle in an owned OPFS test directory, no native picker" };
let runtime, server, chrome, birth, browser, page, monitor, drainTimer, pendingDrain, realm, pendingRealm;
let controlStart, controlEnd, failed = false, rejectSafety;
const safety = new Promise((_, reject) => { rejectSafety = reject; });
void safety.catch(() => {});
const guard = job => Promise.race([safety, job]);
const recordFailure = error => { failed = true; report.failures.push(String(error?.stack ?? error).slice(0, 3000)); };
const drain = () => pendingDrain ??= (async () => {
  const batch = await monitor.drain();
  assert.equal(batch.overflow, false);
  assert.ok(samples.length + batch.samples.length <= 3600, "Finite sample cap");
  samples.push(...batch.samples);
  if (controlStart !== undefined) {
    for (const row of batch.samples) {
      const at = Date.parse(row.timestamp);
      if (at >= controlStart && (controlEnd === undefined || at <= controlEnd) && row.privateBytes !== null) {
        assert.ok(row.privateBytes - report.blank.privateBytes <= PRIVATE_MIB_LIMIT * mib, "Unchanged 250 MiB whole-tree safety stop");
      }
    }
  }
})().finally(() => { pendingDrain = null; });
const stable = async () => {
  const rows = [], deadline = Date.now() + 30000;
  while (Date.now() < deadline) {
    await guard(drain());
    const row = samples.at(-1);
    if (row && row.sequence !== rows.at(-1)?.sequence) rows.push({ ...row, elapsedMs: Date.parse(row.timestamp) });
    const result = stableWindow(rows);
    if (result) return result;
    await guard(pause(1000));
  }
  throw new Error("Stable five-sample / 8s / 2% memory window unavailable");
};
const observeRealms = () => {
  if (!realm || pendingRealm) return;
  pendingRealm = (async () => {
    assert.ok(report.realmSamples.length < 720);
    report.realmSamples.push({ timestamp: new Date().toISOString(), ...await realm.sample() });
  })().catch(rejectSafety).finally(() => { pendingRealm = null; });
};

try {
  runtime = await createOwnedRuntimeScratch("timed-text-chrome-");
  const env = runtime.env;
  for (const file of ["scripts/qualify-timed-text-webvtt.mjs", "scripts/lib/timed-text-browser-control.mjs",
    "scripts/lib/timed-text-browser-fixture.mjs", "scripts/lib/birth-aware-chromium-memory.mjs", "scripts/lib/windows-tree-monitor.cs",
    "scripts/lib/windows-process-birth-proof.cs", "scripts/lib/windows-tree-monitor-birth-aware.ps1",
    "fixtures/media/quicktime-source.mov", "app/converter/ConverterApp.tsx", "workers/conversion.worker.ts",
    "workers/iso-timed-text-webvtt.ts", "lib/timed-text-qualification.ts", "lib/capability-registry.ts", "package-lock.json"]) {
    report.sourcePins[file] = sha(await readFile(path.join(repo, file)));
  }
  report.head = (await exec("git", ["rev-parse", "HEAD"], { cwd: repo, windowsHide: true, timeout: 5000 })).stdout.trim();
  await exec(process.execPath, ["--import", "./scripts/lib/hidden-unit-subprocesses.mjs", "scripts/run-vinext.mjs", "build"],
    { cwd: repo, env, windowsHide: true, timeout: 120000, maxBuffer: 262144 });
  const staticPaths = await collectTimedTextStaticPaths(path.join(repo, "dist/client"));
  report.allowedProductionAssetCount = staticPaths.size;
  const { input, ...fixture } = await createTimedTextCancellationFixture(runtime, path.join(repo, "fixtures/media/quicktime-source.mov"));
  report.fixture = fixture;
  report.browserPin = await inspectInstalledChromePin();
  const port = await new Promise((resolve, reject) => {
    const reserve = createServer();
    reserve.once("error", reject);
    reserve.listen(0, "127.0.0.1", () => { const port = reserve.address().port; reserve.close(error => error ? reject(error) : resolve(port)); });
  });
  server = await startOwnedProductionTestServer({ root: repo, directory: runtime.directory, env, port });
  report.serverIdentity = server.identity;
  const { chromium } = await import("playwright");
  const profile = path.join(runtime.directory, "profile");
  const args = ["--headless=new", "--remote-debugging-port=0", `--user-data-dir=${profile}`, "--no-first-run", "--no-default-browser-check", "about:blank"];
  await writeFile(path.join(runtime.directory, "chrome-launch-intent.json"), JSON.stringify({ args, executable: report.browserPin.launcher.path }), { flag: "wx" });
  chrome = spawn(report.browserPin.launcher.path, args, { cwd: repo, env, windowsHide: true, stdio: "ignore" });
  await once(chrome, "spawn");
  birth = await queryReliableProcessIdentity(chrome.pid);
  assert.ok(birth, "Fresh Chrome identity unavailable");
  report.browserBirth = birth;
  await writeFile(path.join(runtime.directory, "chrome-launch-birth.json"), JSON.stringify(birth), { flag: "wx" });
  monitor = await startClassifiedChromiumMemoryMonitor(chrome.pid, runtime.directory, 100);
  let activePort;
  for (let remaining = 75; remaining > 0; remaining--) {
    try { activePort = (await readFile(path.join(profile, "DevToolsActivePort"), "utf8")).split(/\r?\n/)[0]; }
    catch (error) { if (error.code !== "ENOENT") throw error; }
    if (/^\d+$/.test(activePort ?? "")) break;
    assert.equal(chrome.exitCode, null, "Owned Chrome exited during startup");
    await pause(200);
  }
  assert.match(activePort ?? "", /^\d+$/);
  const debuggerUrl = `http://127.0.0.1:${activePort}`;
  browser = await chromium.connectOverCDP(debuggerUrl, { timeout: 15000 });
  const context = browser.contexts()[0];
  page = context.pages()[0];
  page.setDefaultTimeout(15000);
  await page.goto("about:blank");
  report.blank = await stable();
  const debuggerInfo = await (await fetch(`${debuggerUrl}/json/version`, { signal: AbortSignal.timeout(3000) })).json();
  realm = await connectRealmSampler(debuggerInfo.webSocketDebuggerUrl, server.baseURL);
  await context.addInitScript(`window.__WITHIN_AUDIO_VALIDATION_CHUNK__=(${encodeBoundedValidationChunk.toString()});`);
  await context.addInitScript(`(${observeTimedTextLaunches.toString()})(); window.__WITHIN_TIMED_TEXT_CANCEL__=(${cancelAfterRealBrowserPayload.toString()});`);
  await context.route("**/*", async route => {
    const req = route.request();
    report.requestCount++;
    let frameUrl = null;
    try { frameUrl = req.frame()?.url() ?? null; } catch { /* worker requests may not have a page frame */ }
    const kind = classifyTimedTextBrowserRequest({ method: req.method(), url: req.url(),
      postData: ["GET", "HEAD"].includes(req.method()) ? req.postData() : "blocked without reading",
      frameUrl, serviceWorkerUrl: req.serviceWorker?.()?.url() ?? null }, server.baseURL, staticPaths);
    if (kind === "forbidden") {
      if (report.forbiddenRequests.length < 16) report.forbiddenRequests.push({ method: req.method(),
        sameOrigin: new URL(req.url()).origin === server.baseURL });
      rejectSafety(new Error("Unexpected conversion-page network request blocked"));
      await route.abort();
    } else await route.continue();
  });
  let lastRealm = 0;
  drainTimer = setInterval(() => {
    void drain().catch(rejectSafety);
    const now = Date.now();
    if (now - lastRealm >= 500) { lastRealm = now; observeRealms(); }
  }, 250);
  controlStart = Date.now();
  const open = async (fault = null) => {
    const response = await guard(page.goto(`${server.baseURL}/?test=1&directory=1${fault ? `&fault=${fault}` : ""}`));
    assert.equal(response?.status(), 200);
    const headers = response.headers();
    const policy = { opener: headers["cross-origin-opener-policy"], embedder: headers["cross-origin-embedder-policy"],
      csp: headers["content-security-policy"], referrer: headers["referrer-policy"] };
    assert.equal(policy.opener, "same-origin");
    assert.equal(policy.embedder, "require-corp");
    assert.equal(policy.referrer, "no-referrer");
    assert.match(policy.csp ?? "", /(?:^|;)\s*connect-src 'self'(?:;|$)/);
    report.pageSecurityHeaders ??= policy;
    assert.deepEqual(policy, report.pageSecurityHeaders);
    await guard(page.waitForFunction(() => window.__WITHIN_TEST__?.getState().workerStatus === "ready"));
    assert.equal(await guard(page.evaluate(() => crossOriginIsolated)), true);
  };
  // The app's real file input is used without CDP uploading the fixture contents.
  const select = async () => {
    await guard(selectOwnedLocalBrowserFile(page, input, runtime.directory));
    await guard(page.getByTestId("format-select").selectOption("mp4-to-vtt"));
    const track = page.getByTestId("timed-text-track-select");
    await guard(track.locator(`option[value="${fixture.selectedTrackId}"]`).waitFor({ state: "attached" }));
    const ids = await guard(track.locator("option").evaluateAll(opts => opts.map(option => option.value).filter(Boolean).map(Number)));
    assert.deepEqual(ids, fixture.trackIds);
    assert.equal(await guard(track.inputValue()), "", "No automatic subtitle-track selection permitted");
    assert.equal(await guard(page.getByTestId("convert-button").isDisabled()), true);
    await guard(track.selectOption(String(fixture.selectedTrackId)));
  };
  const storageEntries = () => page.evaluate(async () => {
    const root = await navigator.storage.getDirectory(), entries = [];
    for await (const [name] of root.entries()) {
      if (entries.length >= 16) throw new Error("Unexpected OPFS inventory");
      entries.push(name);
    }
    return entries;
  });
  const empty = async () => assert.deepEqual(await guard(storageEntries()), [], "Unexpected stage, partial or duplicate output");
  const storage = () => guard(page.evaluate(async () => {
    const estimate = await navigator.storage.estimate();
    return { usage: estimate.usage ?? null, quota: estimate.quota ?? null, usageDetails: estimate.usageDetails ?? null };
  }));
  const seen = new Set();
  const exercise = async (kind, scenario, fault = null) => {
    await empty();
    const started = Date.now();
    const row = { kind, scenario, fault, started };
    report.cases.push(row);
    const result = await guard(page.evaluate(async kind => {
      const initial = window.__WITHIN_TEST__.getState(), previous = initial.metrics;
      const getState = () => { const s = window.__WITHIN_TEST__.getState(); return s.metrics === previous ? null : s; };
      const start = () => {
        const button = document.querySelector('[data-testid="convert-button"]');
        if (!button || button.disabled) throw new Error("Start button not ready");
        button.click();
      };
      const cancel = () => {
        const button = [...document.querySelectorAll("button")].find(node => node.textContent.trim() === "Cancel safely");
        if (!button || button.disabled) throw new Error("Production cancel button not ready");
        button.click();
      };
      const nextFrame = () => new Promise(resolve => requestAnimationFrame(resolve));
      const now = () => performance.now();
      const deadline = now() + 30000;
      const trigger = kind === "cancelled" ? await window.__WITHIN_TIMED_TEXT_CANCEL__({ getState, start, cancel, nextFrame, now }) : (start(), null);
      while (now() < deadline) {
        await nextFrame();
        const state = getState();
        if (["complete", "cancelled", "error"].includes(state?.jobState)) return { state, trigger, launch: window.__WITHIN_TIMED_TEXT_LAUNCHES__.at(-1) };
      }
      throw new Error("Timed-text job did not reach terminal state");
    }, kind));
    row.terminalAt = Date.now();
    row.terminal = result.state.jobState; row.metrics = result.state.metrics; row.launch = result.launch;
    row.error = result.state.error; row.warnings = result.state.warnings;
    if (result.trigger) row.trigger = result.trigger;
    assertTimedTextLaunch(result.launch, fixture, fixture.selectedTrackId, fault);
    assert.ok(!seen.has(result.launch.jobId), "Repeated jobs require distinct launches");
    seen.add(result.launch.jobId);
    assertTimedTextTerminal(result.state, kind, fixture.expected.bytes);
    if (kind === "complete") {
      assert.deepEqual(result.state.batchOutputNames, [outputName]);
      const binding = await guard(bindOpfsOutputValidationBacking(page, profile, outputName, fixture.expected.bytes));
      row.binding = binding.proof;
      row.validated = await guard(validateTimedTextPhysicalOutput(binding.file, fixture.expected));
      await guard(assertOpfsOutputValidationBackingUnchanged(binding));
      await guard(page.evaluate(async name => (await navigator.storage.getDirectory()).removeEntry(name), outputName));
    }
    await empty();
    row.noLogicalFilesAfter = true;
    row.storageAfter = await storage();
    await guard(page.waitForFunction(() => window.__WITHIN_TEST__?.getState().workerStatus === "ready"));
    row.cleanup = await stable();
    row.cleanupOverLoadedIdleMiB = (row.cleanup.privateBytes - report.loaded.privateBytes) / mib;
    assert.ok(row.cleanupOverLoadedIdleMiB <= CLEANUP_MIB_LIMIT, "Unchanged 96 MiB cleanup-recovery limit");
  };

  await open();
  await select();
  report.loaded = await stable();
  report.storageBefore = await storage();
  for (let repeat = 1; repeat <= 3; repeat++) await exercise("complete", `same-page-repeat-${repeat}`);
  await exercise("cancelled", "cancel-after-payload");
  await exercise("complete", "same-page-recovery-after-cancel");
  await open("write"); await select(); await exercise("error", "actual-writer-injected-fault", "write");
  await open(); await select(); await exercise("complete", "same-browser-recovery-after-fault");
  assert.equal(report.cases.length, 7);
  assert.ok(report.requestCount > 0 && report.forbiddenRequests.length === 0);
  controlEnd = Date.now();
} catch (error) { recordFailure(error); controlEnd ??= Date.now(); }
finally {
  clearInterval(drainTimer);
  await pendingDrain?.catch(recordFailure);
  await pendingRealm;
  if (realm) { realm.close(); report.realmOwnership = realm.ownershipSummary(); }
  const cleanup = async operation => { try { await operation(); } catch (error) { recordFailure(error); } };
  if (page && !page.isClosed()) await cleanup(async () => {
    report.jobCleanup = await cancelBrowserConversionBeforeCleanup(page);
    if (new URL(page.url()).origin === server?.baseURL) await page.evaluate(async name => {
      const root = await navigator.storage.getDirectory();
      // Remove only the exact path owned by this control; the owned profile
      // itself is removed below once process teardown is proven.
      try { await root.removeEntry(name); } catch (error) { if (error.name !== "NotFoundError") throw error; }
    }, outputName);
  });
  if (monitor) {
    await cleanup(drain);
    await cleanup(() => monitor.close());
    report.monitorOwnership = monitor.ownershipSummary();
  }
  if (birth) await cleanup(async () => {
    const observedPids = [...new Set(samples.flatMap(row => (row.processes ?? []).map(process => process.pid)))];
    report.browserCleanup = await cleanupOwnedChromium({ identity: birth, observedPids, disconnect: () => browser?.close() });
    if (report.browserCleanup.status !== "owned-observed-pids-absent") {
      const pids = report.browserCleanup.observedPids;
      report.birthReconciliation = reconcileChromiumBirths({ identity: birth, observedPids: pids, samples, current: await queryObservedPidCensus(pids) });
      assert.equal(report.birthReconciliation.allObservedBirthsAbsent, true);
    }
    report.browserGone = true;
  });
  if (server) await cleanup(async () => { report.serverCleanup = await server.close(); });
  if (runtime) await cleanup(async () => {
    assert.ok(!chrome?.pid || report.browserGone, "Retain profile if owned Chrome absence was not proven");
    await runtime.close(); await assert.rejects(lstat(runtime.directory), { code: "ENOENT" }); report.scratchRemoved = true;
  });
  await cleanup(async () => {
    for (const [file, digest] of Object.entries(report.sourcePins)) assert.equal(sha(await readFile(path.join(repo, file))), digest);
    if (report.browserPin) assertInstalledChromePinsEqual(report.browserPin, await inspectInstalledChromePin());
  });
  if (controlStart !== undefined) await cleanup(async () => {
    report.memory = summarizeTimedTextMemory(samples, controlStart, controlEnd, report.blank, report.loaded);
    assert.ok(report.memory.incrementalPrivateMiB <= PRIVATE_MIB_LIMIT);
    assert.ok(report.memory.maxSampleGapMs <= 1000, "Insufficient Chrome sampling coverage");
    for (const row of report.cases) {
      if (row.terminalAt === undefined) continue;
      row.memory = summarizeTimedTextMemory(samples, row.started, row.terminalAt, report.blank, report.loaded);
      assert.ok(row.memory.maxSampleGapMs <= 1000, "Insufficient active job sampling coverage");
    }
  });
  report.status = failed ? "failed-not-qualification" : "passed-private-headless-mp4-control-not-public-qualification";
  const directory = path.join(repo, "output/playwright");
  await mkdir(directory, { recursive: true });
  assert.equal((await realpath(directory)).toLowerCase(), directory.toLowerCase(), "Reports must remain in the repository");
  const raw = gzipSync(Buffer.from(JSON.stringify(samples)));
  report.rawMemoryFile = `${stamp}-timed-text-native-memory.json.gz`;
  report.rawMemorySha256 = sha(raw);
  await writeFile(path.join(directory, report.rawMemoryFile), raw, { flag: "wx" });
  const reportFile = path.join(directory, `${stamp}-timed-text.json`);
  await writeFile(reportFile, JSON.stringify(report, null, 2) + "\n", { flag: "wx" });
  console.log(`${report.status}: ${reportFile}`);
  if (failed) process.exitCode = 1;
}
