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
import { makeCompiledCacheWorker } from "./lib/compiled-cache-candidate.mjs";
import { makeBoundedCatalogueApp } from "./lib/bounded-catalogue-candidate.mjs";
import { makeCatalogueSlotReuse } from "./lib/catalogue-slot-reuse.mjs";
import { deriveJournaledJspiControl } from "./lib/jspi-validated-control-journal.mjs";
import { deriveJspiBrowserDriver, deriveJspiBrowserCaller } from "./lib/jspi-browser-control.mjs";
import { deriveJspiBrowserStager } from "./lib/jspi-browser-adapter.mjs";
import { makeJspiBrowserComposition } from "./lib/jspi-browser-native.mjs";
import { inspectJspiBrowserResult } from "./lib/jspi-browser-observation.mjs";
const root = path.resolve(import.meta.dirname, ".."), read = file => readFile(path.resolve(root, file));
process.env.WITHIN_DURATION_DRAIN_CONTROL_RECEIPT = "evidence/2026-10-15T10-37-24-961Z-duration-drain-browser-control-executed-sources.json";
const unpack = async record => {
  const zipped = await read(record.path); assert.equal(zipped.length, record.bytes); assert.equal(sha(zipped), record.sha256);
  const raw = gunzipSync(zipped, { maxOutputLength: 33554432 }); assert.equal(raw.length, record.restoredBytes); assert.equal(sha(raw), record.restoredSha256); return raw;
};
const terminalPath = "evidence/2026-10-17T22-38-25-691Z-jspi-control-terminal.json", terminalBytes = await read(terminalPath), terminal = JSON.parse(terminalBytes);
const previousPath = "evidence/2026-10-17T18-26-10-502Z-catalogue-slot-control-terminal.json", previousBytes = await read(previousPath), previous = JSON.parse(previousBytes);
const report = JSON.parse(await unpack(terminal.report)), previousReport = JSON.parse(await unpack(previous.report));
const buildBytes = await read(terminal.build.path); assert.equal(sha(buildBytes), terminal.build.sha256); const build = JSON.parse(buildBytes);
const previousBuildBytes = await read(previous.build.path); assert.equal(sha(previousBuildBytes), previous.build.sha256); const previousBuild = JSON.parse(previousBuildBytes);
const analysis = inspectJspiBrowserResult(terminal, report, previousReport, build, previousBuild);
const source = await materializeUpdatedFullArchive(root, terminal.sourceArchive);
assert.equal(Object.keys(source.pins).length, 832); assert.deepEqual(source.pins, terminal.sourcePins);
assert.deepEqual(source.pins, terminal.postSourcePins); assert.deepEqual(source.pins, report.sourceHashes);
for (const [file, digest] of Object.entries(source.pins)) assert.equal(sha(await read(file)), digest, file);
const buildSource = JSON.parse(await unpack(build.sourceArchive)); assert.deepEqual(build.sourcePins, build.postSourcePins);
for (const [file, digest] of Object.entries(build.sourcePins)) {
  assert.equal(sha(Buffer.from(buildSource.preimages[file], "base64")), digest); assert.equal(sha(await read(file)), digest);
}
assert.deepEqual(makeBoundedCatalogueApp((await read("app/converter/ConverterApp.tsx")).toString()), buildSource.appRecipe);
assert.deepEqual(makeCompiledCacheWorker((await read("workers/conversion.worker.ts")).toString()), buildSource.workerRecipe);
assert.deepEqual(makeCatalogueSlotReuse((await read("app/converter/PublishedFormatsCatalogue.tsx")).toString()), buildSource.slotRecipe);
for (const asset of [...build.assets, build.stylesheet]) { const raw = await unpack(asset.archive); assert.equal(raw.length, asset.bytes); assert.equal(sha(raw), asset.sha256); }
const composition = await makeJspiBrowserComposition(root); assert.deepEqual(composition.manifest, report.manifest);
const parentArchive = JSON.parse(gunzipSync(await read("outputs/reports/2026-10-16T17-01-47-260Z-updated-chrome-full-sources.json.gz")));
const driver = await deriveJspiBrowserDriver(parentArchive.driver, root, terminal.wrapper, path.basename(terminal.candidateDirectory), source.extensionFiles);
assert.equal(driver.generated, source.driver);
const caller = await deriveJspiBrowserCaller((await read("scripts/run-updated-chrome-full.mjs")).toString(), root); assert.equal(caller.generated, source.generatedCaller);
const stager = await deriveJspiBrowserStager(composition.qualified.archive.recipe.generated.stage,
  composition.qualified.archive.recipe.generated.candidateName, path.basename(terminal.candidateDirectory)); assert.equal(stager.generated, source.stager);
const specArchive = JSON.parse(gunzipSync(await read("outputs/reports/2026-10-16T16-41-46-137Z-updated-chrome-media-sources.json.gz")));
const recipe = deriveJournaledJspiControl(specArchive.recipe.generated.spec, root), provenance = report.progressProbe.successfulSaveControl.provenance;
assert.equal(recipe.validatorSha256, provenance.validatorSha256); assert.deepEqual(recipe.adverseEdits, provenance.adverseEdits);
assert.deepEqual(recipe.edits, provenance.journalOnlyEdits); assert.equal(sha(recipe.generated), provenance.generatedTypescriptSha256);
assert.equal(esbuildVersion, provenance.esbuildVersion);
const javascript = (await transform(recipe.generated, { loader: "ts", format: "esm", target: "es2022" })).code;
assert.equal(sha(javascript), provenance.generatedJavascriptSha256); assert.equal((await unpack(provenance.archive)).toString(), javascript);
const control = report.progressProbe.successfulSaveControl, journalRows = [];
assert.equal(control.validatedControlCheckpoints.length, 6);
for (const [index, record] of control.validatedControlCheckpoints.entries()) {
  const value = JSON.parse(await unpack(record)); assert.equal(record.completedValidatedControls, index + 1); assert.equal(value.completedValidatedControls, index + 1);
  assert.equal(value.sourceModuleSha256, provenance.generatedJavascriptSha256); assert.equal(value.validatorSha256, provenance.validatorSha256);
  assert.equal(value.originalValidatorAndOutputCleanupCompleted, true); assert.equal(value.memoryAcceptance, false); assert.equal(value.publicAcceptance, false);
  assert.equal(value.rows.filter(row => row.container === "mp4" && row.status === "passed" && row.sourceCodec === "hevc").length, 1);
  journalRows.push(...value.rows);
}
assert.deepEqual(journalRows, control.rows.slice(0, journalRows.length));
const afterLastCheckpoint = control.rows.slice(journalRows.length);
assert.equal(afterLastCheckpoint.length, 3); assert.equal(afterLastCheckpoint[0].kind, "actual-native-bitrate-configuration");
assert.equal(afterLastCheckpoint[0].bitRate, 4000000); assert.equal(afterLastCheckpoint[0].samples.length, 1);
assert.deepEqual(afterLastCheckpoint[0].samples[0].words, [1,1920,804,0,1,24,24,1,4000000,4,20,1,1,2,2,2,1,1,0,0,0,0,0,0]);
assert.equal(afterLastCheckpoint[0].samples[0].nativeSettingsMatch, 1); assert.deepEqual(afterLastCheckpoint[1], { cleanupRemovedEntries: [] });
assert.equal(afterLastCheckpoint[2].kind, "validated-same-page-recovery"); assert.equal(afterLastCheckpoint[2].phase, "input-read-failure");
const disposablePaths = [terminal.wrapper, terminal.candidateDirectory, terminal.callerRuntimeDirectory, report.runtimeDirectory, report.cleanup.completedSaveFixture.fixtureDirectory];
for (const directory of disposablePaths) { assert.equal(path.dirname(directory), path.join(root, "work")); await assert.rejects(access(directory), { code: "ENOENT" }); }
const command = "ConvertTo-Json -InputObject @(Get-CimInstance Win32_Process | ForEach-Object {@{pid=[int]$_.ProcessId;createdAt=$_.CreationDate.ToUniversalTime().ToString('o');commandLine=$_.CommandLine}}) -Compress";
const { stdout } = await promisify(execFile)("powershell.exe", ["-NoProfile", "-NonInteractive", "-Command", command], { windowsHide: true, timeout: 15000, maxBuffer: 2097152 });
const current = JSON.parse(stdout), births = terminal.treeCleanupAudit.recordedBirths.map(identity => {
  const live = current.find(row => row.pid === identity.pid); assert.ok(!live || Math.abs(Date.parse(live.createdAt) - Date.parse(identity.createdAt)) > 1);
  return { identity, ownedBirthAbsent: true, reusedPidUnchanged: Boolean(live) };
});
for (const row of current) assert.ok(!disposablePaths.some(directory => row.commandLine?.toLowerCase().includes(directory.toLowerCase())));
assert.equal(sha(await read("dist/client" + baselineBinding.url)), baselineBinding.sha256);
assert.equal(sha(await read("dist/client/assets/index-CIzbeB0A.css")), "f78f673c089ceb0dcfd1a885ff03e2a43984d851cfbe1d915e9a773a45c747dd");
assert.deepEqual(terminal.browserPinBefore, terminal.browserPinAfter);
const original = path.join(root, "test.mkv"), originalStat = await lstat(original); assert.equal(originalStat.size, 2958573265);
const hash = createHash("sha256"); for await (const chunk of createReadStream(original, { highWaterMark: 1048576 })) hash.update(chunk);
const originalSha256 = hash.digest("hex"); assert.equal(originalSha256, terminal.protectedAfter.sha256);
const checkpointPath = report.nativeMemory.durableCheckpoint.file; assert.equal(path.dirname(checkpointPath), path.join(root, "outputs/reports"));
const checkpointBytes = await readFile(checkpointPath); assert.deepEqual(JSON.parse(checkpointBytes).native.identities, report.nativeMemory.identities);
const checkpointZip = gzipSync(checkpointBytes, { level: 9 }); await writeFile(checkpointPath + ".gz", checkpointZip, { flag: "wx" });
assert.deepEqual(gunzipSync(await readFile(checkpointPath + ".gz")), checkpointBytes); await rm(checkpointPath);
const ownSources = {};
for (const file of ["scripts/analyze-jspi-browser.mjs", "scripts/lib/jspi-browser-observation.mjs", "tests/jspi-browser-observation.test.mjs"]) {
  const bytes = await read(file); ownSources[file] = { sha256: sha(bytes), preimage: bytes.toString("base64") };
}
const output = "evidence/2026-10-18-jspi-browser-independent-analysis.json";
await writeFile(path.join(root, output), JSON.stringify({ recordedAt: new Date().toISOString(), analysis, ownSources,
  terminal: { path: terminalPath, sha256: sha(terminalBytes) }, previous: { path: previousPath, sha256: sha(previousBytes) },
  sourceArchive: terminal.sourceArchive, all832ExecutedCurrentPostPinsEqual: true, report: terminal.report, build: terminal.build,
  exactDriverCallerStagerReconstructed: true, exactThreeAppWorkerSlotOverlaysReconstructed: true,
  exactJournaledValidationModuleReconstructed: true, unchangedContentAndAdverseValidators: true,
  allSixDurableCheckpointHashesAndRowsReplayed: true, composition: { decoderSha256: report.manifest.artifacts["within-mpeg2-split.wasm"],
    encoderSha256: report.manifest.artifacts["split-encoder.wasm"], nativeEnvelope: composition.native.envelope },
  births, disposablePathsAbsent: disposablePaths, original: { bytes: originalStat.size, sha256: originalSha256 }, normalDistRestored: true,
  checkpoint: { path: path.relative(root, checkpointPath + ".gz").replaceAll(path.sep, "/"), bytes: checkpointZip.length, sha256: sha(checkpointZip),
    restoredBytes: checkpointBytes.length, restoredSha256: sha(checkpointBytes), redundantRawRemoved: true },
  nextAction: "Private small qualification passed. Bind this exact candidate/source/validator/assets into full protected-original three-run qualification, preserving all original timing/content/stability/memory/cleanup gates; no public promotion or 10GB scaling claim before those pass.",
  publicAcceptance: false, fullOriginalAcceptance: false }, null, 2) + "\n", { flag: "wx" });
console.log(JSON.stringify({ output, ...analysis, birthsChecked: births.length, originalSha256 }));
