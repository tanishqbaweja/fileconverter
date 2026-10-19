// Independent terminal audit; no conversion, no output retention, no promotion.
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
import { inspectThreeFullJspiRuns } from "./lib/jspi-three-full-observation.mjs";
import { materializeUpdatedFullArchive } from "./lib/recorded-timeline-full-sources.mjs";
import { deriveSsimJspiFullDriver, deriveSsimJspiFullCaller, deriveSsimJspiFullSupervisor, loadSsimFramingQualification } from "./lib/jspi-ssim-full-control.mjs";
import { deriveJspiBrowserStager } from "./lib/jspi-browser-adapter.mjs";
import { loadJspiFullQualification, assertJspiFullBuild } from "./lib/jspi-full-qualification.mjs";
import { inspectSsimSummary } from "./lib/cr-aware-ssim-summary.mjs";
import { sourceTimestampAt } from "./lib/qualified-source-timeline.mjs";
const root = path.resolve(import.meta.dirname, ".."), read = file => readFile(path.join(root, file));
process.env.WITHIN_DURATION_DRAIN_CONTROL_RECEIPT = "evidence/2026-10-15T10-37-24-961Z-duration-drain-browser-control-executed-sources.json";
const unpack = async record => {
  const zip = await read(record.path); assert.equal(zip.length, record.bytes); assert.equal(sha(zip), record.sha256);
  const raw = gunzipSync(zip, { maxOutputLength: 33554432 }); assert.equal(raw.length, record.restoredBytes); assert.equal(sha(raw), record.restoredSha256); return raw;
};
const terminalPath = "evidence/2026-10-18T23-55-28-649Z-jspi-ssim-full-terminal.json", terminalBytes = await read(terminalPath), terminal = JSON.parse(terminalBytes);
const report = JSON.parse(await unpack(terminal.report)), analysis = inspectThreeFullJspiRuns(terminal, report);
const sources = await materializeUpdatedFullArchive(root, terminal.sourceArchive);
assert.equal(Object.keys(sources.pins).length, 868); assert.deepEqual(sources.pins, terminal.sourcePins);
assert.deepEqual(sources.pins, terminal.postSourcePins); assert.deepEqual(sources.pins, report.sourceHashes);
for (const [file, digest] of Object.entries(sources.pins)) assert.equal(sha(await read(file)), digest, file);
const parent = JSON.parse(gunzipSync(await read("outputs/reports/2026-10-16T17-01-47-260Z-updated-chrome-full-sources.json.gz")));
assert.equal((await deriveSsimJspiFullDriver(parent.driver, root, terminal.wrapper, path.basename(terminal.candidateDirectory), sources.extensionFiles, terminal.browserPinBefore)).generated, sources.driver);
assert.equal((await deriveSsimJspiFullCaller((await read("scripts/run-updated-chrome-full.mjs")).toString(), root)).generated, sources.generatedCaller);
assert.equal(deriveSsimJspiFullSupervisor((await read("scripts/launch-packet-largest-idle-supervisor.mjs")).toString(), root).generated, sources.supervisor);
const qualified = await loadJspiFullQualification(root), framing = await loadSsimFramingQualification(root);
assert.deepEqual(framing.reference, terminal.ssimFramingQualification);
const buildBytes = await read(terminal.build.path); assert.equal(sha(buildBytes), terminal.build.sha256);
assertJspiFullBuild(JSON.parse(buildBytes), qualified.build); assert.deepEqual(report.manifest, qualified.manifest);
const stage = JSON.parse(gunzipSync(await read("outputs/reports/2026-10-16T16-41-46-137Z-updated-chrome-media-sources.json.gz"))).recipe.generated;
assert.equal((await deriveJspiBrowserStager(stage.stage, stage.candidateName, path.basename(terminal.candidateDirectory))).generated, sources.stager);
const replayed = [], prefix = "outputs/reports/2026-10-18T23-56-42-355Z-private-mpeg2-updated-chrome-full-native-100ms";
for (const [index, run] of report.runs.entries()) {
  const checkpoint = JSON.parse(await unpack(report.progressProbe.jspiFullValidatedRuns[index]));
  assert.equal(checkpoint.number, index + 1); assert.deepEqual(checkpoint.run, run);
  assert.deepEqual(checkpoint.sourceHashes, sources.pins); assert.deepEqual(checkpoint.blankBaseline, report.blankBaseline);
  assert.equal(checkpoint.originalValidationOutputDeletionAndRecoveryCompleted, true); assert.equal(checkpoint.publicAcceptance, false);
  const diagnostic = run.independentSsimDiagnostic, stderr = (await unpack(diagnostic.archive)).toString();
  const scalar = inspectSsimSummary(stderr);
  for (const [field, value] of Object.entries(scalar)) assert.deepEqual(diagnostic[field], value);
  assert.equal(scalar.score, run.independentValidation.ssim); assert.ok(scalar.score >= 0.98);
  const timingPath = prefix + `-output-timestamps-${index + 1}.json`, timingBytes = await read(timingPath), timing = JSON.parse(timingBytes);
  assert.equal(timing.status, "captured-independent-frame-probe"); assert.equal(timing.frames, 296160); assert.equal(timing.failure, null);
  const zip = await read(timing.stdout.archive.path); assert.equal(sha(zip), timing.stdout.archive.sha256); assert.equal(zip.length, timing.stdout.archive.bytes);
  const raw = gunzipSync(zip, { maxOutputLength: 33554432 }); assert.equal(sha(raw), timing.stdout.sha256); assert.equal(raw.length, timing.stdout.bytes);
  const times = raw.toString().split(/\r?\n/).filter(line => /^-?\d+(?:\.\d+)?(?:,|$)/.test(line)).map(line => Number(line.split(",")[0]));
  assert.equal(times.length, 296160); let maximumTimestampErrorSeconds = 0;
  for (const [frame, value] of times.entries()) maximumTimestampErrorSeconds = Math.max(maximumTimestampErrorSeconds, Math.abs(value - sourceTimestampAt(frame)));
  assert.equal(maximumTimestampErrorSeconds, run.independentValidation.maximumTimestampErrorSeconds);
  replayed.push({ number: index + 1, frames: times.length, maximumTimestampErrorSeconds,
    rawSsimArchiveReplayed: diagnostic.archive, checkpoint: report.progressProbe.jspiFullValidatedRuns[index],
    timestampReceipt: { path: timingPath, sha256: sha(timingBytes) }, ssim: scalar.score });
}
const supervisorPath = "evidence/2026-10-18T23-54-47-907Z-jspi-ssim-full-supervisor-full.json", supervisorBytes = await read(supervisorPath), supervisor = JSON.parse(supervisorBytes);
assert.equal(supervisor.status, "command-completed-not-conversion-acceptance"); assert.equal(supervisor.runtimeRemoved, true);
const paths = [terminal.wrapper, terminal.candidateDirectory, terminal.callerRuntimeDirectory, report.runtimeDirectory, supervisor.runtimeDirectory];
for (const directory of paths) { assert.equal(path.dirname(directory), path.join(root, "work")); await assert.rejects(access(directory), { code: "ENOENT" }); }
const births = [...terminal.treeCleanupAudit.recordedBirths, supervisor.supervisorIdentity, supervisor.childIdentity];
const command = "ConvertTo-Json -InputObject @(Get-CimInstance Win32_Process | ForEach-Object {@{pid=[int]$_.ProcessId;createdAt=$_.CreationDate.ToUniversalTime().ToString('o');commandLine=$_.CommandLine}}) -Compress";
const { stdout } = await promisify(execFile)("powershell.exe", ["-NoProfile", "-NonInteractive", "-Command", command], { windowsHide: true, timeout: 15000, maxBuffer: 2097152 });
const current = JSON.parse(stdout);
for (const identity of births) assert.ok(!current.some(row => row.pid === identity.pid && Math.abs(Date.parse(row.createdAt) - Date.parse(identity.createdAt)) < 1));
for (const row of current) assert.ok(!paths.some(directory => row.commandLine?.toLowerCase().includes(directory.toLowerCase())));
assert.equal(sha(await read("dist/client" + baselineBinding.url)), baselineBinding.sha256);
assert.equal(sha(await read("dist/client/assets/index-CIzbeB0A.css")), "f78f673c089ceb0dcfd1a885ff03e2a43984d851cfbe1d915e9a773a45c747dd");
assert.deepEqual(terminal.browserPinBefore, terminal.browserPinAfter);
const original = path.join(root, "test.mkv"), originalStat = await lstat(original); assert.equal(originalStat.size, 2958573265);
const originalHash = createHash("sha256"); for await (const chunk of createReadStream(original, { highWaterMark: 1048576 })) originalHash.update(chunk);
const originalSha256 = originalHash.digest("hex"); assert.equal(originalSha256, terminal.protectedAfter.sha256); assert.equal(originalSha256, terminal.protectedBefore.sha256);
const ownSources = {};
for (const file of ["scripts/analyze-jspi-three-full.mjs", "scripts/lib/jspi-three-full-observation.mjs", "tests/jspi-three-full-observation.test.mjs"]) {
  const bytes = await read(file); ownSources[file] = { sha256: sha(bytes), preimage: bytes.toString("base64") };
}
const output = "evidence/2026-10-19-jspi-three-full-independent-analysis.json";
await writeFile(path.join(root, output), JSON.stringify({ recordedAt: new Date().toISOString(), analysis, ownSources,
  terminal: { path: terminalPath, sha256: sha(terminalBytes) }, report: terminal.report, sourceArchive: terminal.sourceArchive,
  all868ExecutedCurrentPostPinsEqual: true, exactDriverCallerStagerSupervisorReconstructed: true,
  exactQualifiedBuildAssetsAndNativeManifest: true, allThreeRawSsimArchivesCheckpointsAnd296160FrameTimelinesReplayed: replayed,
  unavailableCimSamplesInRetainedRing: report.samples.filter(row => row.privateBytes == null).length,
  supervisor: { path: supervisorPath, sha256: sha(supervisorBytes) }, ownedBirthsAbsent: births, scratchPathsAbsent: paths,
  original: { bytes: originalStat.size, sha256: originalSha256 }, normalDistRestored: true,
  cleanupRecoveryDriftNotConcealed: true, zeroRetainedGrowthProven: false,
  nextAction: "Three same-session full outputs passed. Investigate bounded retained cleanup drift and repeat cold session/scaling before public promotion; perform paired performance comparison before any speed or fastest claim. Entire goal remains incomplete.",
  fullProjectAcceptance: false, publicAcceptance: false }, null, 2) + "\n", { flag: "wx" });
console.log(JSON.stringify({ output, ...analysis, originalSha256, scratchPathsAbsent: paths.length }));
