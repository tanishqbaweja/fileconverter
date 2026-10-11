// Private 4 Mbps full-original qualification. Immutable measured sources stay untouched.
import assert from "node:assert/strict";
import { access, readFile, stat } from "node:fs/promises";
import path from "node:path";
import { pathToFileURL } from "node:url";
import { gunzipSync } from "node:zlib";
import { sha } from "./stable-ui-headless-baseline-recipe.mjs";
import { makeEncoderPlaneClockFullCaller, makeEncoderPlaneClockFullDriver,
  encoderPlaneClockFullFiles, verifyClockDiagnostic, verifySingleIdleAbortQualification } from "./encoder-plane-clock-full-recipe.mjs";
import { makeEncoderPlaneAbortStager } from "./encoder-plane-full-recipe.mjs";
import { auditNativeBitrateConfiguration, inspectBitrateDiagnostic, compareBitrateDiagnostics } from "./encoder-plane-bitrate-browser-recipe.mjs";
export { verifyClockDiagnostic, verifySingleIdleAbortQualification };
export const bitrateFullAdditions = ["scripts/lib/encoder-plane-bitrate-full-recipe.mjs",
  "scripts/run-encoder-plane-bitrate-original-full.mjs", "scripts/stage-mpeg2-bitrate-full-abort.mjs",
  "tests/mpeg2-encoder-plane-bitrate-full.test.mjs", "scripts/lib/bounded-ssim-summary.mjs",
  "scripts/lib/encoder-plane-bitrate-browser-recipe.mjs", "scripts/lib/encoder-plane-quality-browser-recipe.mjs"];
export const encoderPlaneBitrateFullFiles = [...encoderPlaneClockFullFiles, ...bitrateFullAdditions];
const uri = (root, file) => JSON.stringify(pathToFileURL(path.join(root, file)).href);
function exact(source, edits) {
  let generated = source;
  for (const [before, after, count = 1] of edits) {
    assert.equal(generated.split(before).length - 1, count, before);
    generated = generated.replaceAll(before, after);
  }
  let reverse = generated;
  for (const [before, after] of edits.toReversed()) reverse = reverse.replaceAll(after, before);
  assert.equal(reverse, source, "Only listed bitrate/audit/diagnostic/evidence edits; original gates retained");
  return { generated, generatedSha256: sha(generated), edits };
}
export function makeFullBitrateAbortAdapter(original) {
  assert.equal(Buffer.byteLength(original), 18330);
  assert.equal(sha(original), "020b3bdc7d3902367358094a8db2d1fa990691443bdc4ec465c5b0ae34792837");
  const edits = [
    ['    session = createMpeg2SplitSession({ encoder, isCancelled: options.withinBridge.cancelled });',
      `    const openNativeEncoder = encoder._within_split_encoder_open.bind(encoder);
    encoder._within_split_encoder_open = () => {
      const result = openNativeEncoder();
      if (result >= 0) console.debug("WITHIN_MPEG2_BITRATE_AUDIT "+JSON.stringify((${auditNativeBitrateConfiguration.toString()})(encoder,4000000)));
      return result;
    };
    session = createMpeg2SplitSession({ encoder, isCancelled: options.withinBridge.cancelled });`],
    ['      try { return await call(name,type,mapped.map(()=>"number"),mapped,settings); }',
      `      if (name !== "within_remux" || mapped.length !== 12 || mapped[0] !== 6 || mapped[8] !== 0 || mapped[9] !== 0 || mapped[10] !== 0 || mapped[11] !== 0)
        throw new Error("Bitrate experiment requires unchanged default geometry/FPS/quality and twelve native arguments");
      mapped[9] = 4000000;
      try { return await call(name,type,mapped.map(()=>"number"),mapped,settings); }`],
  ];
  const recipe = exact(original, edits);
  return { ...recipe, adapter: recipe.generated, adapterBytes: Buffer.byteLength(recipe.generated),
    adapterSha256: recipe.generatedSha256, nativeBitRate: 4000000, publicAcceptance: false };
}
export function makeEncoderPlaneBitrateAbortStager(source, root) {
  const old = makeEncoderPlaneAbortStager(source, root);
  const anchor = 'assert.equal(Buffer.byteLength(adapter), 18330); assert.equal(sha(adapter), "020b3bdc7d3902367358094a8db2d1fa990691443bdc4ec465c5b0ae34792837");';
  const edits = [
    ['import assert from "node:assert/strict";', `import { makeFullBitrateAbortAdapter } from ${uri(root, "scripts/lib/encoder-plane-bitrate-full-recipe.mjs")};\nimport assert from "node:assert/strict";`],
    ['const { original, adapter } = makeLateAllocatorAbortAdapter(', 'const { original, adapter: originalAdapter } = makeLateAllocatorAbortAdapter('],
    [anchor, anchor.replaceAll('adapter', 'originalAdapter') + '\nconst { adapter } = makeFullBitrateAbortAdapter(originalAdapter);'],
    ['"encoder-plane-abort-stager-"', '"encoder-plane-bitrate-abort-stager-"'],
  ];
  return { ...old, ...exact(old.generated, edits), previousAbortStagerSha256: sha(old.generated), publicAcceptance: false };
}
// Bounded native-open telemetry is retained before validation can throw.
export function validateFullBitrateAudit(sample) {
  assert.equal(sample.expectedBitRate, 4000000); assert.equal(sample.nativeSettingsMatch, 1);
  assert.equal(sample.words.length, 24);
  assert.deepEqual(sample.words.slice(0, 13), [1, 1920, 804, 0, 1, 24, 24, 1, 4000000, 4, 20, 1, 1]);
  assert.deepEqual(sample.words.slice(18), [0, 0, 0, 0, 0, 0]);
  assert.equal(sample.scope, "native-context-audit-not-memory-or-fidelity-acceptance");
  return sample;
}
export function makeEncoderPlaneBitrateFullDriver(previous, root, runtime, branch, adapter) {
  assert.ok(adapter.adapterBytes > 18330 && adapter.adapterBytes < 32768);
  assert.match(adapter.adapterSha256, /^[a-f0-9]{64}$/);
  const old = makeEncoderPlaneClockFullDriver(previous, root, runtime, branch);
  const edits = [
    ['import assert from "node:assert/strict";', `import { inspectSsimSummary, requireNumericSsim } from ${uri(root, "scripts/lib/bounded-ssim-summary.mjs")};\nimport { validateFullBitrateAudit } from ${uri(root, "scripts/lib/encoder-plane-bitrate-full-recipe.mjs")};\nimport assert from "node:assert/strict";`],
    ['scripts/stage-mpeg2-encoder-plane-abort.mjs', 'scripts/stage-mpeg2-bitrate-full-abort.mjs', 4],
    ['const sourceFiles = [', 'const sourceFiles = [' + bitrateFullAdditions.map(file => JSON.stringify(file) + ',').join('')],
    ['assert.equal((await stat(file)).size,18330);', `assert.equal((await stat(file)).size,${adapter.adapterBytes});`],
    ['assert.equal(await shaFile(file),"020b3bdc7d3902367358094a8db2d1fa990691443bdc4ec465c5b0ae34792837","Exact controlled staged abort adapter");',
      `assert.equal(await shaFile(file),${JSON.stringify(adapter.adapterSha256)},"Exact qualified bitrate-only staged abort adapter");`],
    ['abortDiagnostic.stagedAdapters.push({name,bytes:18330,sha256:"020b3bdc7d3902367358094a8db2d1fa990691443bdc4ec465c5b0ae34792837"});',
      `abortDiagnostic.stagedAdapters.push({name,bytes:${adapter.adapterBytes},sha256:${JSON.stringify(adapter.adapterSha256)}});`],
    ['const splitFinalSamples = [];', 'const bitrateAuditSamples = [];\nconst splitFinalSamples = [];'],
    ['[["WITHIN_MPEG2_SPLIT_FINAL ", splitFinalSamples], ["WITHIN_MPEG2_STACK_RESERVE ", nativeStackSamples]]',
      '[["WITHIN_MPEG2_BITRATE_AUDIT ", bitrateAuditSamples], ["WITHIN_MPEG2_SPLIT_FINAL ", splitFinalSamples], ["WITHIN_MPEG2_STACK_RESERVE ", nativeStackSamples]]'],
    ['if (text.startsWith(prefix) && records.length < 16)', 'if (text.startsWith(prefix) && records.length < (records === bitrateAuditSamples ? 3 : 16))'],
    ['    assert.equal(splitFinalSamples.length, number);',
      '    run.nativeBitrateConfiguration = bitrateAuditSamples[number - 1] ?? null;\n    assert.equal(bitrateAuditSamples.length, number);\n    validateFullBitrateAudit(run.nativeBitrateConfiguration);\n    assert.equal(splitFinalSamples.length, number);'],
    ['const ssim = Number(/All:([0-9.]+)/.exec(stderr)?.[1]); assert.ok(ssim >= 0.98);',
      'run.independentSsimDiagnostic = inspectSsimSummary(stderr);\n    const ssim = requireNumericSsim(run.independentSsimDiagnostic); assert.ok(ssim >= 0.98);'],
    ['allocatorSamples, allocatorSamplesEvicted, splitFinalSamples, nativeStackSamples,',
      'allocatorSamples, allocatorSamplesEvicted, bitrateAuditSamples, splitFinalSamples, nativeStackSamples,'],
    ['-private-mpeg2-encoder-plane-clock-full-native-100ms', '-private-mpeg2-encoder-plane-bitrate-full-native-100ms'],
    ['"mpeg2-encoder-plane-clock-full-runtime-"', '"mpeg2-encoder-plane-bitrate-full-runtime-"'],
  ];
  return { ...old, ...exact(old.generated, edits), previousClockDriverSha256: sha(old.generated),
    nativeBitRate: 4000000, abortAdapter: { bytes: adapter.adapterBytes, sha256: adapter.adapterSha256 },
    fullOriginalAcceptance: false, publicAcceptance: false, conversionSpeedAcceptance: false };
}

const QUALIFICATION_PINS = [
  ["evidence/2026-10-11T07-38-57-951Z-encoder-plane-bitrate-comparison.json", "61012983b2bb0f1716a7b50832b61973fb3f25d97c9fdd88044ad64aee606d08"],
  ["evidence/2026-10-11T07-51-01-110Z-encoder-plane-recovery-diagnostic.json", "e55ef0c3b33970469494104596d7d0a4b3b51bd2fd425f0c9f380627a842a2e2"],
  ["evidence/2026-10-11T03-53-11-041Z-encoder-plane-clock-original-full-terminal-analysis.json", "c4e92a1b8733e87727216bc3728822a6dca587503bd5a6ba4fb9d5295e6839ec"],
];
// Prerequisite snapshots are individually reverified, not omitted from their
// own provenance nor mislabelled as runtime files in the full256-file union.
export async function verifyBitrateFullPrerequisites(root) {
  const safe = file => {
    assert.equal(typeof file, "string"); assert.ok(file.length <= 512 && !file.includes(":") && !file.includes("\\"));
    assert.ok(!file.startsWith("/") && file.split("/").every(part => part && part !== "." && part !== ".."));
    return path.join(root, file);
  };
  const read = async (file, maximum = 2097152) => {
    const absolute = safe(file); assert.ok((await stat(absolute)).size <= maximum); return readFile(absolute);
  };
  const pinned = async (file, hash) => { const bytes = await read(file); assert.equal(sha(bytes), hash, file); return JSON.parse(bytes); };
  const restored = async (record, maximum = 8388608) => {
    assert.ok(record.bytes > 0 && record.bytes <= 8388608 && record.restoredBytes > 0 && record.restoredBytes <= maximum);
    const zipped = await read(record.path, 8388608); assert.equal(zipped.length, record.bytes); assert.equal(sha(zipped), record.sha256);
    const bytes = gunzipSync(zipped, { maxOutputLength: maximum });
    assert.equal(bytes.length, record.restoredBytes); assert.equal(sha(bytes), record.restoredSha256); return JSON.parse(bytes);
  };
  const protectedIdentity = { bytes: 2958573265, sha256: "31f36695b5b44c62125a9e4264e84dc085accd21c02cc3487aae597f54b9db34" };
  const ownedIdentities = [], sourceCounts = [];
  const verifyShort = async proof => {
    assert.equal(proof.failure, null); assert.deepEqual(proof.sourcePins, proof.postSourcePins);
    assert.deepEqual(proof.protectedPre, protectedIdentity); assert.deepEqual(proof.protectedPost, protectedIdentity);
    for (const field of ["originalFullSourceAcceptance", "completeChromiumMemoryAcceptance", "publicAcceptance", "conversionSpeedAcceptance"])
      assert.equal(proof[field], false);
    assert.equal(proof.browserMode, "headless"); assert.equal(proof.subprocessWindowsHidden, true);
    assert.equal(proof.nativeToolsOnlyFixturesAndIndependentValidation, true); assert.equal(proof.noDocker, true);
    const source = await restored(proof.generatedArchive); assert.deepEqual(source.sourcePins, proof.sourcePins);
    assert.ok(Object.keys(proof.sourcePins).length >= 78 && Object.keys(proof.sourcePins).length <= 256);
    for (const [file, hash] of Object.entries(proof.sourcePins)) {
      assert.equal(sha(await read(file)), hash, file); assert.equal(sha(source.sources[file]), hash, file);
    }
    sourceCounts.push(Object.keys(proof.sourcePins).length);
    const report = await restored(proof.report.archive);
    assert.equal(proof.report.bytes, proof.report.archive.restoredBytes); assert.equal(proof.report.sha256, proof.report.archive.restoredSha256);
    const build = await pinned(proof.build.path, proof.build.sha256); await pinned(proof.branch.path, proof.branch.sha256);
    await pinned(proof.baseline.path, proof.baseline.sha256);
    for (const field of ["normalAppAndCssUnchanged", "privateAdditionsAbsent", "ownedWrapperAbsent"]) assert.equal(proof.cleanup[field], true);
    assert.deepEqual(proof.cleanup.newFixtureDirsRemaining, []); assert.equal(proof.cleanup.helpers.runtimeAbsent, true);
    const helpers = await pinned(proof.cleanup.helpers.path, proof.cleanup.helpers.sha256);
    assert.deepEqual(helpers.launchRecords, proof.cleanup.helpers.launchRecords); assert.equal(helpers.runtimeAbsent, true);
    for (const directory of [proof.cleanup.ownedWrapper, proof.cleanup.helpers.runtime]) {
      assert.equal(path.dirname(directory), path.join(root, "work")); await assert.rejects(access(directory), { code: "ENOENT" });
    }
    assert.equal(helpers.launchRecords.length, 2);
    for (const row of helpers.launchRecords) { assert.equal(row.absence.status, "owned-identity-absent"); ownedIdentities.push(row.identity); }
    return { report, build, source };
  };
  const comparison = await pinned(...QUALIFICATION_PINS[0]);
  assert.equal(comparison.status, "short-identical-input-bitrate-control-only-not-full-acceptance");
  assert.equal(comparison.proofs.length, 2);
  const analyses = [];
  for (const [index, rate] of [2000000, 4000000].entries()) {
    const ref = comparison.proofs[index], proof = await pinned(ref.path, ref.sha256);
    const { report, build, source } = await verifyShort(proof);
    assert.equal(source.generated.experimentBitRate, rate); assert.ok(source.generated.stage.includes(`mapped[9] = ${rate};`));
    assert.equal(proof.status, "one-headless-full-geometry-quality-diagnostic-only-not-acceptance");
    const analysis = inspectBitrateDiagnostic(report, null, build, rate); assert.deepEqual(analysis, proof.analysis); analyses.push(analysis);
  }
  assert.deepEqual(compareBitrateDiagnostics(...analyses), comparison.comparison);
  assert.equal(comparison.comparison.retainedForFullQualification, true); assert.equal(comparison.comparison.speedImprovementProven, false);
  const recovery = await pinned(...QUALIFICATION_PINS[1]);
  assert.equal(recovery.status, "two-headless-adverse-and-same-page-recovery-cases-not-full-acceptance");
  const { report, build } = await verifyShort(recovery);
  const markers = report.rows.filter(row => row.kind === "validated-same-page-recovery");
  assert.deepEqual(markers.map(row => row.phase), ["write-failure", "cancellation"]);
  assert.equal(recovery.analysis.completedValidatedRecoveryConversions, 2); assert.equal(recovery.analysis.adverseCases, 2);
  for (const [index, marker] of markers.entries()) {
    assert.equal(marker.sameWorkerObject, false);
    for (const field of ["noPageReload", "retiredWorkerAbsent", "productionReplacementWorkerUsed", "completedWorkerRetired"]) assert.equal(marker[field], true);
    assert.ok(Number.isInteger(marker.startRow) && Number.isInteger(marker.endRow) && marker.endRow > marker.startRow);
    const analysis = inspectBitrateDiagnostic({ ...report, rows: report.rows.slice(marker.startRow, marker.endRow) }, null, build, 4000000);
    assert.deepEqual(analysis, recovery.analysis.results[index].analysis); assert.equal(analysis.caseStatus, "passed");
    const adverse = report.rows.filter(row => row.kind === (marker.phase === "write-failure" ? "direct-write-failure" : "cancel-after-direct-output"));
    assert.equal(adverse.length, 1); assert.equal(adverse[0].status, "passed"); assert.ok(adverse[0].partialBytes.every(bytes => bytes === 0));
    const m = adverse[0].metrics; assert.equal(m.pendingOperations, 0); assert.equal(m.queuedBytes, 0); assert.equal(m.scratchBytes, 0);
    assert.equal(m.peakWasmMemoryBytes, 50331648);
    assert.ok(m.peakPendingOperations <= 1 && m.peakQueuedBytes <= 524288 && m.maxReadChunkBytes <= 65536 && m.maxWriteChunkBytes <= 524288);
    if (marker.phase === "cancellation") { assert.equal(adverse[0].terminalState, "cancelled"); assert.ok(adverse[0].beforeCancel.outputBytes > 32768); }
    else assert.ok(adverse[0].error.toLowerCase().includes("destination rejected a bounded write"));
    const native = report.rows.filter(row => row.kind === "adverse-native-configuration" && row.phase === marker.phase);
    assert.equal(native.length, 1); assert.deepEqual(native[0].samples, [analysis.nativeConfiguration]); assert.equal(native[0].splitFinalSamples.length, 1);
    const split = native[0].splitFinalSamples[0]; assert.equal(split.closed, true); assert.ok(split.frames > 0);
    for (const field of ["activePackets", "queuedFrames", "queuedPackets"]) assert.equal(split[field], 0);
  }
  const clockAudit = await pinned(...QUALIFICATION_PINS[2]);
  const clockReceipt = await pinned(clockAudit.receipt.path, clockAudit.receipt.sha256);
  assert.equal(clockAudit.status, "failed-or-incomplete-full-original-session-not-acceptance");
  assert.equal(clockAudit.completedConversions, 0); assert.equal(clockAudit.fullOriginalSessionGatePassed, false);
  assert.equal(clockAudit.historicalDeletedOutputNumericSsimKnown, false); assert.equal(clockAudit.observerClosedAndClockFenceValid, true);
  assert.equal(clockAudit.nativeRowConsumersAgree, true); assert.equal(clockAudit.rowsCountedWithoutDropping, 96328);
  assert.equal(clockAudit.native.observedIncrementalPrivateMiB, 221.73828125); assert.equal(clockAudit.publicAcceptance, false);
  for (const [file, hash] of Object.entries(clockAudit.analysisSourcePins)) assert.equal(sha(await read(file)), hash, file);
  assert.deepEqual(clockReceipt.sourcePins, clockReceipt.postSourcePins);
  const clockSource = await restored(clockReceipt.sourceArchive), clockRaw = await restored(clockReceipt.candidate.compressedReport, 33554432);
  assert.equal(sha(clockSource.generated), clockReceipt.sourceArchive.driverSha256);
  assert.equal(sha(clockSource.traceHelper), clockReceipt.sourceArchive.traceHelperSha256);
  for (const [file, hash] of Object.entries(clockReceipt.sourcePins)) {
    assert.equal(sha(await read(file)), hash, file);
    assert.equal(clockSource.sourcePreimages[file].encoding, "base64"); assert.equal(sha(Buffer.from(clockSource.sourcePreimages[file].data, "base64")), hash, file);
  }
  assert.equal(Object.keys(clockReceipt.sourcePins).length, 249);
  assert.equal(clockRaw.status, "failed"); assert.ok(clockRaw.failure.message.includes("assert.ok(ssim >= 0.98)"));
  assert.equal(clockRaw.nativeMemory.error, null); assert.equal(clockRaw.nativeMemory.receiptClockFence.monitorClosed, true);
  assert.equal(clockRaw.nativeMemory.sequence, clockRaw.nativeFailureCapture.sequence); assert.equal(clockRaw.nativeMemory.sequence, 96328);
  for (const field of ["mediaProfileRuntimeRemoved", "generatedDistRestored", "protectedFixtureUnchanged", "observerStopped", "sampledChromeRootStopped"]) assert.equal(clockRaw.cleanup[field], true);
  assert.ok(!clockRaw.cleanup.errors?.length); assert.equal(clockReceipt.wrapperAbsent, true); assert.equal(clockReceipt.productionRestored, true);
  for (const directory of [clockRaw.runtimeDirectory, clockReceipt.wrapper]) {
    assert.equal(path.dirname(directory), path.join(root, "work")); await assert.rejects(access(directory), { code: "ENOENT" });
  }
  ownedIdentities.push(clockReceipt.driverIdentity, ...clockReceipt.candidate.ownedLaunches.map(row => row.identity));
  return { status: "hash-bound-short-bitrate-recovery-and-failed-clock-window-prerequisites-verified",
    records: QUALIFICATION_PINS.map(([file, hash]) => ({ path: file, sha256: hash })), measuredPrerequisiteSourceCounts: sourceCounts,
    unchangedHistoricalFullSources: 249, ownedIdentities, nativeBitRate: 4000000,
    fullOriginalAcceptance: false, publicAcceptance: false, conversionSpeedAcceptance: false };
}
export function makeEncoderPlaneBitrateFullCaller(source, root) {
  const old = makeEncoderPlaneClockFullCaller(source, root);
  const oldImport = `import { makeEncoderPlaneClockFullDriver as makeSingleIdleFullDriver, verifySingleIdleAbortQualification, encoderPlaneClockFullFiles as singleIdleFullFiles, verifyClockDiagnostic } from ${uri(root, "scripts/lib/encoder-plane-clock-full-recipe.mjs")};`;
  const edits = [
    [oldImport, `import { makeEncoderPlaneBitrateFullDriver as deriveBitrateDriver, verifySingleIdleAbortQualification, encoderPlaneBitrateFullFiles as singleIdleFullFiles, verifyClockDiagnostic, verifyBitrateFullPrerequisites, makeFullBitrateAbortAdapter } from ${uri(root, "scripts/lib/encoder-plane-bitrate-full-recipe.mjs")};\nimport { makeLateAllocatorAbortAdapter } from ${uri(root, "scripts/lib/mpeg2-late-allocator-abort-adapter.mjs")};\nimport { FROZEN_BROWSER_SOURCES } from ${uri(root, "scripts/lib/single-idle-browser-recipe.mjs")};`],
    ['const hashFile = async file =>', `const bitratePrerequisites = await verifyBitrateFullPrerequisites(root);
const adapterSources = {}; for (const file of Object.keys(FROZEN_BROWSER_SOURCES)) adapterSources[file] = (await read(file)).toString();
const originalAdapter = makeLateAllocatorAbortAdapter({ stager: adapterSources["scripts/stage-mpeg2-split-direct.mjs"],
  stackHelper: (await read("scripts/lib/bounded-wasm-abort-capture.mjs")).toString(),
  snapshotHelper: (await read("scripts/lib/late-refstruct-abort-snapshot.mjs")).toString(),
  poolHelper: (await read("scripts/lib/late-pool-abort-capture.mjs")).toString(),
  allocatorHelper: (await read("scripts/lib/late-pool-allocator-abort-capture.mjs")).toString(),
  freeHeaderHelper: (await read("scripts/lib/dlmalloc-free-header-inspection.mjs")).toString(),
  controlProof: JSON.parse(await read("evidence/late-pool-abort-control-2026-10-08.json")),
  allocatorControlProof: JSON.parse(await read("evidence/late-pool-allocator-abort-control-2026-10-08.json")),
  layoutProof: JSON.parse(await read("evidence/mpeg2-late-dlmalloc-layout-2026-10-08.json")) }).adapter;
const bitrateAdapter = makeFullBitrateAbortAdapter(originalAdapter);
const makeSingleIdleFullDriver = (previous, root, runtime, branch) => deriveBitrateDriver(previous, root, runtime, branch, bitrateAdapter);
const hashFile = async file =>`],
    ['const proof = { recordedAt: null,', 'const proof = { bitratePrerequisites, nativeBitRate: 4000000, recordedAt: null,'],
    ['// No stale-state restart: check actual old launch identities; do not kill anything.',
      '// No stale-state restart: check actual old launch identities; do not kill anything.\n    for (const identity of bitratePrerequisites.ownedIdentities) assert.equal((await observeOwnedProcessExit(identity)).status, "owned-identity-absent");'],
    ['name.endsWith("-encoder-plane-clock-full-live.json")', '(name.endsWith("-encoder-plane-clock-full-live.json") || name.endsWith("-encoder-plane-bitrate-full-live.json"))'],
    ['"encoder-plane-clock-full-wrapper-"', '"encoder-plane-bitrate-full-wrapper-"'],
    ['-encoder-plane-clock-full-post-cancel-partial-blink.json.gz', '-encoder-plane-bitrate-full-post-cancel-partial-blink.json.gz'],
    ['-encoder-plane-clock-full-executed-sources.json.gz', '-encoder-plane-bitrate-full-executed-sources.json.gz'],
    ['-encoder-plane-clock-full-live.json`', '-encoder-plane-bitrate-full-live.json`'],
    ['-private-mpeg2-encoder-plane-clock-full-native-100ms.json', '-private-mpeg2-encoder-plane-bitrate-full-native-100ms.json'],
    ['-encoder-plane-clock-full-raw.json.gz', '-encoder-plane-bitrate-full-raw.json.gz'],
    ['-encoder-plane-clock-original-full${', '-encoder-plane-bitrate-original-full${'],
  ];
  return { ...old, ...exact(old.generated, edits), previousClockCallerSha256: sha(old.generated), publicAcceptance: false };
}
