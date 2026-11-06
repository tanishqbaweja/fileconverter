// Scoped compatibility only: unchanged representative production/validator matrix.
// Does not substitute for whole-process memory, stress or native-picker qualification.
import "./lib/hidden-unit-subprocesses.mjs";
import assert from "node:assert/strict";
import { spawn, execFile } from "node:child_process";
import { createHash } from "node:crypto";
import { createReadStream } from "node:fs";
import { access, copyFile, cp, lstat, readdir, readFile, rm, stat, statfs, writeFile } from "node:fs/promises";
import { createServer } from "node:net";
import path from "node:path";
import { pathToFileURL } from "node:url";
import { promisify } from "node:util";
import { createOwnedRuntimeScratch, finishOwnedCleanup } from "./lib/owned-runtime-scratch.mjs";
import { startOwnedProductionTestServer } from "./lib/owned-production-test-server.mjs";
import { inspectStressHostMemory } from "./lib/host-memory-preflight.mjs";
import { queryReliableProcessIdentity } from "./lib/reliable-owned-identity.mjs";
import { observeOwnedProcessExit } from "./lib/owned-process-exit-observation.mjs";

const targets = Object.freeze({
  edge: "C:\\Program Files (x86)\\Microsoft\\Edge\\Application\\msedge.exe",
  brave: "C:\\Program Files\\BraveSoftware\\Brave-Browser\\Application\\brave.exe",
  "opera-gx": "C:\\Users\\slato\\AppData\\Local\\Programs\\Opera GX\\opera.exe",
});
const id = process.argv[2];
assert.equal(process.platform, "win32");
assert.ok(process.argv.length === 3 && Object.hasOwn(targets, id), "Select one installed browser explicitly");
const root = path.resolve(import.meta.dirname, ".."), execute = promisify(execFile), executable = targets[id];
const stamp = new Date().toISOString().replaceAll(/[:.]/g, "-"), artifactRoot = path.join(root, "output/playwright/browser-compatibility");
const outputRoot = path.join(root, "work", `browser-compatibility-${id}`);
const hash = async file => { const h = createHash("sha256");
  for await (const b of createReadStream(file, { highWaterMark: 262144 })) h.update(b); return h.digest("hex"); };
const inspectBinary = async () => {
  const { stdout } = await execute("powershell.exe", ["-NoProfile", "-NonInteractive", "-Command",
    `$ErrorActionPreference='Stop'; (Get-Item -LiteralPath '${executable.replaceAll("'", "''")}').VersionInfo.ProductVersion`],
  { windowsHide: true, timeout: 15000, maxBuffer: 16384 });
  const version = stdout.trim(); assert.match(version, /^\d+\.\d+\.\d+\.\d+$/);
  const library = path.join(path.dirname(executable), version, id === "edge" ? "msedge.dll" : "chrome.dll");
  return { executable, version, bytes: (await stat(executable)).size, sha256: await hash(executable),
    library: { path: library, bytes: (await stat(library)).size, sha256: await hash(library) } };
};
const original = async () => ({ bytes: (await stat(path.join(root, "test.mkv"))).size, sha256: await hash(path.join(root, "test.mkv")) });
const profiles = async () => (await readdir(path.join(root, "work"))).filter(name => name.startsWith(`playwright-profile-compatibility-${id}-`));
const report = { schemaVersion: 1, browserId: id, startedAt: new Date().toISOString(), status: "running",
  scope: "Five representative genuine production conversions, selected-destination adapter and unsafe-archive recovery; small fixtures only",
  headed: false, osNativePickerVerified: false, conversionMemoryAcceptance: false, stressAcceptance: false,
  publicPromotion: false, additionalBrowserArguments: [], sourcePins: {}, failures: [] };
report.browserLaunchPolicy = "Existing compatibility spec's Playwright defaults plus its three original arguments; not normal-profile/service parity or memory acceptance";
let runtime, server, runner, runnerBirth, log = "", artifactsOwned = false;
try {
  report.executedHead = (await execute(process.env.WITHIN_GIT_EXECUTABLE ?? "git", ["rev-parse", "HEAD"],
    { cwd: root, windowsHide: true, timeout: 10000 })).stdout.trim();
  report.hostMemory = await inspectStressHostMemory(); assert.equal(report.hostMemory.safeToStart, true);
  const disk = await statfs(root); assert.ok(disk.bavail * disk.bsize >= 512 * 1024 ** 2);
  report.browserBefore = await inspectBinary(); report.protectedOriginalBefore = await original();
  assert.deepEqual(report.protectedOriginalBefore, { bytes: 2958573265, sha256: "31f36695b5b44c62125a9e4264e84dc085accd21c02cc3487aae597f54b9db34" });
  // This legacy spec owns fixed paths: refuse existing data instead of letting
  // its beforeAll remove somebody else's artifacts or generated output.
  for (const file of [artifactRoot, outputRoot]) await assert.rejects(access(file), { code: "ENOENT" });
  assert.deepEqual(await profiles(), []);
  for (const file of ["scripts/run-installed-browser-conversions.mjs", "tests/browser/browser-compatibility.spec.ts",
    "playwright.config.ts", "package-lock.json", "lib/capability-registry.ts", "app/converter/ConverterApp.tsx",
    "worker/index.ts", "scripts/lib/owned-production-test-server.mjs", "scripts/lib/hidden-unit-subprocesses.mjs"])
    report.sourcePins[file] = await hash(path.join(root, file));
  const config = JSON.parse(await readFile(path.join(root, "dist/server/wrangler.json")));
  assert.equal(config.assets.binding, "ASSETS"); assert.equal(config.assets.run_worker_first, true);
  report.buildWorker = { path: path.relative(root, path.resolve(root, "dist/server", config.main)).replaceAll("\\", "/") };
  report.buildWorker.sha256 = await hash(path.join(root, report.buildWorker.path));
  runtime = await createOwnedRuntimeScratch("installed-browser-conversions-");
  const port = await new Promise((resolve, reject) => { const socket = createServer(); socket.once("error", reject);
    socket.listen(0, "127.0.0.1", () => { const port = socket.address().port; socket.close(error => error ? reject(error) : resolve(port)); }); });
  const preload = pathToFileURL(path.join(root, "scripts/lib/hidden-unit-subprocesses.mjs")).href;
  const env = { ...runtime.env, NODE_OPTIONS: [runtime.env.NODE_OPTIONS ?? "", "--import=" + preload].filter(Boolean).join(" "),
    WITHIN_BROWSER_TARGETS: id, WITHIN_CROSS_BROWSER_HEADED: "0", WITHIN_OPERA_GX_HEADED: "0",
    WITHIN_TEST_PORT: String(port), WITHIN_TEST_BASE_URL: `http://127.0.0.1:${port}`, WRANGLER_SEND_METRICS: "false" };
  server = await startOwnedProductionTestServer({ root, directory: runtime.directory, env, port });
  const resultFile = path.join(runtime.directory, "result.json"), configFile = path.join(runtime.directory, "playwright.config.mjs");
  await writeFile(configFile, `import base from ${JSON.stringify(pathToFileURL(path.join(root, "playwright.config.ts")).href)};
export default {...base,testDir:${JSON.stringify(path.join(root, "tests/browser"))},testMatch:["**/browser-compatibility.spec.ts"],
maxFailures:1,outputDir:${JSON.stringify(path.join(runtime.directory, "artifacts"))},
reporter:[["line"],["json",{outputFile:${JSON.stringify(resultFile)}}]],
use:{...base.use,baseURL:${JSON.stringify(server.baseURL)},headless:true},webServer:undefined};\n`, { flag: "wx" });
  artifactsOwned = true;
  runner = spawn(process.execPath, ["node_modules/@playwright/test/cli.js", "test", "--config", configFile],
    { cwd: root, env, windowsHide: true, stdio: ["ignore", "pipe", "pipe"] });
  const completed = new Promise((resolve, reject) => { runner.once("error", reject); runner.once("exit", resolve); });
  for (const pipe of [runner.stdout, runner.stderr]) pipe.on("data", b => { log = (log + b.toString()).slice(-32768); });
  runnerBirth = await queryReliableProcessIdentity(runner.pid); assert.ok(runnerBirth);
  report.runnerExitCode = await completed;
  const result = JSON.parse(await readFile(resultFile)); report.stats = result.stats;
  assert.equal(report.runnerExitCode, 0, log); assert.equal(result.stats.expected, 1);
  assert.equal(result.stats.unexpected, 0); assert.equal(result.stats.skipped, 0); assert.equal(result.stats.flaky, 0);
  report.matrix = JSON.parse(await readFile(path.join(artifactRoot, `${id}.json`)));
  assert.equal(report.matrix.browserId, id); assert.equal(report.matrix.headed, false);
  assert.deepEqual(report.matrix.routes.map(row => row.profileId).sort(), ["csv-to-tsv", "mkv-to-mp4", "png-to-webp", "tar-to-zip", "txt-to-docx"]);
  const screenshot = `${id}-headless-complete.png`;
  report.screenshot = { path: `output/playwright/${stamp}-${screenshot}`, sha256: await hash(path.join(artifactRoot, screenshot)) };
  await copyFile(path.join(artifactRoot, screenshot), path.join(root, report.screenshot.path), 1);
  report.status = "passed-five-representative-headless-conversions";
} catch (error) { report.status = "failed-not-acceptance"; report.failures.push(String(error.stack ?? error)); process.exitCode = 1; }
finally {
  await finishOwnedCleanup([
    async () => { if (runner && runner.exitCode === null && runner.signalCode === null) {
      assert.ok(runnerBirth); assert.deepEqual(await queryReliableProcessIdentity(runner.pid), runnerBirth);
      await execute("taskkill.exe", ["/PID", String(runner.pid), "/T", "/F"], { windowsHide: true, timeout: 15000 }); } },
    async () => { if (server) report.serverCleanup = await server.close(); },
  ]).catch(error => { report.failures.push("Process cleanup: " + error); report.status = "failed-not-acceptance"; process.exitCode = 1; });
  try {
    if (runnerBirth) { report.runnerCleanup = await observeOwnedProcessExit(runnerBirth); assert.equal(report.runnerCleanup.status, "owned-identity-absent"); }
    await assert.rejects(access(outputRoot), { code: "ENOENT" }); assert.deepEqual(await profiles(), []);
    report.convertedOutputsAndProfilesRemoved = true;
    if (artifactsOwned) {
      const info = await lstat(artifactRoot).catch(error => { if (error.code !== "ENOENT") throw error; return null; });
      if (info) {
        assert.ok(info.isDirectory() && !info.isSymbolicLink());
        const allowed = new Set([`${id}.json`, `${id}-headless-complete.png`]);
        assert.ok((await readdir(artifactRoot)).every(name => allowed.has(name)));
        await rm(artifactRoot, { recursive: true });
      }
    }
    for (const [file, digest] of Object.entries(report.sourcePins)) assert.equal(await hash(path.join(root, file)), digest);
    if (report.browserBefore) { report.browserAfter = await inspectBinary(); assert.deepEqual(report.browserAfter, report.browserBefore); }
    if (report.protectedOriginalBefore) { report.protectedOriginalAfter = await original(); assert.deepEqual(report.protectedOriginalAfter, report.protectedOriginalBefore); }
  } catch (error) { report.failures.push("Data/identity cleanup: " + error); report.status = "failed-not-acceptance"; process.exitCode = 1; }
  try {
    if (runtime) {
      assert.ok(!runner || runner.exitCode !== null || runner.signalCode !== null);
      if (report.status === "failed-not-acceptance") {
        report.failureArtifacts = `output/playwright/${stamp}-${id}-conversion-failure`;
        await cp(path.join(runtime.directory, "artifacts"), path.join(root, report.failureArtifacts),
          { recursive: true, errorOnExist: true, force: false }).catch(error => { if (error.code !== "ENOENT") throw error; });
      }
      await runtime.close(); report.ownedRuntimeRemoved = true;
    }
  } catch (error) { report.failures.push("Runtime cleanup: " + error); report.status = "failed-not-acceptance"; process.exitCode = 1; }
  report.runnerLog = log; report.finishedAt = new Date().toISOString();
  const file = path.join(root, "evidence", `${stamp}-${id}-installed-conversions.json`);
  await writeFile(file, JSON.stringify(report, null, 2) + "\n", { flag: "wx" });
  console.log(JSON.stringify({ path: path.relative(root, file), status: report.status, stats: report.stats, failures: report.failures }));
}
