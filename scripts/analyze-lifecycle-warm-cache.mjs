import "./lib/reliable-readonly-preflight.mjs";
import assert from "node:assert/strict";
import { execFile } from "node:child_process";
import { createHash } from "node:crypto";
import { createReadStream } from "node:fs";
import { access, lstat, readFile, rm, writeFile } from "node:fs/promises";
import path from "node:path";
import { promisify } from "node:util";
import { gzipSync, gunzipSync } from "node:zlib";
import { transform, version as esbuildVersion } from "esbuild";
import { sha, baselineBinding } from "./lib/stable-ui-headless-baseline-recipe.mjs";
import { materializeUpdatedFullArchive } from "./lib/recorded-timeline-full-sources.mjs";
import { makeCompiledCacheApp, makeCompiledCacheWorker } from "./lib/compiled-cache-candidate.mjs";
import { deriveLifecycleWarmModule } from "./lib/lifecycle-warm-cache.mjs";
import { summarizeLifecycleTrace } from "./lib/lifecycle-allocation-attribution.mjs";
import { inspectLifecycleDiagnostic } from "./lib/lifecycle-allocation-observation.mjs";
const root = path.resolve(import.meta.dirname, ".."), read = file => readFile(path.join(root, file));
const unpack = async record => {
  const zip = await read(record.path); assert.equal(zip.length, record.bytes); assert.equal(sha(zip), record.sha256);
  const raw = gunzipSync(zip, { maxOutputLength: 33554432 });
  assert.equal(raw.length, record.restoredBytes); assert.equal(sha(raw), record.restoredSha256); return raw;
};
const terminalPath = "evidence/2026-10-17T04-35-52-913Z-lifecycle-warm-control-terminal.json";
const terminalBytes = await read(terminalPath), terminal = JSON.parse(terminalBytes);
const report = JSON.parse(await unpack(terminal.report)), analysis = inspectLifecycleDiagnostic(terminal, report);
const buildBytes = await read(terminal.build.path); assert.equal(sha(buildBytes), terminal.build.sha256);
const build = JSON.parse(buildBytes), buildSource = JSON.parse(await unpack(build.sourceArchive));
assert.deepEqual(build.sourcePins, build.postSourcePins); assert.deepEqual(buildSource.sourcePins, build.sourcePins);
for (const [file, digest] of Object.entries(build.sourcePins)) {
  assert.equal(sha(Buffer.from(buildSource.preimages[file], "base64")), digest); assert.equal(sha(await read(file)), digest);
}
assert.deepEqual(makeCompiledCacheApp((await read("app/converter/ConverterApp.tsx")).toString()), buildSource.appRecipe);
assert.deepEqual(makeCompiledCacheWorker((await read("workers/conversion.worker.ts")).toString()), buildSource.workerRecipe);
for (const asset of [...build.assets, build.stylesheet]) {
  const bytes = await unpack(asset.archive); assert.equal(bytes.length, asset.bytes); assert.equal(sha(bytes), asset.sha256);
}
const source = await materializeUpdatedFullArchive(root, terminal.sourceArchive);
assert.equal(Object.keys(source.pins).length, 789); assert.deepEqual(source.pins, terminal.sourcePins);
assert.deepEqual(source.pins, terminal.postSourcePins); assert.deepEqual(report.sourceHashes, source.pins);
for (const [file, digest] of Object.entries(source.pins)) assert.equal(sha(await read(file)), digest, file);
const provenance = report.progressProbe.successfulSaveControl.provenance;
const specArchive = JSON.parse(gunzipSync(await read("outputs/reports/2026-10-16T16-41-46-137Z-updated-chrome-media-sources.json.gz")));
const recipe = deriveLifecycleWarmModule(specArchive.recipe.generated.spec, root);
assert.equal(sha(recipe.generated), provenance.generatedTypescriptSha256); assert.equal(esbuildVersion, provenance.esbuildVersion);
const regenerated = (await transform(recipe.generated, { loader: "ts", format: "esm", target: "es2022" })).code;
assert.equal(sha(regenerated), provenance.generatedJavascriptSha256); assert.equal(sha(await unpack(provenance.archive)), sha(regenerated));
for (const row of report.progressProbe.lifecycleAttribution.checkpoints) {
  const actual = JSON.parse(await unpack(row.rawArchive));
  assert.deepEqual(summarizeLifecycleTrace(actual, { success: true, dumpGuid: row.summary.guid }, row.processes), row.summary);
}
const failureTrace = report.rendererAttributionResult.sessions[0].trace.trace;
assert.equal(path.dirname(failureTrace.rawArchive.path), path.join(root, "outputs/reports"));
const failureZip = await readFile(failureTrace.rawArchive.path); assert.equal(sha(failureZip), failureTrace.rawArchive.sha256);
const failureRaw = gunzipSync(failureZip, { maxOutputLength: 16777216 });
assert.equal(failureRaw.length, failureTrace.serializedBytes); assert.equal(sha(failureRaw), failureTrace.sha256);
const disposablePaths = [terminal.wrapper, terminal.candidateDirectory, terminal.callerRuntimeDirectory,
  report.runtimeDirectory, report.cleanup.completedSaveFixture.fixtureDirectory];
for (const directory of disposablePaths) {
  assert.ok(path.resolve(directory).startsWith(path.join(root, "work") + path.sep));
  await assert.rejects(access(directory), { code: "ENOENT" });
}
const command = "ConvertTo-Json -InputObject @(Get-CimInstance Win32_Process | ForEach-Object {@{pid=[int]$_.ProcessId;createdAt=$_.CreationDate.ToUniversalTime().ToString('o');commandLine=$_.CommandLine}}) -Compress";
const { stdout } = await promisify(execFile)("powershell.exe", ["-NoProfile", "-NonInteractive", "-Command", command], { windowsHide: true, timeout: 15000, maxBuffer: 2097152 });
const current = JSON.parse(stdout), births = terminal.treeCleanupAudit.recordedBirths.map(identity => {
  const live = current.find(row => row.pid === identity.pid);
  assert.ok(!live || Math.abs(Date.parse(live.createdAt) - Date.parse(identity.createdAt)) > 1);
  return { identity, status: live ? "owned-birth-absent-reused-pid-no-action" : "owned-birth-absent" };
});
for (const row of current) assert.ok(!disposablePaths.some(directory => row.commandLine?.toLowerCase().includes(directory.toLowerCase())));
assert.equal(sha(await read("dist/client" + baselineBinding.url)), baselineBinding.sha256);
assert.equal(sha(await read("dist/client/assets/index-CIzbeB0A.css")), "f78f673c089ceb0dcfd1a885ff03e2a43984d851cfbe1d915e9a773a45c747dd");
const original = path.join(root, "test.mkv"), originalStat = await lstat(original);
assert.equal(originalStat.size, 2958573265); assert.ok(originalStat.isFile() && !originalStat.isSymbolicLink());
const hash = createHash("sha256"); for await (const chunk of createReadStream(original, { highWaterMark: 1048576 })) hash.update(chunk);
const originalSha256 = hash.digest("hex"); assert.equal(originalSha256, report.source.sha256);
const checkpoint = report.nativeMemory.durableCheckpoint.file; assert.equal(path.dirname(checkpoint), path.join(root, "outputs/reports"));
const checkpointBytes = await readFile(checkpoint), compressed = gzipSync(checkpointBytes, { level: 9 });
assert.deepEqual(JSON.parse(checkpointBytes).native.identities, report.nativeMemory.identities);
await writeFile(checkpoint + ".gz", compressed, { flag: "wx" });
assert.deepEqual(gunzipSync(await readFile(checkpoint + ".gz")), checkpointBytes); await rm(checkpoint);
const ownSources = {};
for (const file of ["scripts/analyze-lifecycle-warm-cache.mjs", "scripts/lib/lifecycle-allocation-observation.mjs", "tests/lifecycle-allocation-observation.test.mjs"]) {
  const bytes = await read(file); ownSources[file] = { sha256: sha(bytes), preimage: bytes.toString("base64") };
}
const result = { recordedAt: new Date().toISOString(), analysis, ownSources,
  terminal: { path: terminalPath, sha256: sha(terminalBytes) }, sourceArchive: terminal.sourceArchive,
  all789ExecutedCurrentPostPinsEqual: true, report: terminal.report, build: terminal.build,
  compiledAppAndWorkerOverlaysReconstructedExactly: true, actualValidationModuleReconstructedExactly: true,
  allFiveClosedGuidDumpsReplayedExactly: true, splitProvidersMergedWithoutSumming: true,
  births, disposablePathsAbsent: disposablePaths, original: { bytes: originalStat.size, sha256: originalSha256 },
  checkpoint: { path: path.relative(root, checkpoint + ".gz").replaceAll(path.sep, "/"), bytes: compressed.length, sha256: sha(compressed),
    restoredBytes: checkpointBytes.length, restoredSha256: sha(checkpointBytes), redundantRawRemoved: true },
  nextAction: "Audit error-status rendering/repaint and compositing retention before a measured private rendering fix; five idle snapshots do not support monotonic retained worker heap growth, but cannot identify the active peak callsite. Preserve video/codec/quality/all-process budget and worst-case visible UI coverage. No repeated unchanged full stress or forced GC.",
  publicAcceptance: false, fullOriginalAcceptance: false };
const output = "evidence/2026-10-17-lifecycle-warm-independent-analysis.json";
await writeFile(path.join(root, output), JSON.stringify(result, null, 2) + "\n", { flag: "wx" });
console.log(JSON.stringify({ output, checkpoints: analysis.points.length, instrumentedPeakMiB: analysis.instrumentedIncrementalPrivateMiB,
  birthsChecked: births.length, originalSha256 }));
