// Retain finite production-control evidence, including rejected attempts, not media.
import "./lib/hidden-unit-subprocesses.mjs";
import assert from "node:assert/strict";
import { execFile } from "node:child_process";
import { createHash } from "node:crypto";
import { createReadStream } from "node:fs";
import { access, lstat, readFile, realpath, unlink, writeFile } from "node:fs/promises";
import path from "node:path";
import { promisify } from "node:util";
import { gzipSync, gunzipSync } from "node:zlib";
import { observeOwnedProcessExit } from "./lib/owned-process-exit-observation.mjs";
import { assertMpeg2StorageFailure, mpeg2StorageRecoveryCases } from "./lib/mpeg2-storage-recovery.mjs";
import { replayLosslessNativeMemoryJournal, compactLosslessNativeMemoryJournal } from "./lib/lossless-native-memory-journal.mjs";
const root = path.resolve(import.meta.dirname, ".."), execute = promisify(execFile);
assert.equal(process.argv.length, 4);
const [relative, head] = process.argv.slice(2);
assert.match(relative, /^outputs\/reports\/[0-9TZ.-]+-mpeg2-production-runtime\.json$/);
assert.match(head, /^[a-f0-9]{40}$/);
const rawPath = path.join(root, relative), archivePath = rawPath + ".gz";
await assert.rejects(access(archivePath), { code: "ENOENT" });
const identity = await lstat(rawPath, { bigint: true });
assert.ok(identity.isFile() && !identity.isSymbolicLink() && identity.size > 0n && identity.size <= 32n * 1048576n);
assert.equal(await realpath(rawPath), rawPath);
const raw = await readFile(rawPath), report = JSON.parse(raw), sha = bytes => createHash("sha256").update(bytes).digest("hex");
const storageRecovery = Boolean(report.storageRecoveryQualification);
const uiBatch = Boolean(report.uiBatchQualification);
const fullOriginal = Boolean(report.originalQualification), expectedOutputCount = fullOriginal ? 1 : 2;
assert.ok(fullOriginal || raw.length <= 4 * 1048576);
const qualification = fullOriginal ? report.originalQualification : storageRecovery ? report.recoveryQualification : uiBatch ? report.uiBatchQualification : report.controlsQualification;
const receiptPath = path.join(root, "evidence", path.basename(relative).replace("-mpeg2-production-runtime.json",
  fullOriginal ? "-mpeg2-original-result.json" : storageRecovery ? "-mpeg2-storage-recovery-result.json" : uiBatch ? "-mpeg2-ui-batch-result.json" : "-mpeg2-controls-result.json"));
await assert.rejects(access(receiptPath), { code: "ENOENT" });
assert.equal(report.publicAcceptance, false); assert.ok(qualification);
assert.ok(report.status === "failed" || report.status === "passed-small-allocation-diagnostic-not-route-promotion" ||
  (fullOriginal && report.status === "passed-one-full-original-production-attempt-not-repeat-stress-or-public-acceptance"));
assert.equal(report.protectedOriginalUnchanged, true); assert.equal(report.cleanup.allOwnedProcessesAbsent, true);
assert.equal(report.cleanup.disposableOutputDeleted, true);
const sourceEntries = Object.entries(report.sources); assert.ok(sourceEntries.length > 0 && sourceEntries.length <= 128);
for (const [file, hash] of sourceEntries) {
  assert.ok(/^(?:workers\/|lib\/|scripts\/|app\/)/.test(file) && !file.includes(".."));
  const result = await execute("git", ["show", `${head}:${file}`], { cwd: root, windowsHide: true, timeout: 30000, maxBuffer: 2 * 1048576, encoding: "buffer" });
  assert.equal(sha(result.stdout), hash, `Recorded source must match executed historical head: ${file}`);
}
for (const entry of report.native) assert.equal(sha(await readFile(path.join(root, entry.source))), entry.sha256);
const independentCleanup = [];
for (const observation of report.cleanup.processObservations) {
  const result = await observeOwnedProcessExit(observation.identity); assert.equal(result.status, "owned-identity-absent"); independentCleanup.push(result);
}
for (const directory of [report.cleanup.scratchRemoved, ...report.cleanup.generatedDirectoriesRemoved]) {
  const target = path.resolve(root, directory);
  assert.ok(target.startsWith(path.join(root, "work") + path.sep) || target.startsWith(path.join(root, "dist/client/engines") + path.sep));
  await assert.rejects(access(target), { code: "ENOENT" });
}
const completed = fullOriginal ? qualification.output ? [{ name: "complete-test.mkv-current-production", conversion: report.conversion,
  actualNativeSettings: report.conversion.metrics.mpeg2EncoderSettings, output: qualification.output }] : [] : storageRecovery ? qualification.cases.filter(c => c.independentOutput).map(c => ({ name: c.name, conversion: c.result,
  actualNativeSettings: c.result.metrics.mpeg2EncoderSettings, output: c.independentOutput })) : uiBatch ? qualification.outputs.map(output => ({ name: output.name,
  conversion: report.conversion, actualNativeSettings: report.conversion.metrics.mpeg2EncoderSettings, output })) : qualification.cases;
assert.ok(Array.isArray(completed) && completed.length <= 2);
for (const entry of completed) {
  assert.equal(entry.conversion.type, "complete"); assert.ok(entry.output.bytes > 0);
  assert.ok(entry.output.ssim >= 0.98); assert.equal(entry.output.fullNativeDecodePassed, true);
  assert.ok(entry.output.videoClocks.maximumVideoPtsErrorSeconds < 0.001);
}
if (report.status === "failed") {
  assert.ok(report.failures.length > 0);
  // Valid files can still fail the whole-browser memory gate. Never turn a
  // content-complete/memory-failed run into either no conversion or acceptance.
  // A visual assertion may fail after every storage case but before the final
  // completion marker. Preserve that false marker, never fabricate acceptance.
  if (storageRecovery) assert.ok(!qualification.completed || completed.length === 2);
  else assert.equal(qualification.completed, completed.length === expectedOutputCount);
}
else {
  assert.equal(qualification.completed, true); assert.equal(completed.length, expectedOutputCount); assert.deepEqual(report.failures, []);
  assert.ok(report.memory.incrementalPrivateMiB <= 250); assert.equal(report.executedSourcesAndBrowserPinsVerified, true);
  if (storageRecovery) {
    assert.equal(report.storageRecoveryQualification.completed, true);
    assert.equal(report.storageRecoveryQualification.faultInjection, true);
    assert.equal(report.storageRecoveryQualification.actualQuotaExhaustion, false);
    assert.equal(report.storageRecoveryQualification.actualOsPermissionRevocation, false);
    const cases = mpeg2StorageRecoveryCases(); assert.equal(qualification.cases.length, cases.length);
    for (const [index, entry] of qualification.cases.entries()) {
      assert.equal(entry.name, cases[index].name); assert.equal(entry.result.type, cases[index].expected);
      if (cases[index].testFault) { assertMpeg2StorageFailure(cases[index], entry); assert.equal(entry.terminalWorkerRetired, true); }
    }
  }
  if (uiBatch) {
    assert.equal(qualification.actualConvertButton, true); assert.equal(qualification.actualButtonEvidence.completedBatchItems, 2);
    assert.equal(qualification.nativeBatchItems.length, 2); assert.deepEqual(qualification.nativeBatchItems.map(i => i.index).sort(), [0, 1]);
    assert.equal(new Set(qualification.outputs.map(o => o.name.toLowerCase())).size, 2);
    assert.equal(qualification.nativeOsPickerCovered, false);
  }
}
let incompleteLosslessMemoryJournal = null;
if (fullOriginal && !report.losslessMemoryJournal && report.status === "failed") {
  const file = path.join(root, "output/playwright", report.startedAt.replaceAll(":", "-") + "-mpeg2-original-memory.ndjson");
  const info = await lstat(file, { bigint: true }).catch(error => { if (error.code !== "ENOENT") throw error; return null; });
  if (info) {
    assert.ok(info.isFile() && !info.isSymbolicLink() && info.size <= 8n * 1024n ** 3n); assert.equal(await realpath(file), file);
    const digest = createHash("sha256"); let bytes = 0;
    for await (const chunk of createReadStream(file, { highWaterMark: 65536 })) { bytes += chunk.length; digest.update(chunk); }
    assert.equal(bytes, Number(info.size));
    const rootPid = report.diagnosticMemorySamples.flatMap(s => s.processes ?? []).find(p => p.type === "browser")?.pid;
    assert.ok(Number.isSafeInteger(rootPid) && rootPid > 0);
    const partial = { file, rootPid, bytes, sha256: digest.digest("hex"), complete: false, conversionAcceptance: false,
      identity: Object.fromEntries(["dev", "ino", "birthtimeNs", "mtimeNs"].map(key => [key, String(info[key])])),
      records: null, summary: null, failure: "Observer coverage failed before journal finalization; preserve bytes, never claim complete sampling" };
    incompleteLosslessMemoryJournal = await compactLosslessNativeMemoryJournal(partial);
  }
}
const compressed = gzipSync(raw, { level: 9 });
await writeFile(archivePath, compressed, { flag: "wx" });
assert.deepEqual(gunzipSync(await readFile(archivePath), { maxOutputLength: (fullOriginal ? 32 : 4) * 1048576 }), raw);
const allocation = report.postMeasurementAllocators;
let allocationArchive = null;
if (allocation?.archive) {
  const target = path.resolve(root, allocation.archive.path);
  assert.ok(target.startsWith(path.join(root, "output/playwright") + path.sep));
  const packed = await readFile(target); assert.equal(packed.length, allocation.archive.bytes); assert.equal(sha(packed), allocation.archive.sha256);
  const restored = gunzipSync(packed, { maxOutputLength: 8 * 1048576 });
  assert.equal(restored.length, allocation.archive.restoredBytes); assert.equal(sha(restored), allocation.archive.restoredSha256);
  assert.equal(allocation.acceptanceMetric, false); assert.equal(allocation.perturbsMemory, true);
  allocationArchive = { ...allocation.archive, path: path.relative(root, target).replaceAll(path.sep, "/"), recordedAbsolutePath: allocation.archive.path };
}
let failureAllocationArchive = null;
if (report.failureMemoryAllocators?.archive) {
  const diagnostic = report.failureMemoryAllocators, record = diagnostic.archive, target = path.resolve(root, record.path);
  assert.ok(target.startsWith(path.join(root, "output/playwright") + path.sep));
  assert.equal(diagnostic.acceptanceMetric, false); assert.equal(diagnostic.perturbsMemory, true); assert.equal(diagnostic.allocationStackAttribution, false);
  const packed = await readFile(target); assert.equal(packed.length, record.bytes); assert.equal(sha(packed), record.sha256);
  const restored = gunzipSync(packed, { maxOutputLength: 8 * 1048576 }); assert.equal(restored.length, record.restoredBytes); assert.equal(sha(restored), record.restoredSha256);
  failureAllocationArchive = { ...record, path: path.relative(root, target).replaceAll(path.sep, "/"), recordedAbsolutePath: record.path };
}
const visual = report.boundedVisualObservation ?? null;
if (visual) {
  assert.ok(visual.maximumCaptures <= 7 && visual.captures.length <= visual.maximumCaptures && visual.attempts <= visual.maximumCaptures && visual.totalBytes <= 16 * 1048576);
  let bytes = 0;
  for (const capture of visual.captures) {
    const target = path.resolve(root, capture.file); assert.ok(target.startsWith(path.join(root, "output/playwright") + path.sep));
    const picture = await readFile(target); assert.equal(picture.length, capture.bytes); assert.equal(sha(picture), capture.sha256);
    assert.ok(picture.length <= 4 * 1048576); bytes += picture.length;
  }
  assert.equal(bytes, visual.totalBytes);
}
let independentlyRecomputedObservedMemory = null;
let losslessNativeJournalReplayVerified = false;
if (fullOriginal && report.losslessMemoryJournal?.complete !== false && report.losslessMemoryJournal) {
  const replay = await replayLosslessNativeMemoryJournal(report.losslessMemoryJournal);
  assert.equal(replay.verified, true); losslessNativeJournalReplayVerified = true;
  const peakPrivateBytes = Math.max(...replay.summary.native.phases.filter(p => p.phase !== "blank" && p.peak).map(p => p.peak[3]));
  assert.equal((peakPrivateBytes - report.blankBaseline.privateBytes) / 1048576, report.memory.incrementalPrivateMiB);
}
if (storageRecovery && report.diagnosticMemorySamples && report.blankBaseline) {
  const samples = report.diagnosticMemorySamples, valid = samples.filter(s => s.privateBytes !== null);
  assert.ok(samples.length > 0 && samples.length <= 3000);
  for (const sample of valid) assert.equal(sample.privateBytes, sample.processes.reduce((n, p) => n + p.privateBytes, 0));
  const active = valid.filter(s => s.phase !== "blank"); assert.ok(active.length > 0);
  const peak = active.reduce((a, b) => a.privateBytes > b.privateBytes ? a : b);
  independentlyRecomputedObservedMemory = { scope: "Recomputed from retained observations only; does not change failed run status or prove missing post-completion coverage",
    records: samples.length, validRecords: valid.length, unavailableRecords: samples.length - valid.length,
    unavailableConversionRecords: samples.filter(s => s.phase === "conversion" && s.privateBytes === null).length,
    blankPrivateBytes: report.blankBaseline.privateBytes, peakPrivateBytes: peak.privateBytes, peakPhase: peak.phase,
    incrementalPrivateMiB: (peak.privateBytes - report.blankBaseline.privateBytes) / 1048576,
    originalRunAccepted: report.status !== "failed" };
}
const receipt = { schemaVersion: 1, head, status: report.status, startedAt: report.startedAt, finishedAt: report.finishedAt,
  scope: fullOriginal ? "One exact full-original current-production attempt, including failures; not repeated stress, near10GB, OS-picker or public acceptance"
    : uiBatch ? "One real Convert-button two-file batch with duplicate source names and independently validated outputs; terminal metrics describe final item only; not large-file, OS-picker, all batch failures or public acceptance"
    : storageRecovery ? "Injected quota/permission failure after real native conversion and one bounded final write, followed by two validated retries; not actual OS revocation, disk exhaustion, UI button, scale or public acceptance"
    : report.uiControlsQualification
    ? "Actual private form controls and Convert-button production path; small fixture, not full UI/OS-picker/stress or public acceptance"
    : "Finite real production MPEG-2 controls gate, including failures; not UI-control, scale or public acceptance",
  archive: { path: relative + ".gz", bytes: compressed.length, sha256: sha(compressed), restoredBytes: raw.length, restoredSha256: sha(raw) },
  sourcePins: sourceEntries.length, recordedSourcesMatchHistoricalGitHead: true, native: report.native,
  scaledPropertiesBuild: report.scaledPropertiesBuild ?? null, fixture: report.fixture,
  uiControlsQualification: report.uiControlsQualification ?? null,
  uiQualification: report.uiQualification ?? null,
  uiBatchQualification: report.uiBatchQualification ?? null,
  originalQualification: report.originalQualification ?? null,
  losslessMemoryJournal: report.losslessMemoryJournal ?? null,
  losslessNativeJournalReplayVerified,
  incompleteLosslessMemoryJournal,
  recoveryQualification: report.recoveryQualification ?? null,
  storageRecoveryQualification: report.storageRecoveryQualification ?? null,
  observer: report.observer, diagnosticObserverOnly: report.observer.controlScope === "events-only observer comparison, not route promotion",
  boundedVisualObservation: visual,
  boundedVisibleProgressVerified: visual ? visual.captures.some(capture => capture.nativeProgressVisuallyInViewport === true) : false,
  postMeasurementAllocationArchive: allocationArchive,
  failureAllocationArchive,
  failureAllocationScope: report.failureMemoryAllocators ? { status: report.failureMemoryAllocators.status, acceptanceMetric: false,
    perturbsMemory: true, allocationStackAttribution: false, primaryGateHadAlreadyFailed: true } : null,
  postMeasurementAllocationScope: allocation ? { status: allocation.status, acceptanceMetric: allocation.acceptanceMetric,
    perturbsMemory: allocation.perturbsMemory, allocationStackAttribution: allocation.allocationStackAttribution } : null,
  completedCases: completed.map(entry => ({ name: entry.name, requested: entry.requested, reference: entry.reference,
    actualNativeSettings: entry.actualNativeSettings, output: entry.output })),
  completed: qualification.completed, overallGatePassed: report.status !== "failed", lastTerminal: { type: report.conversion?.type,
    message: report.conversion?.message ?? null, metrics: report.conversion?.metrics ?? null }, failures: report.failures,
  memory: report.memory ?? null, protectedOriginalUnchangedAtExecution: true, cleanup: report.cleanup,
  independentlyRecomputedObservedMemory,
  independentCleanup, publicAcceptance: false, speedComparison: false, rawLosslesslyRecoverable: true };
await writeFile(receiptPath, JSON.stringify(receipt, null, 2) + "\n", { flag: "wx" });
const current = await lstat(rawPath, { bigint: true });
for (const key of ["dev", "ino", "size", "mtimeNs"]) assert.equal(current[key], identity[key]);
assert.equal(sha(await readFile(rawPath)), sha(raw)); await unlink(rawPath);
console.log(JSON.stringify({ receipt: path.relative(root, receiptPath), status: report.status, validatedOutputs: completed.length,
  rawBytes: raw.length, archiveBytes: compressed.length, losslessReadbackVerified: true, rawRemoved: true, publicAcceptance: false }));
