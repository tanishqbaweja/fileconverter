// Run the unchanged complete privacy/hosting specs against an already-built app.
import "./lib/hidden-unit-subprocesses.mjs";
import assert from "node:assert/strict";
import { spawn, execFile } from "node:child_process";
import { createHash } from "node:crypto";
import { createReadStream } from "node:fs";
import { access, cp, readFile, stat, statfs, writeFile } from "node:fs/promises";
import { createServer } from "node:net";
import path from "node:path";
import { pathToFileURL } from "node:url";
import { promisify } from "node:util";
import { createOwnedRuntimeScratch, finishOwnedCleanup } from "./lib/owned-runtime-scratch.mjs";
import { inspectStressHostMemory } from "./lib/host-memory-preflight.mjs";
import { queryReliableProcessIdentity } from "./lib/reliable-owned-identity.mjs";
import { observeOwnedProcessExit } from "./lib/owned-process-exit-observation.mjs";

assert.equal(process.platform, "win32", "This wrapper uses Windows birth-identity cleanup");
assert.equal(process.argv.length, 2);
const root = path.resolve(import.meta.dirname, ".."), execute = promisify(execFile);
const stamp = new Date().toISOString().replaceAll(/[:.]/g, "-"), sha = value => createHash("sha256").update(value).digest("hex");
const hashFile = async file => { const digest = createHash("sha256");
  for await (const chunk of createReadStream(file, { highWaterMark: 262144 })) digest.update(chunk);
  return digest.digest("hex"); };
const originalFile = path.join(root, "test.mkv"), originalSha = "31f36695b5b44c62125a9e4264e84dc085accd21c02cc3487aae597f54b9db34";
const report = { schemaVersion: 1, startedAt: new Date().toISOString(), status: "running",
  scope: "Complete unchanged production privacy/offline/static-host browser specs; not process-memory, stress, OS-picker or native reproduction acceptance",
  headedCoverage: false, conversionMemoryAcceptance: false, publicPromotion: false, sourcePins: {}, failures: [] };
for (const file of ["package.json", "package-lock.json", "playwright.config.ts", "tests/browser/privacy-offline.spec.ts",
  "tests/browser/static-host-policy.spec.ts", "scripts/run-owned-privacy-offline.mjs", "worker/index.ts", "lib/static-host-request-policy.ts",
  "app/converter/ConverterApp.tsx", "lib/capability-registry.ts", ".openai/hosting.json"])
  report.sourcePins[file] = sha(await readFile(path.join(root, file)));
let runtime, server, runner, serverBirth, runnerBirth, serverLog = "", runnerLog = "", result;
const stop = async (child, identity) => {
  if (!child || child.exitCode !== null || child.signalCode !== null) return;
  assert.ok(identity, "Never kill an identity-unverified process");
  assert.deepEqual(await queryReliableProcessIdentity(child.pid), identity, "PID/parent/birth must still match our launch");
  await execute("taskkill.exe", ["/PID", String(child.pid), "/T", "/F"], { windowsHide: true, timeout: 15000, maxBuffer: 16384 });
};
try {
  report.executedHead = (await execute(process.env.WITHIN_GIT_EXECUTABLE ?? "git", ["rev-parse", "HEAD"],
    { cwd: root, windowsHide: true, timeout: 10000, maxBuffer: 16384 })).stdout.trim();
  assert.match(report.executedHead, /^[a-f0-9]{40}$/);
  report.hostMemory = await inspectStressHostMemory(); assert.equal(report.hostMemory.safeToStart, true);
  const disk = await statfs(root); assert.ok(disk.bavail * disk.bsize >= 512 * 1024 ** 2);
  report.protectedOriginalBefore = { bytes: (await stat(originalFile)).size, sha256: await hashFile(originalFile) };
  assert.equal(report.protectedOriginalBefore.bytes, 2958573265); assert.equal(report.protectedOriginalBefore.sha256, originalSha);
  await access(path.join(root, "dist/server/wrangler.json"));
  runtime = await createOwnedRuntimeScratch("privacy-validation-");
  const port = await new Promise((resolve, reject) => { const socket = createServer(); socket.once("error", reject);
    socket.listen(0, "127.0.0.1", () => { const port = socket.address().port; socket.close(error => error ? reject(error) : resolve(port)); }); });
  const origin = `http://127.0.0.1:${port}`, env = { ...runtime.env, WRANGLER_SEND_METRICS: "false",
    npm_config_cache: path.join(runtime.directory, "npm-cache"), WITHIN_TEST_PORT: String(port), WITHIN_TEST_BASE_URL: origin };
  server = spawn(process.execPath, ["node_modules/wrangler/bin/wrangler.js", "dev", "--config", "dist/server/wrangler.json",
    "--port", String(port), "--persist-to", path.join(runtime.directory, "wrangler")], { cwd: root, env, windowsHide: true, stdio: ["ignore", "pipe", "pipe"] });
  serverBirth = await queryReliableProcessIdentity(server.pid); assert.ok(serverBirth);
  for (const pipe of [server.stdout, server.stderr]) pipe.on("data", value => { serverLog = (serverLog + value.toString()).slice(-16384); });
  let ready = false;
  for (let attempt = 0; attempt < 60; attempt++) {
    assert.equal(server.exitCode, null, serverLog);
    try { if ((await fetch(origin)).ok) { ready = true; break; } } catch { /* bounded local startup */ }
    await new Promise(resolve => setTimeout(resolve, 500));
  }
  assert.ok(ready, serverLog || "Production server startup deadline");
  const resultFile = path.join(runtime.directory, "result.json"), configFile = path.join(runtime.directory, "playwright.config.mjs");
  await writeFile(configFile, `import base from ${JSON.stringify(pathToFileURL(path.join(root, "playwright.config.ts")).href)};
export default {...base, testDir:${JSON.stringify(path.join(root, "tests/browser"))},
testMatch:["**/privacy-offline.spec.ts","**/static-host-policy.spec.ts"],
outputDir:${JSON.stringify(path.join(runtime.directory, "artifacts"))},
reporter:[["line"],["json",{outputFile:${JSON.stringify(resultFile)}}]],
use:{...base.use,baseURL:${JSON.stringify(origin)},headless:true}, webServer:undefined};\n`, { flag: "wx" });
  runner = spawn(process.execPath, ["node_modules/@playwright/test/cli.js", "test", "--config", configFile],
    { cwd: root, env, windowsHide: true, stdio: ["ignore", "pipe", "pipe"] });
  for (const pipe of [runner.stdout, runner.stderr]) pipe.on("data", value => { runnerLog = (runnerLog + value.toString()).slice(-16384); });
  const completed = new Promise((resolve, reject) => { runner.once("error", reject); runner.once("exit", code => resolve(code)); });
  runnerBirth = await queryReliableProcessIdentity(runner.pid); assert.ok(runnerBirth);
  report.runnerExitCode = await completed;
  result = JSON.parse(await readFile(resultFile)); report.stats = result.stats;
  assert.equal(report.runnerExitCode, 0, runnerLog); assert.equal(result.stats.expected, 19);
  assert.equal(result.stats.unexpected, 0); assert.equal(result.stats.skipped, 0); assert.equal(result.stats.flaky, 0);
  report.status = "passed-complete-headless-privacy-offline-hosting-specs";
} catch (error) { report.failures.push(String(error.stack ?? error)); report.status = "failed"; process.exitCode = 1; }
finally {
  report.processBirths = { server: serverBirth ?? null, runner: runnerBirth ?? null };
  await finishOwnedCleanup([() => stop(runner, runnerBirth), () => stop(server, serverBirth)])
    .catch(error => { report.failures.push("Owned process cleanup: " + error); report.status = "failed"; process.exitCode = 1; });
  report.processCleanup = [];
  for (const identity of [serverBirth, runnerBirth].filter(Boolean)) report.processCleanup.push(await observeOwnedProcessExit(identity));
  report.serverLog = serverLog; report.runnerLog = runnerLog;
  try {
    assert.ok(report.processCleanup.every(row => row.status === "owned-identity-absent"));
    for (const child of [server, runner]) assert.ok(!child || child.exitCode !== null || child.signalCode !== null,
      "Do not delete a live owned process's scratch");
    if (runtime) {
      if (report.status === "failed") await cp(path.join(runtime.directory, "artifacts"),
        path.join(root, "output/playwright", `${stamp}-privacy-failure`), { recursive: true, errorOnExist: true, force: false })
        .catch(error => { if (error.code !== "ENOENT") throw error; });
      await runtime.close(); await assert.rejects(access(runtime.directory), { code: "ENOENT" });
    }
    report.ownedRuntimeRemoved = Boolean(runtime);
    for (const [file, digest] of Object.entries(report.sourcePins)) assert.equal(sha(await readFile(path.join(root, file))), digest);
  } catch (error) { report.failures.push("Scratch/source cleanup: " + error); report.status = "failed"; process.exitCode = 1; }
  try {
    report.protectedOriginalAfter = { bytes: (await stat(originalFile)).size, sha256: await hashFile(originalFile) };
    assert.equal(report.protectedOriginalAfter.bytes, 2958573265); assert.equal(report.protectedOriginalAfter.sha256, originalSha);
  } catch (error) { report.failures.push("Protected original: " + error); report.status = "failed"; process.exitCode = 1; }
  report.finishedAt = new Date().toISOString();
  const file = path.join(root, "evidence", `${stamp}-owned-privacy-offline.json`);
  await writeFile(file, JSON.stringify(report, null, 2) + "\n", { flag: "wx" });
  console.log(JSON.stringify({ path: path.relative(root, file), status: report.status, stats: report.stats ?? null, failures: report.failures }));
}
