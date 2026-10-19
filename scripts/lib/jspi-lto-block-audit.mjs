// Independently verify each experiment block against the executed archives.
import assert from "node:assert/strict";
import { execFile } from "node:child_process";
import { access, readFile } from "node:fs/promises";
import path from "node:path";
import { gunzipSync } from "node:zlib";
import { promisify } from "node:util";
import { transform, version as esbuildVersion } from "esbuild";
import { sha } from "./stable-ui-headless-baseline-recipe.mjs";
import { materializeUpdatedFullArchive } from "./recorded-timeline-full-sources.mjs";
import { makeCompiledCacheWorker } from "./compiled-cache-candidate.mjs";
import { makeBoundedCatalogueApp } from "./bounded-catalogue-candidate.mjs";
import { makeCatalogueSlotReuse } from "./catalogue-slot-reuse.mjs";
import { deriveJournaledJspiControl } from "./jspi-validated-control-journal.mjs";
import { deriveJspiBrowserDriver, deriveJspiBrowserCaller } from "./jspi-browser-control.mjs";
import { deriveJspiBrowserStager } from "./jspi-browser-adapter.mjs";
import { makeJspiBrowserComposition } from "./jspi-browser-native.mjs";
import { inspectJspiBrowserResult } from "./jspi-browser-observation.mjs";
import { deriveLtoBrowserDriver, deriveLtoBrowserCaller } from "./lto-browser-control.mjs";
import { deriveLtoBrowserStager } from "./lto-browser-adapter.mjs";
import { makeLtoBrowserComposition } from "./lto-browser-native.mjs";
import { inspectLtoBrowserResult } from "./lto-browser-observation.mjs";
import { deriveRecordedTimelineSupervisor } from "./recorded-timeline-full-recipe.mjs";
export async function auditJspiLtoBlock(root, variant, terminalPath) {
  assert.ok(["jspi", "lto"].includes(variant));
  assert.match(terminalPath, new RegExp(`^evidence/\\d{4}-\\d\\d-\\d\\dT[\\d-]+Z-${variant}-control-terminal\\.json$`));
  process.env.WITHIN_DURATION_DRAIN_CONTROL_RECEIPT = "evidence/2026-10-15T10-37-24-961Z-duration-drain-browser-control-executed-sources.json";
  const read = file => readFile(path.resolve(root, file));
  const unpack = async record => {
    const zipped = await read(record.path); assert.equal(zipped.length, record.bytes); assert.equal(sha(zipped), record.sha256);
    const raw = gunzipSync(zipped, { maxOutputLength: 33554432 });
    assert.equal(raw.length, record.restoredBytes); assert.equal(sha(raw), record.restoredSha256); return raw;
  };
  const terminalBytes = await read(terminalPath), terminal = JSON.parse(terminalBytes), report = JSON.parse(await unpack(terminal.report));
  const previous = JSON.parse(await read("evidence/2026-10-17T22-38-25-691Z-jspi-control-terminal.json"));
  const previousReport = JSON.parse(await unpack(previous.report)), previousBuildBytes = await read(previous.build.path);
  assert.equal(sha(previousBuildBytes), previous.build.sha256);
  const buildBytes = await read(terminal.build.path); assert.equal(sha(buildBytes), terminal.build.sha256); const build = JSON.parse(buildBytes);
  const analysis = (variant === "jspi" ? inspectJspiBrowserResult : inspectLtoBrowserResult)(terminal, report, previousReport, build, JSON.parse(previousBuildBytes));
  const source = await materializeUpdatedFullArchive(root, terminal.sourceArchive);
  assert.equal(Object.keys(source.pins).length, variant === "jspi" ? 832 : 853);
  for (const pins of [terminal.sourcePins, terminal.postSourcePins, report.sourceHashes]) assert.deepEqual(source.pins, pins);
  for (const [file, digest] of Object.entries(source.pins)) assert.equal(sha(await read(file)), digest, file);
  const buildSource = JSON.parse(await unpack(build.sourceArchive)); assert.deepEqual(build.sourcePins, build.postSourcePins);
  for (const [file, digest] of Object.entries(build.sourcePins)) {
    assert.equal(sha(Buffer.from(buildSource.preimages[file], "base64")), digest); assert.equal(sha(await read(file)), digest);
  }
  assert.deepEqual(makeBoundedCatalogueApp((await read("app/converter/ConverterApp.tsx")).toString()), buildSource.appRecipe);
  assert.deepEqual(makeCompiledCacheWorker((await read("workers/conversion.worker.ts")).toString()), buildSource.workerRecipe);
  assert.deepEqual(makeCatalogueSlotReuse((await read("app/converter/PublishedFormatsCatalogue.tsx")).toString()), buildSource.slotRecipe);
  for (const asset of [...build.assets, build.stylesheet]) {
    const raw = await unpack(asset.archive); assert.equal(raw.length, asset.bytes); assert.equal(sha(raw), asset.sha256);
  }
  const composition = await (variant === "jspi" ? makeJspiBrowserComposition : makeLtoBrowserComposition)(root);
  assert.deepEqual(composition.manifest, report.manifest);
  const original = JSON.parse(gunzipSync(await read("outputs/reports/2026-10-16T17-01-47-260Z-updated-chrome-full-sources.json.gz")));
  const driver = await (variant === "jspi" ? deriveJspiBrowserDriver : deriveLtoBrowserDriver)(original.driver, root,
    terminal.wrapper, path.basename(terminal.candidateDirectory), source.extensionFiles, terminal.browserPinBefore);
  assert.equal(driver.generated, source.driver);
  assert.equal((await (variant === "jspi" ? deriveJspiBrowserCaller : deriveLtoBrowserCaller)((await read("scripts/run-updated-chrome-full.mjs")).toString(), root)).generated, source.generatedCaller);
  assert.equal((await (variant === "jspi" ? deriveJspiBrowserStager : deriveLtoBrowserStager)(composition.qualified.archive.recipe.generated.stage,
    composition.qualified.archive.recipe.generated.candidateName, path.basename(terminal.candidateDirectory))).generated, source.stager);
  assert.equal(deriveRecordedTimelineSupervisor((await read("scripts/launch-packet-largest-idle-supervisor.mjs")).toString(), root).generated, source.supervisor);
  const spec = JSON.parse(gunzipSync(await read("outputs/reports/2026-10-16T16-41-46-137Z-updated-chrome-media-sources.json.gz")));
  const recipe = deriveJournaledJspiControl(spec.recipe.generated.spec, root), control = report.progressProbe.successfulSaveControl, provenance = control.provenance;
  assert.equal(recipe.validatorSha256, provenance.validatorSha256); assert.deepEqual(recipe.adverseEdits, provenance.adverseEdits);
  assert.deepEqual(recipe.edits, provenance.journalOnlyEdits); assert.equal(sha(recipe.generated), provenance.generatedTypescriptSha256);
  assert.equal(esbuildVersion, provenance.esbuildVersion);
  const javascript = (await transform(recipe.generated, { loader: "ts", format: "esm", target: "es2022" })).code;
  assert.equal(sha(javascript), provenance.generatedJavascriptSha256); assert.equal((await unpack(provenance.archive)).toString(), javascript);
  const journalRows = []; assert.equal(control.validatedControlCheckpoints.length, 6);
  for (const [index, record] of control.validatedControlCheckpoints.entries()) {
    const value = JSON.parse(await unpack(record)); assert.equal(record.completedValidatedControls, index + 1); assert.equal(value.completedValidatedControls, index + 1);
    assert.equal(value.sourceModuleSha256, provenance.generatedJavascriptSha256); assert.equal(value.validatorSha256, provenance.validatorSha256);
    assert.equal(value.originalValidatorAndOutputCleanupCompleted, true); assert.equal(value.memoryAcceptance, false); assert.equal(value.publicAcceptance, false);
    assert.equal(value.rows.filter(row => row.container === "mp4" && row.status === "passed" && row.sourceCodec === "hevc").length, 1);
    journalRows.push(...value.rows);
  }
  assert.deepEqual(journalRows, control.rows.slice(0, journalRows.length));
  const remaining = control.rows.slice(journalRows.length); assert.equal(remaining.length, 3);
  assert.equal(remaining[0].kind, "actual-native-bitrate-configuration"); assert.deepEqual(remaining[1], { cleanupRemovedEntries: [] });
  assert.equal(remaining[2].kind, "validated-same-page-recovery"); assert.equal(remaining[2].phase, "input-read-failure");
  const expectedWords = [1,1920,804,0,1,24,24,1,4000000,4,20,1,1,2,2,2,1,1,0,0,0,0,0,0];
  for (const row of control.rows.filter(row => row.kind === "actual-native-bitrate-configuration")) {
    assert.equal(row.bitRate, 4000000); assert.equal(row.samples.length, 1);
    assert.deepEqual(row.samples[0].words, expectedWords); assert.equal(row.samples[0].nativeSettingsMatch, 1);
  }
  const fixtureRows = control.rows.filter(row => row.sourceSha256);
  const fixtureHashes = [...new Set(fixtureRows.map(row => row.sourceSha256))];
  assert.equal(fixtureHashes.length, 1);
  const disposablePaths = [terminal.wrapper, terminal.candidateDirectory, terminal.callerRuntimeDirectory, report.runtimeDirectory, report.cleanup.completedSaveFixture.fixtureDirectory];
  for (const directory of disposablePaths) { assert.equal(path.dirname(directory), path.join(root, "work")); await assert.rejects(access(directory), { code: "ENOENT" }); }
  assert.deepEqual(terminal.browserPinBefore, terminal.browserPinAfter); assert.deepEqual(terminal.protectedBefore, terminal.protectedAfter);
  assert.equal(terminal.protectedAfter.bytes, 2958573265); assert.equal(terminal.protectedAfter.sha256, "31f36695b5b44c62125a9e4264e84dc085accd21c02cc3487aae597f54b9db34");
  const command = "ConvertTo-Json -InputObject @(Get-CimInstance Win32_Process | ForEach-Object {@{pid=[int]$_.ProcessId;createdAt=$_.CreationDate.ToUniversalTime().ToString('o');commandLine=$_.CommandLine}}) -Compress";
  const { stdout } = await promisify(execFile)("powershell.exe", ["-NoProfile", "-NonInteractive", "-Command", command],
    { windowsHide: true, timeout: 15000, maxBuffer: 2097152 });
  const current = JSON.parse(stdout), recordedBirths = terminal.treeCleanupAudit.recordedBirths;
  for (const identity of recordedBirths) {
    const live = current.find(row => row.pid === identity.pid);
    assert.ok(!live || Math.abs(Date.parse(live.createdAt) - Date.parse(identity.createdAt)) > 1);
  }
  for (const row of current) assert.ok(!disposablePaths.some(directory => row.commandLine?.toLowerCase().includes(directory.toLowerCase())));
  return { variant, terminal: { path: terminalPath, sha256: sha(terminalBytes) }, report: terminal.report, sourceArchive: terminal.sourceArchive,
    build: terminal.build, analysis, browserPinBefore: terminal.browserPinBefore, browserPinAfter: terminal.browserPinAfter,
    validatorSha256: provenance.validatorSha256, fixtureSha256: fixtureHashes[0], nativeSettings: expectedWords,
    audit: { complete: true, originalValidatorsUnchanged: true, sourcePins: Object.keys(source.pins).length,
      exactDriverCallerStagerSupervisor: true, exactAppWorkerSlotOverlays: true, sixCheckpointsReplayed: true,
      disposablePathsAbsent: disposablePaths, recordedBirths, allRecordedBirthsRecheckedAbsent: true,
      nativeEnvelope: composition.native.envelope },
    checkpoint: report.nativeMemory.durableCheckpoint, cleanupRoot: report.runtimeDirectory };
}
