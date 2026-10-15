// Independent actual-native/control/source/packet/metadata/cleanup qualification.
import assert from "node:assert/strict";
import { execFile } from "node:child_process";
import { createHash } from "node:crypto";
import { createReadStream } from "node:fs";
import { access, lstat, readFile, stat, unlink, writeFile } from "node:fs/promises";
import path from "node:path";
import { promisify } from "node:util";
import { gunzipSync } from "node:zlib";
import { sha } from "./lib/stable-ui-headless-baseline-recipe.mjs";
import { inspectInstalledChromePin, assertInstalledChromePinsEqual } from "./lib/installed-chrome-pin.mjs";
import { createOwnedRuntimeScratch } from "./lib/owned-runtime-scratch.mjs";
import { loadDurationDrainMediaComponents } from "./lib/duration-drain-media-recipe.mjs";
import { verifyDurationEquivalenceReports } from "./lib/duration-drain-equivalence.mjs";
assert.equal(process.argv.length, 2);
const root = path.resolve(import.meta.dirname, ".."), read = file => readFile(path.join(root, file));
const output = "evidence/2026-10-15T10-41-15-440Z-duration-drain-independent-qualification.json";
await assert.rejects(access(path.join(root, output)), { code: "ENOENT" });
const mediaPath = "evidence/2026-10-15T10-41-15-440Z-duration-drain-media.json", mediaBytes = await read(mediaPath), media = JSON.parse(mediaBytes);
const supplementPath = "evidence/2026-10-15T10-41-15-429Z-duration-drain-media-supplement.json", supplementBytes = await read(supplementPath), supplement = JSON.parse(supplementBytes);
const controlPath = "evidence/2026-10-15T10-37-24-961Z-duration-drain-browser-control-executed-sources.json", controlBytes = await read(controlPath), control = JSON.parse(controlBytes);
process.env.WITHIN_DURATION_DRAIN_CONTROL_RECEIPT = controlPath;
const baselinePath = "evidence/2026-10-15T03-26-36-040Z-packet-order-baseline-media.json", baselineBytes = await read(baselinePath), baseline = JSON.parse(baselineBytes);
const components = await loadDurationDrainMediaComponents(root), parts = await components.ebmlMediaParts(root);
assert.equal(media.failure, null); assert.equal(media.analysis.genuineValidatedConversions, 4);
assert.equal(supplement.failure, null); assert.equal(supplement.prepareOnly, false); assert.equal(supplement.ownedCallerAbsent, true);
assert.equal(control.failure, null); assert.deepEqual(control.nativeEnvelope, control.nativeEnvelopePost);
assert.deepEqual(control.nativeEnvelope, parts.native.envelope);
async function unpack(record, maximum) {
  const zip = await read(record.path); assert.equal(zip.length, record.bytes); assert.equal(sha(zip), record.sha256);
  const raw = gunzipSync(zip, { maxOutputLength: maximum }); assert.equal(raw.length, record.restoredBytes);
  assert.equal(sha(raw), record.restoredSha256); return { raw, parsed: JSON.parse(raw) };
}
const generated = (await unpack(media.generatedArchive, 8388608)).parsed;
const extra = (await unpack(supplement.archive, 2097152)).parsed;
const controlArchive = (await unpack(control.archive, 2097152)).parsed;
for (const [receipt, archive, count, encoding] of [[media, generated, 255, "text"], [supplement, extra, 83, "base64"], [control, controlArchive, 44, "base64"]]) {
  assert.equal(Object.keys(receipt.sourcePins).length, count); assert.deepEqual(receipt.sourcePins, receipt.postSourcePins);
  assert.deepEqual(archive.sourcePins, receipt.sourcePins);
  for (const [file, expected] of Object.entries(receipt.sourcePins)) {
    assert.equal(sha(encoding === "text" ? archive.sources[file] : Buffer.from(archive.preimages[file], "base64")), expected, file);
    assert.equal(sha(await read(file)), expected, file);
  }
}
assert.equal(supplement.distinctTotalFiles, 338); assert.equal(parts.native.envelope.sourceCount, 126);
assert.equal(control.sourceSealScopes.distinctTotalFiles, 168);
assert.equal(supplement.supplemental.maximumFiles, 128); assert.equal(supplement.supplemental.maximumRestoredBytes, 2097152);
assert.equal(supplement.legacy.maximumFiles, 256); assert.equal(supplement.legacy.maximumRestoredBytes, 8388608);
const restored = await unpack(media.report.archive, 2097152), report = restored.parsed;
assert.equal(sha(restored.raw), media.report.sha256); assert.deepEqual(report.manifest, generated.generated.composition.manifest);
const analysis = await components.inspectEbmlMediaReport(report, JSON.parse(await read(media.baseline.path)).reports[0].report, JSON.parse(await read(media.build.path)));
assert.deepEqual(analysis, media.analysis);
const baselineReport = (await unpack(baseline.report.archive, 2097152)).parsed;
const equivalence = verifyDurationEquivalenceReports(baselineReport, report);
const rejected = JSON.parse(await read("evidence/packet-drain-media-timing-rejection-2026-10-15.json"));
assert.equal(rejected.independentExactTimingGatePassed, false); assert.equal(rejected.candidateAccepted, false);
const runtimeVersions = report.rows.filter(row => row.kind === "actual-runtime-browser-version");
assert.equal(runtimeVersions.length, 4);
for (const record of runtimeVersions) assert.equal(record.version, media.browserPinBefore.version);
assertInstalledChromePinsEqual(media.browserPinBefore, media.browserPinAfter);
assertInstalledChromePinsEqual(control.browserPinBefore, control.browserPinAfter);
assertInstalledChromePinsEqual(media.browserPinBefore, control.browserPinBefore);
assertInstalledChromePinsEqual(media.browserPinBefore, await inspectInstalledChromePin());
const controlProof = JSON.parse(await read(control.proof.path)); assert.equal(sha(await read(control.proof.path)), control.proof.sha256);
assert.equal(controlProof.cleanup.allSampledNativeBirthsAbsent, true); assert.equal(controlProof.cleanup.runtimeProfileRemoved, true);
assert.equal(controlProof.result.terminal.originalCalls, 1); assert.equal(controlProof.result.terminal.emitted.validatedScalarWords, 16);
assert.equal(controlProof.result.terminal.emitted.allocatorFreeBlocks.headerWordsRead, 44);
assert.equal(controlProof.exportOnlyControl.onlyExportSectionChanged, true);
assert.equal(controlProof.exportOnlyControl.allCodeDataTypesImportsTablesMemoryExact, true);
assert.equal(controlProof.exportOnlyControl.usableForMediaOrAcceptance, false);
const journal = JSON.parse(await read(generated.generated.journaledFixture.cleanupPath));
assert.equal(journal.ownedDirectoryAbsent, true); assert.equal(journal.runnerAbsence.status, "owned-identity-absent");
for (const directory of [journal.record.directory, media.cleanup.ownedWrapper, media.cleanup.helpers.runtime, control.ownedCaller, controlProof.runtimeDirectory])
  await assert.rejects(access(directory), { code: "ENOENT" });
assert.deepEqual(media.cleanup.newFixtureDirsRemaining, []);
assert.equal(media.cleanup.normalAppAndCssUnchanged, true); assert.equal(media.cleanup.privateAdditionsAbsent, true);
const identities = [...controlProof.nativeIdentities, ...media.cleanup.helpers.launchRecords.map(row => row.identity), journal.record.registrationIdentity];
const sampled = new Map();
for (const row of report.rows.filter(row => row.memoryScope)) for (const sample of row.samples) for (const process of sample.processes ?? [])
  sampled.set(process.pid, { pid: process.pid, lastSampleAt: sample.timestamp });
const pids = [...new Set([...identities.map(row => row.pid), ...sampled.keys()])]; assert.ok(pids.length <= 64);
const command = "$ErrorActionPreference='Stop'; $durationProofPids=" + pids.join(",") + "; ConvertTo-Json -InputObject @(Get-CimInstance Win32_Process | Where-Object {$durationProofPids -contains $_.ProcessId} | ForEach-Object {@{pid=[int]$_.ProcessId;createdAt=$_.CreationDate.ToUniversalTime().ToString('o')}}) -Compress";
const observed = await promisify(execFile)("powershell.exe", ["-NoProfile", "-NonInteractive", "-EncodedCommand", Buffer.from(command, "utf16le").toString("base64")],
  { cwd: root, windowsHide: true, timeout: 15000, maxBuffer: 131072 });
const current = JSON.parse(observed.stdout);
const birthChecks = identities.map(identity => { const now = current.find(row => row.pid === identity.pid) ?? null;
  assert.ok(now === null || Math.abs(Date.parse(now.createdAt) - Date.parse(identity.createdAt)) >= 1);
  return { identity, current: now, ownedBirthAbsent: true }; });
const sampledPidChecks = [...sampled.values()].map(sample => { const now = current.find(row => row.pid === sample.pid) ?? null;
  assert.ok(now === null || Date.parse(now.createdAt) > Date.parse(sample.lastSampleAt));
  return { ...sample, current: now, sampledProcessGone: true, birthWasNotRecordedInConversionSample: true }; });
for (const [file, hash] of Object.entries(media.cleanup.restored)) for (const directory of ["public", "dist/client"])
  assert.equal(sha(await read(`${directory}/engines/remux/${file}`)), hash);
const original = path.join(root, "test.mkv"); assert.equal((await stat(original)).size, 2958573265);
const digest = createHash("sha256"); for await (const chunk of createReadStream(original, { highWaterMark: 1048576 })) digest.update(chunk);
const originalSha256 = digest.digest("hex"); assert.equal(originalSha256, "31f36695b5b44c62125a9e4264e84dc085accd21c02cc3487aae597f54b9db34");
assert.deepEqual(media.protectedPre, media.protectedPost); assert.equal(media.protectedPost.sha256, originalSha256);
const nativeBuild = parts.native.build;
assert.equal(nativeBuild.files.length, 20);
for (const file of nativeBuild.files) assert.equal(sha(await read(`work/mpeg2-duration-drain-38678806473/${file.file}`)), file.sha256);
const runtime = await createOwnedRuntimeScratch("duration-drain-independent-"), execute = promisify(execFile);
let artifactBefore, artifactAfter;
try {
  const repo = "tanishqbaweja/fileconverter", gh = "D:/Program Files/GitHub CLI/gh.exe";
  const call = async args => (await execute(gh, args, { cwd: root, env: runtime.env, windowsHide: true, timeout: 60000, maxBuffer: 1048576 })).stdout;
  artifactBefore = JSON.parse(await call(["api", `repos/${repo}/actions/runs/38678806473/artifacts`]));
  assert.equal(artifactBefore.total_count, 1); assert.equal(artifactBefore.artifacts[0].id, nativeBuild.artifact.id);
  assert.equal(artifactBefore.artifacts[0].workflow_run.head_sha, nativeBuild.run.headSha);
  await call(["api", "--method", "DELETE", `repos/${repo}/actions/artifacts/${nativeBuild.artifact.id}`]);
  artifactAfter = JSON.parse(await call(["api", `repos/${repo}/actions/runs/38678806473/artifacts`])); assert.equal(artifactAfter.total_count, 0);
} finally { await runtime.close(); await assert.rejects(access(runtime.directory), { code: "ENOENT" }); }
const rawPath = path.resolve(root, media.report.path); assert.equal(path.dirname(rawPath), path.join(root, "output/playwright"));
const identity = await lstat(rawPath, { bigint: true }); assert.ok(identity.isFile() && !identity.isSymbolicLink());
assert.equal(sha(await readFile(rawPath)), sha(restored.raw));
const ownSources = {};
for (const file of ["scripts/verify-duration-drain-media.mjs", "scripts/lib/duration-drain-equivalence.mjs"]) {
  const bytes = await read(file); ownSources[file] = { sha256: sha(bytes), preimage: bytes.toString("base64") };
}
const checked = await lstat(rawPath, { bigint: true }); assert.equal(checked.dev, identity.dev); assert.equal(checked.ino, identity.ino);
assert.equal(sha(await readFile(rawPath)), sha(restored.raw)); await unlink(rawPath); await assert.rejects(access(rawPath), { code: "ENOENT" });
const result = { recordedAt: new Date().toISOString(), status: "four-production-browser-conversions-packet-exact-and-recovery-qualified-not-full-acceptance",
  media: { path: mediaPath, sha256: sha(mediaBytes) }, supplemental: { path: supplementPath, sha256: sha(supplementBytes) },
  control: { path: controlPath, sha256: sha(controlBytes) }, baseline: { path: baselinePath, sha256: sha(baselineBytes) },
  equivalence, sourceCounts: { native: 126, browserControl: 44, totalControl: 168, mediaLegacy: 255, mediaSupplemental: 83, totalMedia: 338 },
  allExecutedPreCurrentPostSourcePinsVerified: true, sourceCapsChanged: false, original: { bytes: 2958573265, sha256: originalSha256 },
  nativeBoundaryUnit: parts.native.build.manifest.packetDurationBoundary.actualWasmUnit,
  browserPin: media.browserPinBefore, analysis, birthChecks, sampledPidChecks,
  removedRedundantRawJson: { path: media.report.path, bytes: restored.raw.length, sha256: sha(restored.raw), retainedLosslessArchive: media.report.archive },
  deletedHostedArtifact: artifactBefore.artifacts[0].id, remainingHostedArtifacts: artifactAfter.total_count,
  allTwentyLocalToolsVerifiedAndRetained: true, localToolBytes: nativeBuild.reusableToolBytes,
  retentionReason: "Changed small private candidate needed for full-original stress qualification; remove when superseded.",
  independentRuntimeRemoved: true, convertedOutputsProfilesAndFixturesRemoved: true, normalAssetsRestored: true,
  smallFixtureFidelityQualified: true, historicalGoldenModified: false, rejectedPriorCandidateStillRejected: true,
  fullOriginalAcceptance: false, primaryIncrementalPrivateMiB: null, primaryMemoryAcceptance: false, speedGainProven: false,
  headedCoverageVerified: false, publicAcceptance: false, ownSources };
await writeFile(path.join(root, output), JSON.stringify(result, null, 2) + "\n", { flag: "wx" });
console.log(JSON.stringify({ output, exactPacketComparisons: equivalence.comparisons.length, sourceCount: 338,
  births: birthChecks.length, sampledPids: sampledPidChecks.length, removedRawBytes: restored.raw.length,
  remainingHostedArtifacts: artifactAfter.total_count, fullOriginalAcceptance: false }));
