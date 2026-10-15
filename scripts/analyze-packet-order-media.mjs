// Independent source/content/lifetime check. Records rejection; never rebaselines.
import assert from "node:assert/strict";
import { execFile } from "node:child_process";
import { createHash } from "node:crypto";
import { createReadStream } from "node:fs";
import { access, lstat, readFile, stat, unlink, writeFile } from "node:fs/promises";
import path from "node:path";
import { promisify } from "node:util";
import { gunzipSync } from "node:zlib";
import { sha } from "./lib/stable-ui-headless-baseline-recipe.mjs";
import { loadMvfMediaComponents } from "./lib/mvf-arena-media-recipe.mjs";
import { loadPacketDrainMediaComponents } from "./lib/packet-drain-media-recipe.mjs";
import { comparePacketOrderProofs } from "./lib/packet-order-comparison.mjs";
assert.equal(process.argv.length, 2);
const root = path.resolve(import.meta.dirname, ".."), read = file => readFile(path.join(root, file));
const output = "evidence/packet-drain-media-timing-rejection-2026-10-15.json";
await assert.rejects(access(path.join(root, output)), { code: "ENOENT" });
process.env.WITHIN_MVF_ARENA_CONTROL_RECEIPT = "evidence/2026-10-14T22-17-16-644Z-mvf-arena-browser-control-executed-sources.json";
process.env.WITHIN_PACKET_DRAIN_CONTROL_RECEIPT = "evidence/2026-10-15T03-05-18-782Z-packet-drain-browser-control-executed-sources.json";
const variants = [
  ["initial", "2026-10-15T03-15-14-905Z-packet-drain-media", "2026-10-15T03-15-14-897Z-packet-drain-media-supplement", 66],
  ["baseline", "2026-10-15T03-26-36-040Z-packet-order-baseline-media", "2026-10-15T03-26-36-033Z-packet-order-baseline-media-supplement", 48],
  ["candidate", "2026-10-15T03-31-11-318Z-packet-order-candidate-media", "2026-10-15T03-31-11-311Z-packet-order-candidate-media-supplement", 70],
];
async function restore(record, maximum) {
  const zip = await read(record.path); assert.equal(zip.length, record.bytes); assert.equal(sha(zip), record.sha256);
  const raw = gunzipSync(zip, { maxOutputLength: maximum }); assert.equal(raw.length, record.restoredBytes);
  assert.equal(sha(raw), record.restoredSha256); return { raw, parsed: JSON.parse(raw) };
}
const runs = [], identities = [], sampled = new Map(), rawToRemove = [];
for (const [variant, stamp, supplementalStamp, supplementalCount] of variants) {
  const mediaPath = `evidence/${stamp}.json`, mediaBytes = await read(mediaPath), media = JSON.parse(mediaBytes);
  const extraPath = `evidence/${supplementalStamp}.json`, extraBytes = await read(extraPath), extra = JSON.parse(extraBytes);
  assert.equal(media.failure, null); assert.equal(media.analysis.genuineValidatedConversions, 4);
  assert.equal(extra.failure, null); assert.equal(extra.prepareOnly, false); assert.equal(extra.ownedCallerAbsent, true);
  const legacy = (await restore(media.generatedArchive, 8388608)).parsed;
  const supplemental = (await restore(extra.archive, 2097152)).parsed;
  assert.equal(Object.keys(media.sourcePins).length, 255); assert.equal(Object.keys(extra.sourcePins).length, supplementalCount);
  for (const [receipt, archive, base64] of [[media, legacy, false], [extra, supplemental, true]]) {
    assert.deepEqual(receipt.sourcePins, receipt.postSourcePins); assert.deepEqual(archive.sourcePins, receipt.sourcePins);
    for (const [file, expected] of Object.entries(receipt.sourcePins)) {
      const preimage = base64 ? Buffer.from(archive.preimages[file], "base64") : archive.sources[file];
      assert.equal(sha(preimage), expected, file); assert.equal(sha(await read(file)), expected, file);
    }
  }
  const restored = await restore(media.report.archive, 2097152), report = restored.parsed;
  assert.equal(sha(restored.raw), media.report.sha256); assert.deepEqual(report.manifest, legacy.generated.composition.manifest);
  const components = await (variant === "baseline" ? loadMvfMediaComponents : loadPacketDrainMediaComponents)(root);
  const analysis = await components.inspectEbmlMediaReport(report, JSON.parse(await read(media.baseline.path)).reports[0].report,
    JSON.parse(await read(media.build.path)));
  assert.deepEqual(analysis, media.analysis);
  const outputs = report.rows.filter(row => (!row.kind && row.status === "passed") || row.kind === "independent-frame-diagnostic");
  assert.equal(outputs.length, 8);
  const expectedHash = variant === "baseline" ? "554cc84159d2e36f4fd2adb060062cf78be02d4195f7857ceefe0953065c5f27"
    : "d876da3ca237bb742dcf014b95b4e22d59e5be1e87ef7335f4727ee6586738c3";
  for (const row of outputs) {
    assert.equal(row.outputSha256, expectedHash); assert.equal(row.outputBytes, variant === "baseline" ? 2245558 : 2245626);
    assert.equal(row.sourceBytes, 4457906); assert.equal(row.metrics.peakWasmMemoryBytes, 50331648);
    assert.equal(row.metrics.queuedBytes, 0); assert.equal(row.metrics.pendingOperations, 0);
    assert.ok(row.metrics.peakPendingOperations <= 1 && row.metrics.peakQueuedBytes <= 524288);
  }
  assert.deepEqual(media.protectedPre, media.protectedPost);
  assert.equal(media.protectedPost.bytes, 2958573265);
  assert.equal(media.protectedPost.sha256, "31f36695b5b44c62125a9e4264e84dc085accd21c02cc3487aae597f54b9db34");
  assert.equal(media.cleanup.normalAppAndCssUnchanged, true); assert.equal(media.cleanup.privateAdditionsAbsent, true);
  assert.deepEqual(media.cleanup.newFixtureDirsRemaining, []);
  const journal = JSON.parse(await read(legacy.generated.journaledFixture.cleanupPath));
  assert.equal(journal.ownedDirectoryAbsent, true); assert.equal(journal.runnerAbsence.status, "owned-identity-absent");
  identities.push(...media.cleanup.helpers.launchRecords.map(row => row.identity), journal.record.registrationIdentity);
  for (const directory of [journal.record.directory, media.cleanup.ownedWrapper, media.cleanup.helpers.runtime])
    await assert.rejects(access(directory), { code: "ENOENT" });
  const runSampled = new Set();
  for (const row of report.rows.filter(row => row.memoryScope)) for (const sample of row.samples) for (const process of sample.processes ?? []) {
    runSampled.add(process.pid); sampled.set(process.pid, { pid: process.pid, lastSampleAt: sample.timestamp });
  }
  assert.ok(runSampled.size <= 64);
  for (const [file, hash] of Object.entries(media.cleanup.restored)) for (const directory of ["public", "dist/client"])
    assert.equal(sha(await read(`${directory}/engines/remux/${file}`)), hash);
  const target = path.resolve(root, media.report.path);
  assert.equal(path.dirname(target), path.join(root, "output/playwright"));
  const identity = await lstat(target, { bigint: true }); assert.ok(identity.isFile() && !identity.isSymbolicLink());
  assert.equal(sha(await readFile(target)), sha(restored.raw));
  rawToRemove.push({ target, identity, sha256: sha(restored.raw), bytes: restored.raw.length, archive: media.report.archive });
  runs.push({ variant, mediaPath, mediaSha256: sha(mediaBytes), supplementalPath: extraPath, supplementalSha256: sha(extraBytes),
    sourceCounts: { legacy: 255, supplemental: supplementalCount, distinct: extra.distinctTotalFiles },
    report, outputHash: expectedHash, analysis });
}
const proofRows = variant => runs.find(run => run.variant === variant).report.rows.filter(row => row.kind === "independent-packet-order-proof");
const baselineProofs = proofRows("baseline"), candidateProofs = proofRows("candidate");
assert.equal(baselineProofs.length, 4); assert.equal(candidateProofs.length, 4);
const comparisons = baselineProofs.map((baseline, index) => comparePacketOrderProofs(baseline, candidateProofs[index]));
for (const comparison of comparisons) {
  assert.equal(comparison.packetsPerVariant, 475); assert.equal(comparison.allPayloadHashesAndSizesMatch, true);
  assert.equal(comparison.completeDecodedVideoMatches, true); assert.equal(comparison.exactlyEquivalentApartFromFilePositions, false);
  assert.equal(comparison.packetTimingPreservationPassed, false); assert.equal(comparison.outputSizeDelta, 68);
  assert.equal(comparison.packetFieldChangesExceptFilePositions.length, 8);
}
const baselineRows = runs.find(run => run.variant === "baseline").report.rows;
const candidateRows = runs.find(run => run.variant === "candidate").report.rows;
for (const kind of ["attached-picture-preservation", "exact-stream-title-mapping", "independent-decoded-audio", "independent-copied-audio-timeline"])
  assert.deepEqual(baselineRows.filter(row => row.kind === kind), candidateRows.filter(row => row.kind === kind), kind);
// One read-only process query, preserving the original per-run64-PID scope cap.
const unique = [...new Map(identities.map(identity => [`${identity.pid}/${identity.createdAt}`, identity])).values()];
const pids = [...new Set([...unique.map(identity => identity.pid), ...sampled.keys()])];
assert.ok(unique.length <= 64); assert.ok(pids.length <= variants.length * 64);
const command = "$ErrorActionPreference='Stop'; $packetProofPids=" + pids.join(",") + "; ConvertTo-Json -InputObject @(Get-CimInstance Win32_Process | Where-Object {$packetProofPids -contains $_.ProcessId} | ForEach-Object {@{pid=[int]$_.ProcessId;createdAt=$_.CreationDate.ToUniversalTime().ToString('o')}}) -Compress";
const observed = await promisify(execFile)("powershell.exe", ["-NoProfile", "-NonInteractive", "-EncodedCommand", Buffer.from(command, "utf16le").toString("base64")],
  { cwd: root, windowsHide: true, timeout: 15000, maxBuffer: 131072 });
const current = JSON.parse(observed.stdout);
const birthChecks = unique.map(identity => { const now = current.find(row => row.pid === identity.pid) ?? null;
  assert.ok(now === null || Math.abs(Date.parse(now.createdAt) - Date.parse(identity.createdAt)) >= 1);
  return { identity, current: now, ownedBirthAbsent: true }; });
const sampledPidChecks = [...sampled.values()].map(sample => { const now = current.find(row => row.pid === sample.pid) ?? null;
  assert.ok(now === null || Date.parse(now.createdAt) > Date.parse(sample.lastSampleAt));
  return { ...sample, current: now, sampledProcessGone: true, birthWasNotRecordedInConversionSample: true }; });
const original = path.join(root, "test.mkv"); assert.equal((await stat(original)).size, 2958573265);
const digest = createHash("sha256"); for await (const chunk of createReadStream(original, { highWaterMark: 1048576 })) digest.update(chunk);
const originalSha256 = digest.digest("hex"); assert.equal(originalSha256, "31f36695b5b44c62125a9e4264e84dc085accd21c02cc3487aae597f54b9db34");
const ownFiles = ["scripts/analyze-packet-order-media.mjs", "scripts/lib/packet-order-comparison.mjs"];
const ownSources = {};
for (const file of ownFiles) { const bytes = await read(file); ownSources[file] = { sha256: sha(bytes), preimage: bytes.toString("base64") }; }
for (const record of rawToRemove) {
  const now = await lstat(record.target, { bigint: true }); assert.equal(now.dev, record.identity.dev); assert.equal(now.ino, record.identity.ino);
  assert.equal(sha(await readFile(record.target)), record.sha256); await unlink(record.target);
  await assert.rejects(access(record.target), { code: "ENOENT" });
}
const value = { recordedAt: new Date().toISOString(), status: "genuine-small-media-passed-but-exact-packet-timing-regression-rejected",
  runs: runs.map(({ report, ...run }) => ({ ...run, additionalPacketProofs: report.rows.filter(row => row.kind === "independent-packet-order-proof").length })),
  comparisons, allTwelveGenuineConversionsPassedExistingGates: true, independentExactTimingGatePassed: false,
  allEncodedPacketPayloadsMatchAcrossPair: true, completeDecodedVideoHashesMatch: true, copiedAudioArtworkTitlesAndTimingMatch: true,
  observedVideoDurationTicks: { baseline: 64000, candidate: 64002, timeBase: "1/16000", addedMicroseconds: 125 },
  candidateAccepted: false, historicalGoldenChanged: false, qualityOrTimingThresholdRelaxed: false,
  birthChecks, sampledPidChecks, original: { bytes: 2958573265, sha256: originalSha256 },
  removedRedundantRawJson: rawToRemove.map(record => ({ path: path.relative(root, record.target).replaceAll("\\", "/"), bytes: record.bytes, sha256: record.sha256, retainedLosslessArchive: record.archive })),
  allRecordedPreCurrentPostSourcePinsVerified: true, convertedOutputsProfilesAndFixturesRemoved: true, normalAssetsRestored: true,
  fullOriginalCompleted: false, primaryIncrementalPrivateMiB: null, memoryAcceptance: false, speedGainProven: false,
  headedCoverageVerified: false, publicAcceptance: false, ownSources,
  sourceInformedHypothesisNotRuntimeAttribution: "Fragmented MOV last-sample duration/endpoint rounding loses next-packet lookahead when interleaver is drained; test exact rescaled CFR boundaries before a changed native attempt.",
  nextAction: "Prepare a new private duration-exact drain derivative with real rational-boundary and pinned native tests; preserve all encoded content, timestamps, reference, heap, fidelity and cleanup gates. Do not rerun this unchanged candidate on the original." };
await writeFile(path.join(root, output), JSON.stringify(value, null, 2) + "\n", { flag: "wx" });
console.log(JSON.stringify({ output, status: value.status, comparisons: comparisons.length, timingFieldChanges: comparisons[0].packetFieldChangesExceptFilePositions,
  births: birthChecks.length, sampledPids: sampledPidChecks.length, redundantRawBytesRemoved: rawToRemove.reduce((sum, record) => sum + record.bytes, 0) }));
