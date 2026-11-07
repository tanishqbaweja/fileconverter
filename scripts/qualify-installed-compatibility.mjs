// Scoped installed-browser coverage, not cross-browser stress/public promotion.
import "./lib/hidden-unit-subprocesses.mjs";
import assert from "node:assert/strict";
import { execFile, spawn } from "node:child_process";
import { createHash } from "node:crypto";
import { once } from "node:events";
import { createReadStream, constants } from "node:fs";
import { copyFile, lstat, readFile, readdir, realpath, stat, statfs, writeFile } from "node:fs/promises";
import { createServer } from "node:net";
import path from "node:path";
import { promisify } from "node:util";
import { gzipSync } from "node:zlib";
import { chromium } from "playwright";
import { createOwnedRuntimeScratch, finishOwnedCleanup } from "./lib/owned-runtime-scratch.mjs";
import { startOwnedProductionTestServer } from "./lib/owned-production-test-server.mjs";
import { inspectStressHostMemory } from "./lib/host-memory-preflight.mjs";
import { queryReliableProcessIdentity } from "./lib/reliable-owned-identity.mjs";
import { cleanupOwnedChromium } from "./lib/owned-chromium-cleanup.mjs";
import { startClassifiedChromiumMemoryMonitor } from "./lib/birth-type-capture.mjs";
import { stableWindow } from "./lib/chromium-private-memory.mjs";
import { summarizeDocxHtmlRunMemory } from "./lib/docx-html-scaling-control.mjs";
import { connectRealmSampler } from "./lib/cdp-realm-memory.mjs";
import { classifyPrivateRequest } from "./lib/private-browser-request.mjs";
import { selectOwnedLocalBrowserFile } from "./lib/select-owned-local-browser-file.mjs";
import { encodeBoundedValidationChunk } from "./lib/bounded-validation-chunk.mjs";
import { bindOpfsOutputValidationBacking, assertOpfsOutputValidationBackingUnchanged } from "./lib/opfs-output-validation-backing.mjs";
import { completeNewBrowserJob } from "./lib/docx-direct-control.mjs";
import { cancelBrowserConversionBeforeCleanup } from "./lib/cancel-browser-conversion-before-cleanup.mjs";
import { boundedErrorDetails } from "./lib/bounded-error-details.mjs";
import { INSTALLED_COMPATIBILITY_CASES as cases, INSTALLED_COMPATIBILITY_TARGETS as targets, INSTALLED_COMPATIBILITY_LIMITS as limits,
  installedCompatibilityPaths, isCompatibilityStaticPath, makeCompatibilityWave, validateCompatibilityMetrics } from "./lib/installed-compatibility-plan.mjs";
import { validateInstalledCompatibilityOutput } from "./lib/installed-compatibility-validators.mjs";

assert.equal(process.platform, "win32");
const id = process.argv[2]; assert.ok(process.argv.length === 3 && Object.hasOwn(targets, id), "Select brave or opera-gx explicitly");
const root = path.resolve(import.meta.dirname, ".."), execute = promisify(execFile), pause = ms => new Promise(resolve => setTimeout(resolve, ms));
const stamp = new Date().toISOString().replaceAll(/[:.]/g, "-"), sha = b => createHash("sha256").update(b).digest("hex");
const hash = async file => { const h = createHash("sha256"); for await (const b of createReadStream(file, { highWaterMark: 262144 })) h.update(b); return h.digest("hex"); };
const original = async () => ({ bytes: (await stat(path.join(root, "test.mkv"))).size, sha256: await hash(path.join(root, "test.mkv")) });
async function inspectBrowser() {
  const versionOf = async () => (await execute("powershell.exe", ["-NoProfile", "-NonInteractive", "-Command",
    `$ErrorActionPreference='Stop'; (Get-Item -LiteralPath '${targets[id].launcher.replaceAll("'", "''")}').VersionInfo.ProductVersion`],
  { windowsHide: true, timeout: 5000, maxBuffer: 16384 })).stdout.trim();
  const version = await versionOf(), files = installedCompatibilityPaths(id, version), out = { version };
  for (const [role, file] of Object.entries(files)) {
    const before = await lstat(file, { bigint: true }); assert.ok(before.isFile() && !before.isSymbolicLink() && before.size > 0n && before.size <= 1073741824n);
    assert.equal((await realpath(file)).toLowerCase(), file.toLowerCase());
    const sha256 = await hash(file), after = await lstat(file, { bigint: true });
    const identity = Object.fromEntries(["dev", "ino", "size", "birthtimeNs", "mtimeNs"].map(k => { assert.equal(before[k], after[k]); return [k, String(before[k])]; }));
    out[role] = { path: file, bytes: Number(before.size), sha256, identity };
  }
  assert.equal(await versionOf(), version); return out;
}
const report = { schemaVersion: 1, browserId: id, startedAt: new Date().toISOString(), status: "running",
  scope: "Eight independently validated representative production families on installed Chromium fork, OPFS-backed direct handle and unsafe/write-error/recovery; no large/stress/native-picker qualification",
  headed: false, browserServicesDisabled: false, normalInstalledUserProfileUsed: false, nativePickerVerified: false,
  nativeConversionUsed: false, stressAcceptance: false, publicPromotion: false, cases: [], sourcePins: {}, failures: [],
  limits, requestCount: 0, forbiddenRequests: [], realmObservations: [],
  memoryFormula: "(peak complete spawned process-tree private bytes - earliest stable same clean blank browser private bytes) / 1048576" };
let runtime, server, child, birth, browser, context, page, monitor, realms, timer, pending, realmPending, tracing, start, end, observerError;
const samples = []; let rejectStop;
const stop = new Promise((_, reject) => { rejectStop = reject; }); void stop.catch(() => {});
const observerFailure = error => { observerError ??= error; rejectStop(error); };
const drain = () => pending ??= (async () => {
  const batch = await monitor.drain(); assert.equal(batch.overflow, false);
  assert.ok(samples.length + batch.samples.length <= limits.samples); samples.push(...batch.samples);
  if (start !== undefined) for (const s of batch.samples) if (Date.parse(s.timestamp) >= start && (end === undefined || Date.parse(s.timestamp) <= end) && s.privateBytes !== null)
    assert.ok((s.privateBytes - report.blankBaseline.privateBytes) / 1048576 <= limits.primaryMiB, "Unchanged250MiB full-process-tree safety stop");
})().finally(() => { pending = null; });
const sampleRealms = () => realmPending ??= (async () => {
  assert.ok(report.realmObservations.length < limits.realmObservations);
  report.realmObservations.push({ timestamp: new Date().toISOString(), ...await realms.sample() });
})().finally(() => { realmPending = null; });
async function stable() {
  const rows = [], deadline = Date.now() + 30000;
  while (Date.now() < deadline) {
    await drain(); const last = samples.at(-1);
    if (last && last.sequence !== rows.at(-1)?.sequence) rows.push({ ...last, elapsedMs: Date.parse(last.timestamp) });
    const value = stableWindow(rows); if (value) return value;
    await pause(1000);
  }
  throw new Error("Unchanged30s/8s/5sample/2% stability window unavailable");
}
try {
  report.hostMemory = await inspectStressHostMemory(); assert.equal(report.hostMemory.safeToStart, true);
  const disk = await statfs(root); report.diskFreeBytes = disk.bavail * disk.bsize; assert.ok(report.diskFreeBytes >= 512 * 1048576);
  report.executedHead = (await execute(process.env.WITHIN_GIT_EXECUTABLE ?? "git", ["rev-parse", "HEAD"], { cwd: root, windowsHide: true, timeout: 10000 })).stdout.trim();
  report.browserBefore = await inspectBrowser(); report.protectedOriginalBefore = await original();
  assert.deepEqual(report.protectedOriginalBefore, { bytes: 2958573265, sha256: "31f36695b5b44c62125a9e4264e84dc085accd21c02cc3487aae597f54b9db34" });
  for (const file of ["scripts/qualify-installed-compatibility.mjs", "scripts/lib/installed-compatibility-plan.mjs", "scripts/lib/installed-compatibility-validators.mjs",
    "scripts/lib/owned-chromium-cleanup.mjs", "scripts/lib/owned-production-test-server.mjs", "scripts/lib/birth-aware-chromium-memory.mjs",
    "scripts/lib/opfs-output-validation-backing.mjs", "scripts/lib/select-owned-local-browser-file.mjs", "app/converter/ConverterApp.tsx",
    "workers/conversion.worker.ts", "lib/capability-registry.ts", "package-lock.json", "worker/index.ts"])
    report.sourcePins[file] = await hash(path.join(root, file));
  const configFile = path.join(root, "dist/server/wrangler.json"), config = JSON.parse(await readFile(configFile));
  assert.equal(config.assets.binding, "ASSETS"); assert.equal(config.assets.run_worker_first, true); assert.equal(config.assets.directory, "../client");
  const assetRoot = path.join(root, "dist/client"), assets = new Set();
  for (const entry of await readdir(assetRoot, { withFileTypes: true, recursive: true })) {
    assert.equal(entry.isSymbolicLink(), false); if (!entry.isFile()) continue;
    assert.ok(assets.size < 8192);
    assets.add("/" + path.relative(assetRoot, path.join(entry.parentPath, entry.name)).split(path.sep).map(encodeURIComponent).join("/"));
  }
  report.staticAssetCount = assets.size;
  report.build = { configSha256: await hash(configFile), workerSha256: await hash(path.join(root, "dist/server", config.main)) };
  runtime = await createOwnedRuntimeScratch("installed-compatibility-");
  const env = { ...runtime.env, PYTHONDONTWRITEBYTECODE: "1", WRANGLER_SEND_METRICS: "false" };
  const native = (program, args) => execute(program, args, { cwd: root, env, windowsHide: true, timeout: 30000, maxBuffer: 262144 });
  report.validators = {};
  for (const [program, args] of [["python", ["--version"]], ["ffmpeg", ["-version"]], ["ffprobe", ["-version"]]])
    report.validators[program] = (await native(program, args)).stdout.split(/\r?\n/)[0];
  const fixtures = new Map();
  for (const row of [...cases, { family: "unsafe", fixture: "fixtures/archives/unsafe-entry.tar", extension: "tar" }]) {
    const file = path.join(runtime.directory, `within-test-compat-${row.family}.${row.extension}`);
    if (row.fixture) {
      const originalFixture = path.join(root, row.fixture), info = await lstat(originalFixture);
      assert.ok(info.isFile() && !info.isSymbolicLink() && info.size > 0 && info.size <= limits.inputBytes);
      assert.equal(await realpath(originalFixture), originalFixture);
      await copyFile(originalFixture, file, constants.COPYFILE_EXCL); assert.equal(await hash(file), await hash(originalFixture));
    } else await writeFile(file, makeCompatibilityWave(), { flag: "wx" });
    fixtures.set(row.family, { file, bytes: (await stat(file)).size, sha256: await hash(file) });
  }
  const port = await new Promise((resolve, reject) => { const s = createServer(); s.once("error", reject);
    s.listen(0, "127.0.0.1", () => { const p = s.address().port; s.close(error => error ? reject(error) : resolve(p)); }); });
  server = await startOwnedProductionTestServer({ root, directory: runtime.directory, env, port });
  report.serverIdentity = server.identity;
  const profile = path.join(runtime.directory, "profile");
  report.launchArguments = ["--headless=new", "--remote-debugging-port=0", `--user-data-dir=${profile}`, "--no-first-run", "--no-default-browser-check", "about:blank"];
  child = spawn(report.browserBefore.executable.path, report.launchArguments, { cwd: root, env, windowsHide: true, stdio: "ignore" });
  await once(child, "spawn"); birth = await queryReliableProcessIdentity(child.pid); assert.ok(birth);
  report.browserIdentity = birth;
  monitor = await startClassifiedChromiumMemoryMonitor(child.pid, runtime.directory, 100);
  let activePort; const readyDeadline = Date.now() + 20000;
  while (Date.now() < readyDeadline) {
    assert.equal(child.exitCode, null, "Installed browser exited before owned DevTools startup");
    try { activePort = (await readFile(path.join(profile, "DevToolsActivePort"), "utf8")).split(/\r?\n/)[0]; if (/^\d+$/.test(activePort)) break; }
    catch (error) { if (error.code !== "ENOENT") throw error; }
    await pause(200);
  }
  assert.match(activePort ?? "", /^\d+$/); const debuggerOrigin = `http://127.0.0.1:${activePort}`;
  browser = await chromium.connectOverCDP(debuggerOrigin, { timeout: 20000 });
  assert.equal(browser.contexts().length, 1); context = browser.contexts()[0];
  page = context.pages().find(p => p.url() === "about:blank"); assert.ok(page, "Fresh about:blank target required; never substitute a loaded baseline");
  report.blankBaseline = await stable();
  const browserVersion = await (await fetch(`${debuggerOrigin}/json/version`, { signal: AbortSignal.timeout(3000) })).json();
  report.browserProtocolVersion = browserVersion.Browser;
  realms = await connectRealmSampler(browserVersion.webSocketDebuggerUrl, server.baseURL);
  await context.addInitScript(`window.__WITHIN_AUDIO_VALIDATION_CHUNK__=(${encodeBoundedValidationChunk.toString()});window.__WITHIN_COMPAT_COMPLETE__=(${completeNewBrowserJob.toString()});`);
  await context.addInitScript(() => {
    const original = Worker.prototype.postMessage, rows = [];
    window.__WITHIN_COMPAT_DESTINATIONS__ = rows;
    Worker.prototype.postMessage = function (...args) {
      const m = args[0];
      if (m?.type === "start") {
        if (rows.length >= 16) throw new Error("Finite destination-observation limit");
        rows.push({ profileId: m.profileId, mode: m.destination?.mode ?? null,
          actualFileHandle: m.destination?.handle instanceof FileSystemFileHandle, inputBytes: m.file?.size ?? null });
      }
      return Reflect.apply(original, this, args);
    };
  });
  await context.route("**/*", async route => {
    const request = route.request(), method = request.method(); report.requestCount++;
    let frameUrl = null; try { frameUrl = request.frame()?.url() ?? null; } catch { /* worker-owned */ }
    const category = classifyPrivateRequest({ method, url: request.url(), frameUrl, serviceWorkerUrl: request.serviceWorker?.()?.url() ?? null,
      postData: ["GET", "HEAD"].includes(method) ? request.postData() : "forbidden-body-not-read" }, server.baseURL);
    if (report.requestCount > limits.requests || !(category === "browser-local" || category === "app-static" && isCompatibilityStaticPath(request.url(), server.baseURL, assets))) {
      if (report.forbiddenRequests.length < 16) report.forbiddenRequests.push({ method, urlSha256: sha(request.url()), category });
      observerFailure(new Error("Request outside exact built-asset/privacy policy")); await route.abort();
    } else await route.continue();
  });
  await context.tracing.start({ screenshots: true, snapshots: false, sources: false }); tracing = true;
  const open = async (query = "?test=1") => {
    await page.goto(server.baseURL + "/" + query, { timeout: 20000 });
    await page.waitForFunction(() => window.__WITHIN_TEST__?.getState().workerStatus === "ready", undefined, { timeout: 20000 });
  };
  await open();
  report.runtimeCapabilities = await page.evaluate(() => ({ isolated: crossOriginIsolated, userAgent: navigator.userAgent,
    opfs: typeof navigator.storage.getDirectory === "function", fsa: typeof window.showSaveFilePicker === "function", sab: typeof SharedArrayBuffer === "function" }));
  assert.equal(report.runtimeCapabilities.isolated, true); assert.equal(report.runtimeCapabilities.opfs, true); assert.equal(report.runtimeCapabilities.sab, true);
  report.loadedIdle = await stable(); start = Date.now();
  timer = setInterval(() => {
    void drain().catch(observerFailure);
    if (Math.floor(Date.now() / 500) % 4 === 0) void sampleRealms().catch(observerFailure);
  }, 500);
  const outputNames = () => page.evaluate(async () => { const directory = await navigator.storage.getDirectory(), names = [];
    for await (const [name] of directory.entries()) { if (names.length >= 16) throw new Error("Finite OPFS listing required"); names.push(name); } return names; });
  const ready = () => page.waitForFunction(() => window.__WITHIN_TEST__?.getState().workerStatus === "ready", undefined, { timeout: 20000 });
  const choose = async (fixture, profileId) => {
    const input = await selectOwnedLocalBrowserFile(page, fixture.file, runtime.directory);
    await page.locator('[data-testid="format-select"]').selectOption(profileId, { timeout: 15000 }); return input;
  };
  const observeCleanup = async row => {
    await ready(); assert.deepEqual(await outputNames(), []);
    row.cleanup = await Promise.race([stop, stable()]); row.endedAt = Date.now();
    assert.ok((row.cleanup.privateBytes - report.loadedIdle.privateBytes) / 1048576 <= limits.cleanupMiB, "Unchanged96MiB cleanup gate");
  };
  const convert = async (family, profileId, kind = "success") => {
    const fixture = fixtures.get(family), row = { family, profileId, kind, startedAt: Date.now(), sourceBytes: fixture.bytes, sourceSha256: fixture.sha256 };
    report.cases.push(row); row.input = await choose(fixture, profileId);
    const state = await Promise.race([stop, page.evaluate(() => window.__WITHIN_COMPAT_COMPLETE__({
      getState: () => window.__WITHIN_TEST__.getState(), start: () => document.querySelector('[data-testid="convert-button"]').click(),
      nextFrame: () => new Promise(resolve => requestAnimationFrame(resolve)), now: () => performance.now(),
    }))]);
    assert.equal(state.error, null); assert.equal(state.selectedProfileId, profileId); validateCompatibilityMetrics(state.metrics);
    row.metrics = state.metrics;
    row.destination = await page.evaluate(() => window.__WITHIN_COMPAT_DESTINATIONS__.at(-1));
    assert.deepEqual(row.destination, { profileId, mode: kind === "direct" ? "handle" : "opfs-test", actualFileHandle: kind === "direct", inputBytes: fixture.bytes });
    const name = kind === "direct" ? state.batchOutputNames[0] : state.opfsName;
    if (kind === "direct") { assert.equal(state.opfsName, null); assert.equal(state.batchOutputNames.length, 1); }
    try {
      const binding = await bindOpfsOutputValidationBacking(page, profile, name, state.metrics.outputBytes); row.binding = binding.proof;
      row.validation = await validateInstalledCompatibilityOutput(profileId, fixture.file, binding.file, native);
      row.outputSha256 = await hash(binding.file); await assertOpfsOutputValidationBackingUnchanged(binding);
      assert.equal(await hash(fixture.file), fixture.sha256); row.validated = true;
    } finally { if (typeof name === "string" && name.startsWith("within-test-"))
      await page.evaluate(async n => (await navigator.storage.getDirectory()).removeEntry(n), name); }
    await observeCleanup(row);
  };
  for (const row of cases) await convert(row.family, row.profileId);
  await open("?test=1&directory=1"); await convert("data", "csv-to-tsv", "direct");
  const adverse = async (family, profileId, kind, errorPattern) => {
    const fixture = fixtures.get(family), row = { family, profileId, kind, startedAt: Date.now(), sourceBytes: fixture.bytes, sourceSha256: fixture.sha256 };
    report.cases.push(row); row.input = await choose(fixture, profileId);
    await page.locator('[data-testid="convert-button"]').click({ timeout: 15000 });
    await Promise.race([stop, page.waitForFunction(() => window.__WITHIN_TEST__?.getState().jobState === "error", undefined, { timeout: 20000 })]);
    const state = await page.evaluate(() => window.__WITHIN_TEST__.getState());
    assert.match(state.error, errorPattern); row.error = state.error.slice(0, 512); row.metrics = state.metrics;
    await observeCleanup(row); row.leftovers = [];
  };
  await open(); await adverse("unsafe", "tar-to-zip", "unsafe-archive", /unsafe tar entry/i);
  await open("?test=1&fault=write"); await adverse("data", "csv-to-tsv", "write-error", /destination rejected a bounded write/i);
  await open(); await convert("data", "csv-to-tsv", "recovery");
  end = Date.now(); assert.equal(observerError, undefined); assert.deepEqual(report.forbiddenRequests, []);
  report.screenshot = `output/playwright/${stamp}-${id}-normal-service-compatibility.png`;
  await page.screenshot({ path: path.join(root, report.screenshot), fullPage: true });
  report.status = "passed-eight-family-installed-headless-compatibility-not-stress";
} catch (error) { report.status = "failed-not-acceptance"; report.failures.push(...boundedErrorDetails(error)); process.exitCode = 1; }
finally {
  end ??= Date.now(); clearInterval(timer); await pending?.catch(() => {}); await realmPending?.catch(() => {});
  if (realms) { report.realmObserver = realms.ownershipSummary(); realms.close(); }
  const fail = error => { report.status = "failed-not-acceptance"; report.failures.push(...boundedErrorDetails(error)); process.exitCode = 1; };
  if (monitor) {
    try { await drain(); await monitor.close(); } catch (error) { fail(error); await monitor.close().catch(fail); }
    finally { report.nativeObserver = monitor.ownershipSummary(); }
  }
  try {
    if (start !== undefined && report.blankBaseline && report.loadedIdle) {
      const active = samples.filter(s => Date.parse(s.timestamp) >= start && Date.parse(s.timestamp) <= end), valid = active.filter(s => s.privateBytes !== null);
      assert.ok(valid.length > 0);
      const peak = valid.reduce((a, b) => a.privateBytes >= b.privateBytes ? a : b);
      report.memory = { peak, windowStart: new Date(start).toISOString(), windowEnd: new Date(end).toISOString(), validSamples: valid.length,
        unavailableSamples: active.length - valid.length, incrementalPrivateMiB: (peak.privateBytes - report.blankBaseline.privateBytes) / 1048576 };
      assert.ok(report.memory.incrementalPrivateMiB <= limits.primaryMiB);
      for (const row of report.cases) if (row.cleanup) {
        row.memory = summarizeDocxHtmlRunMemory(samples, row.startedAt, row.endedAt, report.blankBaseline, report.loadedIdle, row.cleanup);
        assert.ok(row.memory.incrementalPrivateMiB <= limits.primaryMiB && row.memory.cleanupDeltaFromLoadedMiB <= limits.cleanupMiB);
      }
    }
  } catch (error) { fail(error); }
  try {
    if (page && !page.isClosed()) {
      report.jobCleanup = await cancelBrowserConversionBeforeCleanup(page);
      await page.evaluate(async () => { const directory = await navigator.storage.getDirectory();
        for await (const [name] of directory.entries()) if (name.startsWith("within-test-") || name.startsWith("within-stage-")) await directory.removeEntry(name, { recursive: true }); });
    }
    if (tracing) {
      const file = report.status === "failed-not-acceptance" ? `output/playwright/${stamp}-${id}-compatibility-failure.zip` : undefined;
      await context.tracing.stop(file ? { path: path.join(root, file) } : {}); if (file) report.failureTrace = file;
    }
  } catch (error) { fail(error); }
  await finishOwnedCleanup([
    async () => { if (!birth) { assert.ok(!child?.pid, "Never terminate without an owned launch birth"); return; }
      report.browserCleanup = await cleanupOwnedChromium({ identity: birth, observedPids: [...new Set(samples.flatMap(s => (s.processes ?? []).map(p => p.pid)))],
        disconnect: async () => { await browser?.close(); } }); assert.equal(report.browserCleanup.status, "owned-observed-pids-absent"); },
    async () => { if (server) report.serverCleanup = await server.close(); },
  ]).catch(fail);
  try {
    if (runtime) { assert.ok(!child?.pid || report.browserCleanup?.status === "owned-observed-pids-absent"); await runtime.close(); report.ownedRuntimeRemoved = true; }
    for (const [file, digest] of Object.entries(report.sourcePins)) assert.equal(await hash(path.join(root, file)), digest);
    if (report.browserBefore) { report.browserAfter = await inspectBrowser(); assert.deepEqual(report.browserAfter, report.browserBefore); }
    if (report.protectedOriginalBefore) { report.protectedOriginalAfter = await original(); assert.deepEqual(report.protectedOriginalAfter, report.protectedOriginalBefore); }
  } catch (error) { fail(error); }
  const raw = Buffer.from(JSON.stringify(samples)), packed = gzipSync(raw), nativeFile = `evidence/${stamp}-${id}-compatibility-native.json.gz`;
  await writeFile(path.join(root, nativeFile), packed, { flag: "wx" });
  report.nativeArchive = { path: nativeFile, bytes: packed.length, sha256: sha(packed), decodedBytes: raw.length, decodedSha256: sha(raw) };
  report.finishedAt = new Date().toISOString(); const file = `evidence/${stamp}-${id}-normal-service-compatibility.json`;
  await writeFile(path.join(root, file), JSON.stringify(report, null, 2) + "\n", { flag: "wx" });
  console.log(JSON.stringify({ file, status: report.status, completed: report.cases.filter(c => c.validated).length,
    memory: report.memory?.incrementalPrivateMiB ?? null, failures: report.failures }));
}
