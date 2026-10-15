// Independent actual source/build, packet/pixel/metadata, recovery and cleanup audit.
import assert from "node:assert/strict";
import { execFile } from "node:child_process";
import { createHash } from "node:crypto";
import { createReadStream } from "node:fs";
import { access, lstat, readFile, stat, unlink, writeFile } from "node:fs/promises";
import path from "node:path";
import { promisify } from "node:util";
import { gunzipSync } from "node:zlib";
import { sha, baselineBinding } from "./lib/stable-ui-headless-baseline-recipe.mjs";
import { inspectInstalledChromePin, assertInstalledChromePinsEqual } from "./lib/installed-chrome-pin.mjs";
import { verifyDurationEquivalenceReports } from "./lib/duration-drain-equivalence.mjs";
import { verifyHandoffBuildAndEvents } from "./lib/staged-handoff-evidence.mjs";
import { inspectEbmlMediaReport, ebmlMediaParts } from "./lib/staged-handoff-media-recipe.mjs";
const root = path.resolve(import.meta.dirname, ".."), read = file => readFile(path.join(root, file));
const [mediaPath, supplementPath] = process.argv.slice(2); assert.equal(process.argv.length, 4);
assert.match(mediaPath, /^evidence\/\d{4}-\d\d-\d\dT[\d-]+Z-staged-handoff-media\.json$/);
assert.match(supplementPath, /^evidence\/\d{4}-\d\d-\d\dT[\d-]+Z-staged-handoff-media-supplement\.json$/);
const output = mediaPath.replace("-media.json", "-independent-qualification.json");
await assert.rejects(access(path.join(root, output)), { code: "ENOENT" });
const mediaBytes = await read(mediaPath), media = JSON.parse(mediaBytes);
const supplementBytes = await read(supplementPath), supplement = JSON.parse(supplementBytes);
const controlPath = "evidence/2026-10-15T10-37-24-961Z-duration-drain-browser-control-executed-sources.json";
process.env.WITHIN_DURATION_DRAIN_CONTROL_RECEIPT = controlPath;
process.env.WITHIN_INSTALLED_CHROME_CONTROL_RECEIPT = "evidence/2026-10-14T15-33-36-401Z-installed-chrome-realloc-control-executed-sources.json";
const parts = await ebmlMediaParts(root);
assert.equal(media.failure, null); assert.equal(media.analysis.genuineValidatedConversions, 4);
assert.equal(supplement.failure, null); assert.equal(supplement.prepareOnly, false); assert.equal(supplement.ownedCallerAbsent, true);
async function unpack(record, maximum, json = true) {
  const zip = await read(record.path); assert.equal(zip.length, record.bytes); assert.equal(sha(zip), record.sha256);
  const raw = gunzipSync(zip, { maxOutputLength: maximum }); assert.equal(raw.length, record.restoredBytes);
  assert.equal(sha(raw), record.restoredSha256); return { raw, parsed: json ? JSON.parse(raw) : null };
}
const generated = (await unpack(media.generatedArchive, 8388608)).parsed;
const extra = (await unpack(supplement.archive, 2097152)).parsed;
for (const [receipt, archive, count, encoding] of [[media, generated, 255, "text"], [supplement, extra, 95, "base64"]]) {
  assert.equal(Object.keys(receipt.sourcePins).length, count); assert.deepEqual(receipt.sourcePins, receipt.postSourcePins);
  assert.deepEqual(archive.sourcePins, receipt.sourcePins);
  for (const [file, expected] of Object.entries(receipt.sourcePins)) {
    assert.equal(sha(encoding === "text" ? archive.sources[file] : Buffer.from(archive.preimages[file], "base64")), expected, file);
    assert.equal(sha(await read(file)), expected, file);
  }
}
assert.equal(supplement.distinctTotalFiles, 350); assert.equal(parts.native.envelope.sourceCount, 126);
assert.equal(supplement.supplemental.maximumFiles, 128); assert.equal(supplement.supplemental.maximumRestoredBytes, 2097152);
assert.equal(supplement.legacy.maximumFiles, 256); assert.equal(supplement.legacy.maximumRestoredBytes, 8388608);
const restored = await unpack(media.report.archive, 2097152), report = restored.parsed;
assert.equal(sha(restored.raw), media.report.sha256); assert.deepEqual(report.manifest, generated.generated.composition.manifest);
const analysis = await inspectEbmlMediaReport(report, JSON.parse(await read(media.baseline.path)).reports[0].report, JSON.parse(await read(media.build.path)));
assert.deepEqual(analysis, media.analysis);
const baselinePath = "evidence/2026-10-15T03-26-36-040Z-packet-order-baseline-media.json", baseline = JSON.parse(await read(baselinePath));
const equivalence = verifyDurationEquivalenceReports((await unpack(baseline.report.archive, 2097152)).parsed, report);
const buildPath = generated.generated.handoffLifecycle.buildProofPath, buildBytes = await read(buildPath), build = JSON.parse(buildBytes);
const buildArchive = (await unpack(build.sourceArchive, 2097152)).parsed;
assert.deepEqual(buildArchive.sourcePins, build.sourcePins);
for (const [file, expected] of Object.entries(build.sourcePins)) {
  assert.equal(sha(Buffer.from(buildArchive.preimages[file], "base64")), expected, file);
  assert.equal(sha(await read(file)), expected, file);
  const mediaHash = media.sourcePins[file] ?? supplement.sourcePins[file];
  if (mediaHash !== undefined) assert.equal(mediaHash, expected, file);
}
const buildOnlyFiles = Object.keys(build.sourcePins).filter(file => !Object.hasOwn(media.sourcePins, file) && !Object.hasOwn(supplement.sourcePins, file));
assert.equal(buildOnlyFiles.length, 6);
const distinctBuildAndMediaFiles = new Set([...Object.keys(media.sourcePins), ...Object.keys(supplement.sourcePins), ...Object.keys(build.sourcePins)]).size;
assert.equal(distinctBuildAndMediaFiles, 356);
for (const asset of build.assets) {
  const raw = (await unpack(asset.archive, 2097152, false)).raw;
  assert.equal(raw.length, asset.bytes); assert.equal(sha(raw), asset.sha256);
  if (asset.role === "save-worker") assert.equal(/WebAssembly\.(?:Memory|instantiate|compile)/.test(raw.toString()), false);
}
const handoff = verifyHandoffBuildAndEvents(build, generated.generated, report);
assertInstalledChromePinsEqual(media.browserPinBefore, media.browserPinAfter);
assertInstalledChromePinsEqual(media.browserPinBefore, parts.control.browserPinBefore);
assertInstalledChromePinsEqual(media.browserPinBefore, await inspectInstalledChromePin());
const runtimeVersions = report.rows.filter(row => row.kind === "actual-runtime-browser-version"); assert.equal(runtimeVersions.length, 4);
for (const record of runtimeVersions) assert.equal(record.version, media.browserPinBefore.version);
const journal = JSON.parse(await read(generated.generated.journaledFixture.cleanupPath));
assert.equal(journal.ownedDirectoryAbsent, true); assert.equal(journal.runnerAbsence.status, "owned-identity-absent");
for (const directory of [journal.record.directory, media.cleanup.ownedWrapper, media.cleanup.helpers.runtime])
  await assert.rejects(access(directory), { code: "ENOENT" });
assert.deepEqual(media.cleanup.newFixtureDirsRemaining, []);
assert.equal(media.cleanup.normalAppAndCssUnchanged, true); assert.equal(media.cleanup.privateAdditionsAbsent, true);
assert.equal(sha(await read("dist/client" + baselineBinding.url)), baselineBinding.sha256);
const identities = [...media.cleanup.helpers.launchRecords.map(row => row.identity), journal.record.registrationIdentity];
const sampled = new Map();
for (const row of report.rows.filter(row => row.memoryScope)) for (const sample of row.samples) for (const process of sample.processes ?? [])
  sampled.set(process.pid, { pid: process.pid, lastSampleAt: sample.timestamp });
const pids = [...new Set([...identities.map(row => row.pid), ...sampled.keys()])]; assert.ok(pids.length > 0 && pids.length <= 64);
const command = "$ErrorActionPreference='Stop'; $handoffProofPids=" + pids.join(",") + "; ConvertTo-Json -InputObject @(Get-CimInstance Win32_Process | Where-Object {$handoffProofPids -contains $_.ProcessId} | ForEach-Object {@{pid=[int]$_.ProcessId;createdAt=$_.CreationDate.ToUniversalTime().ToString('o')}}) -Compress";
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
const rawPath = path.resolve(root, media.report.path); assert.equal(path.dirname(rawPath), path.join(root, "output/playwright"));
const identity = await lstat(rawPath, { bigint: true }); assert.ok(identity.isFile() && !identity.isSymbolicLink());
assert.equal(sha(await readFile(rawPath)), sha(restored.raw));
const ownSources = {};
for (const file of ["scripts/verify-staged-handoff-media.mjs", "scripts/lib/staged-handoff-evidence.mjs", "tests/staged-handoff-evidence.test.mjs"]) {
  const bytes = await read(file); ownSources[file] = { sha256: sha(bytes), preimage: bytes.toString("base64") };
}
const checked = await lstat(rawPath, { bigint: true }); assert.equal(checked.dev, identity.dev); assert.equal(checked.ino, identity.ino);
assert.equal(sha(await readFile(rawPath)), sha(restored.raw)); await unlink(rawPath); await assert.rejects(access(rawPath), { code: "ENOENT" });
const result = { recordedAt: new Date().toISOString(), status: "private-handoff-four-production-conversions-exact-fidelity-and-recovery-qualified-not-memory-acceptance",
  media: { path: mediaPath, sha256: sha(mediaBytes) }, supplemental: { path: supplementPath, sha256: sha(supplementBytes) },
  build: { path: buildPath, sha256: sha(buildBytes) }, equivalence, handoff,
  sourceCounts: { native: 126, mediaLegacy: 255, mediaSupplemental: 95, totalMedia: 350,
    buildCaptured: 17, buildOnlyFiles, distinctBuildAndMediaFiles },
  allExecutedPreCurrentPostSourcePinsVerified: true, sourceCapsChanged: false,
  original: { bytes: 2958573265, sha256: originalSha256 }, browserPin: media.browserPinBefore,
  analysis, birthChecks, sampledPidChecks,
  removedRedundantRawJson: { path: media.report.path, bytes: restored.raw.length, sha256: sha(restored.raw), retainedLosslessArchive: media.report.archive },
  convertedOutputsProfilesAndFixturesRemoved: true, normalAssetsRestored: true, smallFixtureFidelityQualified: true,
  fullOriginalAcceptance: false, primaryMemoryAcceptance: false, speedGainProven: false, headedCoverageVerified: false, publicAcceptance: false, ownSources };
await writeFile(path.join(root, output), JSON.stringify(result, null, 2) + "\n", { flag: "wx" });
console.log(JSON.stringify({ output, sourceCount: distinctBuildAndMediaFiles, saveWorkersObserved: handoff.saveWorkersObserved,
  exactPacketComparisons: equivalence.comparisons.length, removedRawBytes: restored.raw.length, fullOriginalAcceptance: false }));
