// Reuse the unchanged production privacy specs with one explicitly selected installed browser.
import "./lib/hidden-unit-subprocesses.mjs";
import assert from "node:assert/strict";
import { execFile, spawn } from "node:child_process";
import { createHash } from "node:crypto";
import { createReadStream } from "node:fs";
import { readFile, stat, writeFile } from "node:fs/promises";
import path from "node:path";
import { promisify } from "node:util";
import { createOwnedRuntimeScratch } from "./lib/owned-runtime-scratch.mjs";

const targets = Object.freeze({
  edge: "C:\\Program Files (x86)\\Microsoft\\Edge\\Application\\msedge.exe",
  brave: "C:\\Program Files\\BraveSoftware\\Brave-Browser\\Application\\brave.exe",
  "opera-gx": "C:\\Users\\slato\\AppData\\Local\\Programs\\Opera GX\\opera.exe",
});
assert.equal(process.platform, "win32");
const id = process.argv[2];
assert.ok(process.argv.length === 3 && Object.hasOwn(targets, id), "Select edge, brave or opera-gx explicitly");
const root = path.resolve(import.meta.dirname, ".."), executable = targets[id];
const stamp = new Date().toISOString().replaceAll(/[:.]/g, "-");
const digest = async file => {
  const hash = createHash("sha256");
  for await (const chunk of createReadStream(file, { highWaterMark: 262144 })) hash.update(chunk);
  return hash.digest("hex");
};
const identity = async () => {
  const { stdout } = await promisify(execFile)("powershell.exe", ["-NoProfile", "-NonInteractive", "-Command",
    `$ErrorActionPreference='Stop'; (Get-Item -LiteralPath '${executable.replaceAll("'", "''")}').VersionInfo.ProductVersion`],
  { windowsHide: true, timeout: 15000, maxBuffer: 16384 });
  return { executable, version: stdout.trim(), bytes: (await stat(executable)).size, sha256: await digest(executable) };
};
const report = { schemaVersion: 1, browserId: id, startedAt: new Date().toISOString(), status: "running",
  scope: "Existing unchanged 19 production privacy/offline/hosting cases on one installed browser; not full compatibility or conversion-memory acceptance",
  headed: false, osNativePickerVerified: false, conversionMemoryAcceptance: false, publicPromotion: false,
  extraBrowserArguments: [], browserServicesDisabledByThisDriver: false, failures: [] };
let runtime, child, log = "";
try {
  report.browserBefore = await identity();
  report.driverSha256 = await digest(import.meta.filename);
  runtime = await createOwnedRuntimeScratch("installed-browser-privacy-");
  child = spawn(process.execPath, ["scripts/run-owned-privacy-offline.mjs"], {
    cwd: root, env: { ...runtime.env, WITHIN_CHROME_PATH: executable }, windowsHide: true,
    stdio: ["ignore", "pipe", "pipe"],
  });
  for (const pipe of [child.stdout, child.stderr]) pipe.on("data", value => { log = (log + value.toString()).slice(-65536); });
  report.runnerExitCode = await new Promise((resolve, reject) => {
    child.once("error", reject); child.once("exit", (code, signal) => { report.signal = signal; resolve(code); });
  });
  const lines = log.split(/\r?\n/).filter(line => line.startsWith('{"path":'));
  assert.equal(lines.length, 1, "Exactly one underlying production receipt is required");
  const summary = JSON.parse(lines[0]);
  assert.match(summary.path, /^evidence[\\/]\d{4}-\d{2}-\d{2}T[\w-]+-owned-privacy-offline\.json$/);
  const receiptFile = path.join(root, summary.path);
  report.productionReceipt = { path: summary.path.replaceAll("\\", "/"), sha256: await digest(receiptFile) };
  const actual = JSON.parse(await readFile(receiptFile, "utf8"));
  report.executedHead = actual.executedHead; report.stats = actual.stats;
  report.productionStatus = actual.status; report.productionFailures = actual.failures;
  report.ownedProductionRuntimeRemoved = actual.ownedRuntimeRemoved;
  report.processCleanup = actual.processCleanup;
  assert.equal(report.runnerExitCode, 0, log);
  assert.equal(actual.status, "passed-complete-headless-privacy-offline-hosting-specs");
  assert.equal(actual.stats.expected, 19); assert.equal(actual.stats.unexpected, 0);
  assert.equal(actual.stats.skipped, 0); assert.equal(actual.stats.flaky, 0);
  assert.equal(actual.ownedRuntimeRemoved, true);
  assert.ok(actual.processCleanup.length === 2 && actual.processCleanup.every(row => row.status === "owned-identity-absent"));
  assert.deepEqual(actual.protectedOriginalAfter, actual.protectedOriginalBefore);
  report.status = "passed-existing-19-headless-privacy-cases";
} catch (error) {
  report.status = "failed-not-acceptance"; report.failures.push(String(error.stack ?? error)); process.exitCode = 1;
} finally {
  try {
    // Never remove a live child's scratch or terminate any browser outside its existing owned wrapper.
    assert.ok(!child || child.pid === undefined || child.exitCode !== null || child.signalCode !== null);
    await runtime?.close(); report.ownedDriverRuntimeRemoved = Boolean(runtime);
    report.browserAfter = await identity(); assert.deepEqual(report.browserAfter, report.browserBefore);
    assert.equal(await digest(import.meta.filename), report.driverSha256);
  } catch (error) { report.status = "failed-not-acceptance"; report.failures.push(String(error.stack ?? error)); process.exitCode = 1; }
  report.finishedAt = new Date().toISOString();
  const file = path.join(root, "evidence", `${stamp}-${id}-installed-privacy.json`);
  await writeFile(file, JSON.stringify(report, null, 2) + "\n", { flag: "wx" });
  console.log(JSON.stringify({ path: path.relative(root, file), status: report.status, stats: report.stats, failures: report.failures }));
}
