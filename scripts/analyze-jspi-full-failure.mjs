// Independent audit of the stopped run. Never converts or retains output copies.
import "./lib/reliable-readonly-preflight.mjs";
import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { createReadStream } from "node:fs";
import { access, lstat, readFile, writeFile } from "node:fs/promises";
import { execFile } from "node:child_process";
import { promisify } from "node:util";
import path from "node:path";
import { gunzipSync } from "node:zlib";
import { sha, baselineBinding } from "./lib/stable-ui-headless-baseline-recipe.mjs";
import { inspectJspiFullFailure } from "./lib/jspi-full-failure-observation.mjs";
import { materializeUpdatedFullArchive } from "./lib/recorded-timeline-full-sources.mjs";
import { deriveJspiFullDriver, deriveJspiFullCaller, deriveJspiFullSupervisor } from "./lib/jspi-full-control.mjs";
import { deriveJspiBrowserStager } from "./lib/jspi-browser-adapter.mjs";
import { loadJspiFullQualification, assertJspiFullBuild } from "./lib/jspi-full-qualification.mjs";
import { sourceTimestampAt } from "./lib/qualified-source-timeline.mjs";
const root = path.resolve(import.meta.dirname, ".."), read = file => readFile(path.join(root, file));
process.env.WITHIN_DURATION_DRAIN_CONTROL_RECEIPT = "evidence/2026-10-15T10-37-24-961Z-duration-drain-browser-control-executed-sources.json";
const terminalPath = "evidence/2026-10-18T02-18-29-564Z-jspi-full-terminal.json", terminalBytes = await read(terminalPath), terminal = JSON.parse(terminalBytes);
const zipped = await read(terminal.report.path); assert.equal(zipped.length, terminal.report.bytes); assert.equal(sha(zipped), terminal.report.sha256);
const raw = gunzipSync(zipped, { maxOutputLength: 33554432 }); assert.equal(raw.length, terminal.report.restoredBytes); assert.equal(sha(raw), terminal.report.restoredSha256);
const report = JSON.parse(raw), analysis = inspectJspiFullFailure(terminal, report);
const sources = await materializeUpdatedFullArchive(root, terminal.sourceArchive);
assert.equal(Object.keys(sources.pins).length, 855); assert.deepEqual(sources.pins, terminal.sourcePins);
assert.deepEqual(sources.pins, terminal.postSourcePins); assert.deepEqual(sources.pins, report.sourceHashes);
for (const [file, digest] of Object.entries(sources.pins)) assert.equal(sha(await read(file)), digest, file);
const parent = JSON.parse(gunzipSync(await read("outputs/reports/2026-10-16T17-01-47-260Z-updated-chrome-full-sources.json.gz")));
assert.equal((await deriveJspiFullDriver(parent.driver, root, terminal.wrapper, path.basename(terminal.candidateDirectory), sources.extensionFiles, terminal.browserPinBefore)).generated, sources.driver);
assert.equal((await deriveJspiFullCaller((await read("scripts/run-updated-chrome-full.mjs")).toString(), root)).generated, sources.generatedCaller);
assert.equal(deriveJspiFullSupervisor((await read("scripts/launch-packet-largest-idle-supervisor.mjs")).toString(), root).generated, sources.supervisor);
const qualified = await loadJspiFullQualification(root), buildBytes = await read(terminal.build.path); assert.equal(sha(buildBytes), terminal.build.sha256);
assertJspiFullBuild(JSON.parse(buildBytes), qualified.build); assert.deepEqual(report.manifest, qualified.manifest);
const stage = JSON.parse(gunzipSync(await read("outputs/reports/2026-10-16T16-41-46-137Z-updated-chrome-media-sources.json.gz"))).recipe.generated;
assert.equal((await deriveJspiBrowserStager(stage.stage, stage.candidateName, path.basename(terminal.candidateDirectory))).generated, sources.stager);
const prefix = "outputs/reports/2026-10-18T02-19-20-746Z-private-mpeg2-updated-chrome-full-native-100ms";
const timestampBytes = await read(prefix + "-output-timestamps-1.json"), timestamps = JSON.parse(timestampBytes);
assert.equal(timestamps.status, "captured-independent-frame-probe"); assert.equal(timestamps.frames, 296160); assert.equal(timestamps.failure, null);
const timingZip = await read(timestamps.stdout.archive.path); assert.equal(sha(timingZip), timestamps.stdout.archive.sha256);
const timingRaw = gunzipSync(timingZip, { maxOutputLength: 33554432 }); assert.equal(sha(timingRaw), timestamps.stdout.sha256); assert.equal(timingRaw.length, timestamps.stdout.bytes);
const times = timingRaw.toString().split(/\r?\n/).filter(line => /^-?\d+(?:\.\d+)?(?:,|$)/.test(line)).map(line => Number(line.split(",")[0]));
assert.equal(times.length, 296160); let maximumTimestampErrorSeconds = 0;
for (const [index, value] of times.entries()) maximumTimestampErrorSeconds = Math.max(maximumTimestampErrorSeconds, Math.abs(value - sourceTimestampAt(index)));
assert.ok(maximumTimestampErrorSeconds <= 0.001);
const supervisorPath = "evidence/2026-10-18T02-17-46-714Z-jspi-full-supervisor-full.json", supervisorBytes = await read(supervisorPath), supervisor = JSON.parse(supervisorBytes);
assert.equal(supervisor.status, "command-failed-not-conversion-acceptance"); assert.equal(supervisor.runtimeRemoved, true);
const paths = [terminal.wrapper, terminal.candidateDirectory, terminal.callerRuntimeDirectory, report.runtimeDirectory, supervisor.runtimeDirectory];
for (const directory of paths) { assert.equal(path.dirname(directory), path.join(root, "work")); await assert.rejects(access(directory), { code: "ENOENT" }); }
const births = [...terminal.treeCleanupAudit.recordedBirths, supervisor.supervisorIdentity, supervisor.childIdentity];
const command = "ConvertTo-Json -InputObject @(Get-CimInstance Win32_Process | ForEach-Object {@{pid=[int]$_.ProcessId;createdAt=$_.CreationDate.ToUniversalTime().ToString('o');commandLine=$_.CommandLine}}) -Compress";
const { stdout } = await promisify(execFile)("powershell.exe", ["-NoProfile", "-NonInteractive", "-Command", command], { windowsHide: true, timeout: 15000, maxBuffer: 2097152 });
const current = JSON.parse(stdout);
for (const identity of births) assert.ok(!current.some(row => row.pid === identity.pid && Math.abs(Date.parse(row.createdAt) - Date.parse(identity.createdAt)) < 1));
for (const row of current) assert.ok(!paths.some(directory => row.commandLine?.toLowerCase().includes(directory.toLowerCase())));
assert.equal(sha(await read("dist/client" + baselineBinding.url)), baselineBinding.sha256); assert.deepEqual(terminal.browserPinBefore, terminal.browserPinAfter);
const original = path.join(root, "test.mkv"), originalStat = await lstat(original); assert.equal(originalStat.size, 2958573265);
const originalHash = createHash("sha256"); for await (const chunk of createReadStream(original, { highWaterMark: 1048576 })) originalHash.update(chunk);
const originalSha256 = originalHash.digest("hex"); assert.equal(originalSha256, terminal.protectedAfter.sha256);
const ownSources = {};
for (const file of ["scripts/analyze-jspi-full-failure.mjs", "scripts/lib/jspi-full-failure-observation.mjs", "tests/jspi-full-failure-observation.test.mjs"]) {
  const bytes = await read(file); ownSources[file] = { sha256: sha(bytes), preimage: bytes.toString("base64") };
}
const output = "evidence/2026-10-19-jspi-full-failure-analysis.json";
await writeFile(path.join(root, output), JSON.stringify({ recordedAt: new Date().toISOString(), analysis, ownSources,
  terminal: { path: terminalPath, sha256: sha(terminalBytes) }, report: terminal.report, sourceArchive: terminal.sourceArchive,
  all855ExecutedCurrentPostPinsEqual: true, exactDriverCallerStagerSupervisorReconstructed: true,
  exactQualifiedBuildAssetsAndNativeManifest: true, maximumTimestampErrorSeconds,
  every296160OutputTimestampReplayed: true, timestampReceipt: { path: prefix + "-output-timestamps-1.json", sha256: sha(timestampBytes) },
  supervisor: { path: supervisorPath, sha256: sha(supervisorBytes) }, ownedBirthsAbsent: births,
  scratchPathsAbsent: paths, original: { bytes: originalStat.size, sha256: originalSha256 }, normalDistRestored: true,
  originalSsimStderrNotRetained: true, originalSsimScoreUnknown: true, originalOutputHashNotReached: true,
  nextAction: "Qualify CR-aware SSIM record framing on real long-running native validation logs, retain raw validator stderr before assertion, then repeat full session without changing browser/codec/quality/memory gates.",
  publicAcceptance: false, fullOriginalAcceptance: false }, null, 2) + "\n", { flag: "wx" });
console.log(JSON.stringify({ output, ...analysis, maximumTimestampErrorSeconds, scratchDirectoriesAbsent: paths.length, originalSha256 }));
