import "./lib/reliable-readonly-preflight.mjs";
import assert from "node:assert/strict";
import { execFile } from "node:child_process";
import { createHash } from "node:crypto";
import { createReadStream } from "node:fs";
import { access, lstat, readFile, rm, writeFile } from "node:fs/promises";
import path from "node:path";
import { promisify } from "node:util";
import { gzipSync, gunzipSync } from "node:zlib";
import { sha, baselineBinding } from "./lib/stable-ui-headless-baseline-recipe.mjs";
import { materializeUpdatedFullArchive } from "./lib/recorded-timeline-full-sources.mjs";
import { makeMemoizedHandoffApp } from "./lib/memoized-handoff-candidate.mjs";
import { inspectMemoizedHandoffCandidate } from "./lib/memoized-handoff-observation.mjs";
const root = path.resolve(import.meta.dirname, ".."), read = file => readFile(path.join(root, file));
const unpack = async record => {
  const zip = await read(record.path); assert.equal(zip.length, record.bytes); assert.equal(sha(zip), record.sha256);
  const raw = gunzipSync(zip, { maxOutputLength: 33554432 });
  assert.equal(raw.length, record.restoredBytes); assert.equal(sha(raw), record.restoredSha256); return raw;
};
const terminalPath = "evidence/2026-10-17T03-35-55-302Z-memoized-handoff-control-terminal.json";
const terminalBytes = await read(terminalPath), terminal = JSON.parse(terminalBytes);
const baselinePath = "evidence/2026-10-17T03-13-05-207Z-save-handoff-control-terminal.json", baselineBytes = await read(baselinePath), baseline = JSON.parse(baselineBytes);
const report = JSON.parse(await unpack(terminal.report)), baselineReport = JSON.parse(await unpack(baseline.report));
const buildBytes = await read(terminal.build.path); assert.equal(sha(buildBytes), terminal.build.sha256);
const baselineBuildBytes = await read(baseline.build.path); assert.equal(sha(baselineBuildBytes), baseline.build.sha256);
const build = JSON.parse(buildBytes), baselineBuild = JSON.parse(baselineBuildBytes);
const analysis = inspectMemoizedHandoffCandidate(terminal, report, build, baselineReport, baselineBuild);
const source = await materializeUpdatedFullArchive(root, terminal.sourceArchive);
assert.equal(Object.keys(source.pins).length, 779); assert.deepEqual(source.pins, terminal.sourcePins);
assert.deepEqual(terminal.sourcePins, terminal.postSourcePins); assert.deepEqual(report.sourceHashes, source.pins);
const buildSource = JSON.parse(await unpack(build.sourceArchive));
assert.deepEqual(build.sourcePins, build.postSourcePins); assert.deepEqual(buildSource.sourcePins, build.sourcePins);
for (const [file, digest] of Object.entries(build.sourcePins)) {
  assert.equal(sha(Buffer.from(buildSource.preimages[file], "base64")), digest);
  assert.equal(sha(await read(file)), digest);
}
const reconstructedApp = makeMemoizedHandoffApp((await read("app/converter/ConverterApp.tsx")).toString());
assert.deepEqual(reconstructedApp, buildSource.appRecipe);
for (const asset of [...build.assets, build.stylesheet]) {
  const actual = await unpack(asset.archive); assert.equal(actual.length, asset.bytes); assert.equal(sha(actual), asset.sha256);
}
const fixtureModule = report.progressProbe.successfulSaveControl.provenance;
assert.equal(sha(await unpack(fixtureModule.archive)), fixtureModule.generatedJavascriptSha256);
const rawTrace = report.rendererAttributionResult.sessions[0].trace.trace;
const tracePath = path.relative(root, rawTrace.rawArchive.path).replaceAll(path.sep, "/");
assert.ok(tracePath.startsWith("outputs/reports/") && !tracePath.includes(".."));
const traceZip = await read(tracePath); assert.equal(sha(traceZip), rawTrace.rawArchive.sha256);
const traceBytes = gunzipSync(traceZip, { maxOutputLength: 16777216 });
assert.equal(traceBytes.length, rawTrace.serializedBytes); assert.equal(sha(traceBytes), rawTrace.sha256);
for (const directory of [terminal.wrapper, terminal.candidateDirectory, terminal.callerRuntimeDirectory,
  report.runtimeDirectory, report.cleanup.completedSaveFixture.fixtureDirectory]) await assert.rejects(access(directory), { code: "ENOENT" });
const command = "ConvertTo-Json -InputObject @(Get-CimInstance Win32_Process | ForEach-Object {@{pid=[int]$_.ProcessId;createdAt=$_.CreationDate.ToUniversalTime().ToString('o')}}) -Compress";
const { stdout } = await promisify(execFile)("powershell.exe", ["-NoProfile", "-NonInteractive", "-Command", command], { windowsHide: true, timeout: 15000, maxBuffer: 1048576 });
const current = JSON.parse(stdout), births = terminal.treeCleanupAudit.recordedBirths.map(identity => {
  const live = current.find(row => row.pid === identity.pid);
  assert.ok(!live || Math.abs(Date.parse(live.createdAt) - Date.parse(identity.createdAt)) > 1);
  return { identity, status: live ? "owned-birth-absent-reused-pid-no-action" : "owned-birth-absent" };
});
assert.equal(sha(await read("dist/client" + baselineBinding.url)), baselineBinding.sha256);
assert.equal(sha(await read("dist/client/assets/index-CIzbeB0A.css")), "f78f673c089ceb0dcfd1a885ff03e2a43984d851cfbe1d915e9a773a45c747dd");
const original = path.join(root, "test.mkv"), originalStat = await lstat(original);
assert.equal(originalStat.size, 2958573265); assert.ok(originalStat.isFile() && !originalStat.isSymbolicLink());
const hash = createHash("sha256"); for await (const chunk of createReadStream(original, { highWaterMark: 1048576 })) hash.update(chunk);
const originalSha256 = hash.digest("hex"); assert.equal(originalSha256, report.source.sha256);
const checkpoint = report.nativeMemory.durableCheckpoint.file;
assert.equal(path.dirname(checkpoint), path.join(root, "outputs/reports"));
const checkpointBytes = await readFile(checkpoint), compressed = gzipSync(checkpointBytes, { level: 9 });
assert.deepEqual(JSON.parse(checkpointBytes).native.identities, report.nativeMemory.identities);
await writeFile(checkpoint + ".gz", compressed, { flag: "wx" });
assert.deepEqual(gunzipSync(await readFile(checkpoint + ".gz")), checkpointBytes); await rm(checkpoint);
const ownSources = {};
for (const file of ["scripts/analyze-memoized-handoff.mjs", "scripts/lib/memoized-handoff-observation.mjs", "tests/memoized-handoff-observation.test.mjs"]) {
  const bytes = await read(file); ownSources[file] = { sha256: sha(bytes), preimage: bytes.toString("base64") };
}
const result = { recordedAt: new Date().toISOString(), analysis, ownSources,
  terminal: { path: terminalPath, sha256: sha(terminalBytes) }, baseline: { path: baselinePath, sha256: sha(baselineBytes) },
  sourceArchive: terminal.sourceArchive, all779ExecutedCurrentPostPinsEqual: true, report: terminal.report, build: terminal.build,
  compiledAppOverlayReconstructedExactly: true, births, original: { bytes: originalStat.size, sha256: originalSha256 },
  checkpoint: { path: path.relative(root, checkpoint + ".gz").replaceAll(path.sep, "/"), bytes: compressed.length, sha256: sha(compressed),
    restoredBytes: checkpointBytes.length, restoredSha256: sha(checkpointBytes), redundantRawRemoved: true },
  trace: { path: tracePath, bytes: traceZip.length, sha256: sha(traceZip), capturedAfterProductionCancellation: true },
  nextAction: "Reject display-tree reuse as the current memory fix. Use bounded warm-start reproducer to instrument/native-module lifetime and evaluate a strictly bounded compiled-code reuse candidate; do not infer allocation cause or run unchanged full original stress.",
  publicAcceptance: false, fullOriginalAcceptance: false };
const output = "evidence/2026-10-17-memoized-handoff-independent-analysis.json";
await writeFile(path.join(root, output), JSON.stringify(result, null, 2) + "\n", { flag: "wx" });
console.log(JSON.stringify({ output, rejectedPeakMiB: analysis.candidateOriginalBreachMiB, birthsChecked: births.length, originalSha256 }));
