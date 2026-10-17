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
import { makeBoundedCatalogueApp } from "./lib/bounded-catalogue-candidate.mjs";
import { makeCompiledCacheWorker } from "./lib/compiled-cache-candidate.mjs";
import { summarizeLifecycleTrace } from "./lib/lifecycle-allocation-attribution.mjs";
import { traceHexBytes } from "./lib/memory-infra-attribution.mjs";
import { inspectCatalogueNavigation } from "./lib/catalogue-navigation-observation.mjs";
const root = path.resolve(import.meta.dirname, ".."), read = file => readFile(path.join(root, file));
const unpack = async record => { const zip = await read(record.path); assert.equal(zip.length, record.bytes); assert.equal(sha(zip), record.sha256);
  const raw = gunzipSync(zip, { maxOutputLength: 33554432 }); assert.equal(raw.length, record.restoredBytes); assert.equal(sha(raw), record.restoredSha256); return raw; };
const terminalPath = "evidence/2026-10-17T17-52-52-402Z-catalogue-navigation-control-terminal.json";
const terminalBytes = await read(terminalPath), terminal = JSON.parse(terminalBytes);
const report = JSON.parse(await unpack(terminal.report)), analysis = inspectCatalogueNavigation(terminal, report);
const source = await materializeUpdatedFullArchive(root, terminal.sourceArchive);
assert.equal(Object.keys(source.pins).length, 808); assert.deepEqual(source.pins, terminal.sourcePins); assert.deepEqual(source.pins, terminal.postSourcePins);
assert.deepEqual(source.pins, report.sourceHashes); for (const [file, digest] of Object.entries(source.pins)) assert.equal(sha(await read(file)), digest, file);
const buildBytes = await read(terminal.build.path); assert.equal(sha(buildBytes), terminal.build.sha256);
const build = JSON.parse(buildBytes), buildSource = JSON.parse(await unpack(build.sourceArchive));
assert.deepEqual(build.sourcePins, build.postSourcePins); assert.deepEqual(buildSource.sourcePins, build.sourcePins);
for (const [file, digest] of Object.entries(build.sourcePins)) { assert.equal(sha(Buffer.from(buildSource.preimages[file], "base64")), digest); assert.equal(sha(await read(file)), digest); }
assert.deepEqual(makeBoundedCatalogueApp((await read("app/converter/ConverterApp.tsx")).toString()), buildSource.appRecipe);
assert.deepEqual(makeCompiledCacheWorker((await read("workers/conversion.worker.ts")).toString()), buildSource.workerRecipe);
for (const asset of [...build.assets, build.stylesheet]) { const bytes = await unpack(asset.archive); assert.equal(bytes.length, asset.bytes); assert.equal(sha(bytes), asset.sha256); }
assert.equal(build.assets.find(row => row.role === "application").sha256, "6b4b7d60faad1b9051b05acefdbb7a6ea2933646e13a79d1986c3b71f19166e7");
const tileEvidence = [];
for (const [index, row] of report.progressProbe.catalogueAttribution.checkpoints.entries()) {
  const trace = JSON.parse(await unpack(row.rawArchive));
  assert.deepEqual(summarizeLifecycleTrace(trace, { success: true, dumpGuid: row.summary.guid }, row.processes), row.summary);
  const point = analysis.points[index], [begin, end] = row.summary.traceIntervalMicroseconds;
  const allocators = pid => Object.fromEntries(trace.traceEvents.filter(event => event.pid === pid && event.ph === "v" && event.ts >= begin && event.ts <= end && event.args?.dumps)
    .flatMap(event => Object.entries(event.args.dumps.allocators ?? {})));
  const page = allocators(point.rendererIdentity.pid), gpu = allocators(point.gpuIdentity.pid);
  const value = (object, key) => traceHexBytes(object[key]?.attrs?.size?.value);
  const rendererTileMemoryBytes = value(page, "cc/tile_memory"), gpuSharedImagesBytes = value(gpu, "gpu/shared_images");
  assert.ok(rendererTileMemoryBytes != null && gpuSharedImagesBytes != null);
  tileEvidence.push({ phase: row.phase, rendererIdentity: point.rendererIdentity, gpuIdentity: point.gpuIdentity,
    rendererTileMemoryBytes, gpuSharedImagesBytes, summedTotal: null, overlappingResourcesNotSummed: true });
}
const disposablePaths = [terminal.wrapper, terminal.candidateDirectory, terminal.callerRuntimeDirectory, report.runtimeDirectory];
for (const directory of disposablePaths) { assert.ok(directory.startsWith(path.join(root, "work") + path.sep)); await assert.rejects(access(directory), { code: "ENOENT" }); }
const command = "ConvertTo-Json -InputObject @(Get-CimInstance Win32_Process | ForEach-Object {@{pid=[int]$_.ProcessId;createdAt=$_.CreationDate.ToUniversalTime().ToString('o');commandLine=$_.CommandLine}}) -Compress";
const { stdout } = await promisify(execFile)("powershell.exe", ["-NoProfile", "-NonInteractive", "-Command", command], { windowsHide: true, timeout: 15000, maxBuffer: 2097152 });
const current = JSON.parse(stdout), births = terminal.treeCleanupAudit.recordedBirths.map(identity => { const live = current.find(row => row.pid === identity.pid);
  assert.ok(!live || Math.abs(Date.parse(live.createdAt) - Date.parse(identity.createdAt)) > 1); return { identity, status: live ? "owned-birth-absent-reused-pid-no-action" : "owned-birth-absent" }; });
for (const row of current) assert.ok(!disposablePaths.some(directory => row.commandLine?.toLowerCase().includes(directory.toLowerCase())));
assert.equal(sha(await read("dist/client" + baselineBinding.url)), baselineBinding.sha256);
assert.equal(sha(await read("dist/client/assets/index-CIzbeB0A.css")), "f78f673c089ceb0dcfd1a885ff03e2a43984d851cfbe1d915e9a773a45c747dd");
const original = path.join(root, "test.mkv"), originalStat = await lstat(original); assert.equal(originalStat.size, 2958573265); assert.ok(originalStat.isFile() && !originalStat.isSymbolicLink());
const hash = createHash("sha256"); for await (const chunk of createReadStream(original, { highWaterMark: 1048576 })) hash.update(chunk);
const originalSha256 = hash.digest("hex"); assert.equal(originalSha256, report.source.sha256);
const checkpoint = report.nativeMemory.durableCheckpoint.file; assert.equal(path.dirname(checkpoint), path.join(root, "outputs/reports"));
const checkpointBytes = await readFile(checkpoint), compressed = gzipSync(checkpointBytes, { level: 9 });
assert.deepEqual(JSON.parse(checkpointBytes).native.identities, report.nativeMemory.identities);
await writeFile(checkpoint + ".gz", compressed, { flag: "wx" }); assert.deepEqual(gunzipSync(await readFile(checkpoint + ".gz")), checkpointBytes); await rm(checkpoint);
const ownSources = {}; for (const file of ["scripts/analyze-catalogue-navigation.mjs", "scripts/lib/catalogue-navigation-observation.mjs", "tests/catalogue-navigation-observation.test.mjs"]) {
  const bytes = await read(file); ownSources[file] = { sha256: sha(bytes), preimage: bytes.toString("base64") };
}
const result = { recordedAt: new Date().toISOString(), analysis, tileEvidence, ownSources,
  terminal: { path: terminalPath, sha256: sha(terminalBytes) }, sourceArchive: terminal.sourceArchive, all808ExecutedCurrentPostPinsEqual: true,
  report: terminal.report, build: terminal.build, allFiveClosedGuidDumpsReplayedExactly: true, splitProvidersMergedWithoutSumming: true,
  compiledAppAndWorkerOverlaysReconstructedExactly: true, births, disposablePathsAbsent: disposablePaths,
  original: { bytes: originalStat.size, sha256: originalSha256 }, checkpoint: { path: path.relative(root, checkpoint + ".gz").replaceAll(path.sep, "/"), bytes: compressed.length, sha256: sha(compressed), restoredBytes: checkpointBytes.length, restoredSha256: sha(checkpointBytes), rawRemoved: true },
  nextAction: "Observed transient cc/tile_memory and GPU shared_images expand on navigation and shrink on idle. Test a narrowly scoped scroll-animation candidate in a within-session default/auto/default UI comparison before conversion qualification. Do not claim the earlier conversion peak callsite is proved, force GC, omit processes or change codec/media fidelity.", publicAcceptance: false, fullOriginalAcceptance: false };
const output = "evidence/2026-10-17-catalogue-navigation-independent-analysis.json";
await writeFile(path.join(root, output), JSON.stringify(result, null, 2) + "\n", { flag: "wx" });
console.log(JSON.stringify({ output, checkpoints: analysis.points.length, tileBytes: tileEvidence.map(row => row.rendererTileMemoryBytes), sharedImageBytes: tileEvidence.map(row => row.gpuSharedImagesBytes), birthsChecked: births.length, originalSha256 }));
