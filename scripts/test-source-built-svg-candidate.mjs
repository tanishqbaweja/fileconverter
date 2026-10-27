// Reuse existing production-browser SVG tests. No new converter or public engine writes.
import "./lib/hidden-unit-subprocesses.mjs";
import assert from "node:assert/strict";
import { spawn, execFile } from "node:child_process";
import { createReadStream } from "node:fs";
import { createHash } from "node:crypto";
import { access, mkdir, readFile, stat, statfs, writeFile } from "node:fs/promises";
import path from "node:path";
import { createServer } from "node:net";
import { promisify } from "node:util";
import { unzipSync } from "fflate";
import { chromium } from "playwright";
import { createOwnedRuntimeScratch } from "./lib/owned-runtime-scratch.mjs";
import { inspectStressHostMemory } from "./lib/host-memory-preflight.mjs";
import { inspectInstalledChromePin, assertInstalledChromePinsEqual } from "./lib/installed-chrome-pin.mjs";
import { queryReliableProcessIdentity } from "./lib/reliable-owned-identity.mjs";
import { observeOwnedProcessExit } from "./lib/owned-process-exit-observation.mjs";
import { startParallelMemoryObserver } from "./lib/parallel-memory-observer.mjs";
import { startChromiumMemoryMonitor } from "./lib/birth-aware-chromium-memory.mjs";
import { sampleChromiumTree, stableWindow } from "./lib/chromium-private-memory.mjs";
import { connectRealmSampler } from "./lib/cdp-realm-memory.mjs";
import { sha } from "../images/resvg-source/source-pins.mjs";
import { definedWasmMemories, requireExplicitWasmMaximum } from "../images/resvg-source/memory-contract.mjs";
import { compareStaticAbi, publishedSha256 } from "../images/resvg-source/postprocess-contract.mjs";

assert.equal(process.platform, "win32"); assert.equal(process.argv.length, 2);
const root = path.resolve(import.meta.dirname, ".."), execute = promisify(execFile), pause = ms => new Promise(resolve => setTimeout(resolve, ms));
const stamp = new Date().toISOString().replaceAll(/[:.]/g, "-");
const report = { schemaVersion: 1, startedAt: new Date().toISOString(), status: "running", sourcePins: {}, failures: [],
  scope: "Ten existing small SVG production UI/worker/I/O/validator/security/recovery tests with a private source-built Wasm response; not full stress/OOM/reproducibility or release acceptance",
  headed: false, nativePickerVerified: false, browserServicesDisabledByDriver: false,
  formula: "(peak simultaneous complete Chromium process-tree private bytes during the entire small suite - earliest stable clean blank private bytes) / 1048576",
  publicEngineReplacement: false, wholeGoalComplete: false, fullStressOrOomAcceptance: false, blankSamples: [], realmSamples: [] };
const protectedFile = path.join(root, "test.mkv");
const hashFile = async file => { const digest = createHash("sha256");
  for await (const bytes of createReadStream(file, { highWaterMark: 262144 })) digest.update(bytes); return digest.digest("hex"); };
const originalIdentity = async () => ({ bytes: (await stat(protectedFile)).size, sha256: await hashFile(protectedFile) });
const expectedOriginal = { bytes: 2958573265, sha256: "31f36695b5b44c62125a9e4264e84dc085accd21c02cc3487aae597f54b9db34" };
const pins = JSON.parse(await readFile(path.join(root, "images/resvg-source/processed-candidate-input.json")));
report.candidatePin = pins;
let runtime, server, chrome, runner, browser, observer, nativeMonitor, realms, timer, pending = Promise.resolve();
let serverBirth, chromeBirth, runnerBirth, observerBirth, serverLog = "", runnerLog = "", busy = false, traceStarted = false;
const stopKnown = async (child, birth) => {
  if (!child || child.exitCode !== null || child.signalCode !== null) return;
  assert.ok(birth); assert.deepEqual(await queryReliableProcessIdentity(child.pid), birth);
  await execute("taskkill.exe", ["/PID", String(child.pid), "/T", "/F"], { windowsHide: true, timeout: 15000, maxBuffer: 16384 });
};
const sourceFiles = ["scripts/test-source-built-svg-candidate.mjs", "tests/browser/image-conversions.spec.ts", "playwright.config.ts",
  "images/resvg-source/processed-candidate-input.json", "workers/conversion.worker.ts", "app/converter/ConverterApp.tsx",
  "lib/capability-registry.ts", "scripts/lib/birth-aware-chromium-memory.mjs", "scripts/lib/chromium-private-memory.mjs",
  "scripts/lib/parallel-memory-observer.mjs", "scripts/lib/host-memory-preflight.mjs", "package-lock.json"];
try {
  report.hostMemory = await inspectStressHostMemory(); assert.equal(report.hostMemory.safeToStart, true, "Unchanged 2 GiB physical/virtual safety floor");
  const disk = await statfs(root); assert.ok(disk.bavail * disk.bsize >= 1024 ** 3);
  report.protectedOriginalBefore = await originalIdentity(); assert.deepEqual(report.protectedOriginalBefore, expectedOriginal);
  report.browserBefore = await inspectInstalledChromePin();
  for (const file of sourceFiles) report.sourcePins[file] = sha(await readFile(path.join(root, file)));
  assert.equal(sha(await readFile(path.join(root, "public/engines/svg/resvg.wasm"))), publishedSha256);
  runtime = await createOwnedRuntimeScratch("svg-private-browser-");
  const env = { ...runtime.env, WRANGLER_SEND_METRICS: "false", NEXT_TELEMETRY_DISABLED: "1", GH_PROMPT_DISABLED: "true" };
  report.executedHead = (await execute(process.env.WITHIN_GIT_EXECUTABLE ?? "git", ["rev-parse", "HEAD"], { cwd: root, env, windowsHide: true, timeout: 15000 })).stdout.trim();
  const artifact = await execute(process.env.WITHIN_GH_EXECUTABLE ?? "gh", ["api", `repos/tanishqbaweja/fileconverter/actions/artifacts/${pins.artifactId}/zip`],
    { cwd: root, env, windowsHide: true, timeout: 30000, maxBuffer: 4 * 1024 ** 2, encoding: "buffer" });
  assert.equal(artifact.stdout.length, pins.artifactBytes); assert.equal(sha(artifact.stdout), pins.artifactSha256);
  const members = unzipSync(artifact.stdout), names = Object.keys(members).sort();
  assert.deepEqual(names, [pins.receiptMember, pins.wasmMember, pins.glueMember].sort());
  for (const [member, bytes, digest] of [[pins.receiptMember, pins.receiptBytes, pins.receiptSha256],
    [pins.wasmMember, pins.wasmBytes, pins.wasmSha256], [pins.glueMember, pins.glueBytes, pins.glueSha256]]) {
    assert.equal(members[member].length, bytes); assert.equal(sha(members[member]), digest);
  }
  const receipt = JSON.parse(Buffer.from(members[pins.receiptMember]).toString());
  assert.equal(receipt.executedHead, pins.headSha); assert.equal(receipt.ownedScratchRemoved, true);
  assert.equal(receipt.status, "processed-private-source-candidate-not-rendering-or-browser-acceptance");
  report.staticAbi = compareStaticAbi(await readFile(path.join(root, "public/engines/svg/resvg.wasm")), members[pins.wasmMember]);
  assert.equal(report.staticAbi.namesAndKindsEqual, true);
  report.wasmMemory = definedWasmMemories(members[pins.wasmMember]); requireExplicitWasmMaximum(report.wasmMemory, pins.experimentalMaximumBytes);
  const candidateFile = path.join(runtime.directory, "candidate.wasm"); await writeFile(candidateFile, members[pins.wasmMember], { flag: "wx" });
  const lease = createServer(); await new Promise(resolve => lease.listen(0, "127.0.0.1", resolve));
  const port = lease.address().port; await new Promise(resolve => lease.close(resolve)); const origin = `http://127.0.0.1:${port}`;
  server = spawn(process.execPath, ["node_modules/wrangler/bin/wrangler.js", "dev", "--config", "dist/server/wrangler.json", "--port", String(port), "--persist-to", path.join(runtime.directory, "wrangler")],
    { cwd: root, env, windowsHide: true, stdio: ["ignore", "pipe", "pipe"] });
  serverBirth = await queryReliableProcessIdentity(server.pid); assert.ok(serverBirth);
  for (const pipe of [server.stdout, server.stderr]) pipe.on("data", bytes => { serverLog = (serverLog + bytes).slice(-16384); });
  let ready = false; const serverDeadline = Date.now() + 30000;
  while (Date.now() < serverDeadline && !ready) {
    assert.equal(server.exitCode, null, serverLog);
    try { const response = await fetch(origin, { method: "HEAD", signal: AbortSignal.timeout(2000) }); ready = response.ok; } catch {}
    if (!ready) await pause(500);
  }
  assert.ok(ready, serverLog);
  const profile = path.join(runtime.directory, "profile"); await mkdir(profile);
  report.chromeArguments = ["--headless=new", "--remote-debugging-port=0", `--user-data-dir=${profile}`, "--no-first-run", "--no-default-browser-check", "about:blank"];
  chrome = spawn(report.browserBefore.launcher.path, report.chromeArguments, { cwd: root, env, windowsHide: true, stdio: "ignore" });
  chromeBirth = await queryReliableProcessIdentity(chrome.pid); assert.ok(chromeBirth);
  observer = await startParallelMemoryObserver(chrome.pid, runtime.directory, { startMonitor: async (...args) => { nativeMonitor = await startChromiumMemoryMonitor(...args); return nativeMonitor; } });
  observerBirth = await queryReliableProcessIdentity(observer.pid); assert.ok(observerBirth);
  let lines; const debugDeadline = Date.now() + 30000;
  while (Date.now() < debugDeadline && !lines) { assert.equal(chrome.exitCode, null);
    try { lines = (await readFile(path.join(profile, "DevToolsActivePort"), "utf8")).trim().split(/\r?\n/); } catch { await pause(250); } }
  assert.ok(lines && Number(lines[0]) > 0); const endpoint = `http://127.0.0.1:${Number(lines[0])}`;
  browser = await chromium.connectOverCDP(endpoint); assert.equal(browser.version(), report.browserBefore.version);
  const context = browser.contexts()[0], page = context.pages()[0]; assert.equal(page.url(), "about:blank");
  const baselineStarted = Date.now(), baselineDeadline = baselineStarted + 30000;
  while (Date.now() < baselineDeadline && !report.blankBaseline) {
    observer.healthy(); assert.equal(page.url(), "about:blank");
    let sample = { privateBytes: null, rssBytes: null, processes: null, sampleError: null };
    try { sample = { ...sample, ...await sampleChromiumTree(chrome.pid) }; } catch (error) { sample.sampleError = String(error); }
    report.blankSamples.push({ timestamp: new Date().toISOString(), elapsedMs: Date.now() - baselineStarted, ...sample });
    report.blankBaseline = stableWindow(report.blankSamples); if (!report.blankBaseline) await pause(1000);
  }
  assert.equal(report.blankBaseline?.stable, true, "Do not delay/inflate the earliest stable blank baseline"); report.baselineAdjusted = false;
  const forbidden = []; let forbiddenOverflow = false, wasmRequests = 0;
  context.on("request", request => { const url = new URL(request.url());
    if (url.pathname === "/engines/svg/resvg.wasm") wasmRequests++;
    if (!["GET", "HEAD"].includes(request.method()) || (["http:", "https:"].includes(url.protocol) && url.origin !== origin)) {
      if (forbidden.length < 32) forbidden.push({ url: request.url().slice(0, 512), method: request.method() }); else forbiddenOverflow = true;
    }
  });
  realms = await connectRealmSampler(`ws://127.0.0.1:${Number(lines[0])}${lines[1]}`, origin);
  await context.tracing.start({ screenshots: true, snapshots: true, sources: false }); traceStarted = true;
  const descriptor = path.join(runtime.directory, "descriptor.json"), resultFile = path.join(runtime.directory, "result.json");
  await writeFile(descriptor, JSON.stringify({ publicAcceptance: false, runtime: runtime.directory, candidateFile, sha256: pins.wasmSha256, endpoint }), { flag: "wx" });
  observer.setPhase("small-svg-suite"); report.suiteStartedAt = new Date().toISOString();
  timer = setInterval(() => { if (busy) return; busy = true;
    pending = realms.sample().then(value => { report.realmSamples.push({ timestamp: new Date().toISOString(), ...value }); if (report.realmSamples.length > 256) report.realmSamples.shift(); })
      .catch(error => { report.realmSamplerError = String(error); }).finally(() => { busy = false; }); }, 1000);
  runner = spawn(process.execPath, ["node_modules/@playwright/test/cli.js", "test", "tests/browser/image-conversions.spec.ts", "--grep", "svg-to-png|SVG", "--max-failures=1", "--reporter=line,json", "--output=" + path.join(runtime.directory, "artifacts")],
    { cwd: root, env: { ...env, WITHIN_TEST_BASE_URL: origin, WITHIN_TEST_PORT: String(port), WITHIN_REUSE_SERVER: "1", WITHIN_TEST_VIDEO: "off",
      WITHIN_PRIVATE_SVG_DESCRIPTOR: descriptor, PLAYWRIGHT_JSON_OUTPUT_NAME: resultFile }, windowsHide: true, stdio: ["ignore", "pipe", "pipe"] });
  for (const pipe of [runner.stdout, runner.stderr]) pipe.on("data", bytes => { runnerLog = (runnerLog + bytes).slice(-32768); });
  const completed = new Promise((resolve, reject) => { runner.once("error", reject); runner.once("exit", (code, signal) => { report.runnerSignal = signal; resolve(code); }); });
  runnerBirth = await queryReliableProcessIdentity(runner.pid); assert.ok(runnerBirth);
  report.runnerExitCode = await completed; clearInterval(timer); await pending; report.suiteFinishedAt = new Date().toISOString();
  await observer.through(Date.now());
  report.memory = { ...observer.peaks(["small-svg-suite"]), limitMiB: 250, scope: "Entire ten-case small suite including validation; not scaling/stress/OOM acceptance" };
  assert.ok(report.memory.validSamples > 0 && report.memory.peak);
  report.memory.incrementalPrivateMiB = (report.memory.peak.privateBytes - report.blankBaseline.privateBytes) / 1048576;
  const result = JSON.parse(await readFile(resultFile)); report.stats = result.stats;
  const cases = []; const collect = suites => { for (const suite of suites) { for (const spec of suite.specs ?? [])
    cases.push({ title: spec.title, ok: spec.ok, tests: spec.tests.map(row => ({ status: row.status, results: row.results.map(value => ({ status: value.status, duration: value.duration, errors: value.errors })) })) }); collect(suite.suites ?? []); } };
  collect(result.suites); report.cases = cases; report.wasmRequests = wasmRequests;
  report.forbiddenRequests = forbidden; report.forbiddenRequestOverflow = forbiddenOverflow;
  assert.equal(report.runnerSignal, null); assert.equal(report.runnerExitCode, 0, runnerLog);
  assert.equal(report.stats.expected, 10); assert.equal(report.stats.unexpected, 0); assert.equal(report.stats.skipped, 0); assert.equal(report.stats.flaky, 0);
  assert.ok(wasmRequests > 0); assert.deepEqual(forbidden, []); assert.equal(forbiddenOverflow, false);
  assert.ok(report.memory.incrementalPrivateMiB <= 250, "Complete Chromium process-tree small-suite private-memory limit failed");
  report.status = "passed-ten-private-small-svg-browser-cases-not-public-stress-acceptance";
} catch (error) { report.status = "failed-private-svg-browser-qualification"; report.failures.push(String(error.stack ?? error)); process.exitCode = 1; }
finally {
  clearInterval(timer); await pending;
  if (traceStarted) try {
    const tracePath = path.join(root, "output/playwright", stamp + "-source-svg-failure.zip");
    if (report.status.startsWith("failed")) { await mkdir(path.dirname(tracePath), { recursive: true });
      await browser.contexts()[0].tracing.stop({ path: tracePath }); report.failureTrace = { path: path.relative(root, tracePath), bytes: (await stat(tracePath)).size, sha256: await hashFile(tracePath) }; }
    else await browser.contexts()[0].tracing.stop();
  } catch (error) { report.failures.push("Trace closure: " + error); report.status = "failed-private-svg-browser-qualification"; process.exitCode = 1; }
  try { await observer?.stop(); report.nativeMemory = observer?.report() ?? null; report.nativeOwnership = nativeMonitor?.ownershipSummary() ?? null; }
  catch (error) { report.failures.push("Observer closure: " + error); report.status = "failed-private-svg-browser-qualification"; process.exitCode = 1; }
  realms?.close(); await browser?.close().catch(() => {});
  for (const [child, birth] of [[runner, runnerBirth], [chrome, chromeBirth], [server, serverBirth]])
    try { await stopKnown(child, birth); } catch (error) { report.failures.push("Owned stop: " + error); }
  report.processCleanup = [];
  for (const identity of [runnerBirth, chromeBirth, serverBirth, observerBirth].filter(Boolean))
    report.processCleanup.push(await observeOwnedProcessExit(identity));
  try {
    assert.ok(report.processCleanup.every(row => row.status === "owned-identity-absent"));
    assert.ok([runner, chrome, server].every(child => !child || child.exitCode !== null || child.signalCode !== null));
    await runtime?.close(); report.ownedRuntimeRemoved = Boolean(runtime);
    if (runtime) await assert.rejects(access(runtime.directory), { code: "ENOENT" });
    for (const [file, digest] of Object.entries(report.sourcePins)) assert.equal(sha(await readFile(path.join(root, file))), digest, file);
    assert.equal(sha(await readFile(path.join(root, "public/engines/svg/resvg.wasm"))), publishedSha256);
    if (report.browserBefore) assertInstalledChromePinsEqual(report.browserBefore, await inspectInstalledChromePin());
    if (report.protectedOriginalBefore) { report.protectedOriginalAfter = await originalIdentity(); assert.deepEqual(report.protectedOriginalAfter, expectedOriginal); }
  } catch (error) { report.failures.push("Final cleanup/source/original verification: " + error); report.status = "failed-private-svg-browser-qualification"; process.exitCode = 1; }
  report.serverLog = serverLog; report.runnerLog = runnerLog; report.finishedAt = new Date().toISOString();
  const file = path.join(root, "evidence", stamp + "-source-svg-browser.json");
  await writeFile(file, JSON.stringify(report, null, 2) + "\n", { flag: "wx" });
  console.log(JSON.stringify({ path: path.relative(root, file), status: report.status, stats: report.stats ?? null,
    incrementalPrivateMiB: report.memory?.incrementalPrivateMiB ?? null, ownedRuntimeRemoved: report.ownedRuntimeRemoved, failures: report.failures }));
}
