// Recover only the exact terminal crash. Never infer completed jobs from a
// partial file or manufacture a lost final conversion/memory report.
import "./lib/reliable-readonly-preflight.mjs";
import assert from "node:assert/strict";
import { execFile } from "node:child_process";
import { createHash } from "node:crypto";
import { createReadStream } from "node:fs";
import { access, lstat, readFile, readdir, realpath, rm, writeFile } from "node:fs/promises";
import path from "node:path";
import { promisify } from "node:util";
import { gzipSync, gunzipSync } from "node:zlib";
import { materializeUpdatedFullArchive } from "./lib/recorded-timeline-full-sources.mjs";
import { sha, baselineBinding } from "./lib/stable-ui-headless-baseline-recipe.mjs";
const root = path.resolve(import.meta.dirname, ".."), read = file => readFile(path.resolve(root, file));
const terminalPath = "evidence/2026-10-17T22-19-32-731Z-jspi-control-terminal.json", terminalBytes = await read(terminalPath), terminal = JSON.parse(terminalBytes);
assert.equal(terminal.status, "failed-not-accepted"); assert.equal(terminal.report, null); assert.deepEqual(terminal.cleanupErrors, []);
assert.equal(terminal.driverExit.code, 1);
const stderr = Buffer.from(terminal.stderr.tailBase64, "base64").toString(); assert.ok(stderr.includes("assert.ok(progressProbe.handoffWorkerEvents.length<32)"));
for (const key of ["productionRestored", "candidateRemoved", "wrapperRemoved"]) assert.equal(terminal[key], true);
const archive = await materializeUpdatedFullArchive(root, terminal.sourceArchive);
assert.equal(Object.keys(archive.pins).length, 829); assert.deepEqual(archive.pins, terminal.sourcePins); assert.deepEqual(archive.pins, terminal.postSourcePins);
for (const [file, digest] of Object.entries(archive.pins)) assert.equal(sha(await read(file)), digest, file);
const checkpointPath = "outputs/reports/2026-10-17T22-20-22-628Z-private-mpeg2-updated-chrome-full-native-100ms-native-checkpoint.json";
const checkpointBytes = await read(checkpointPath), checkpoint = JSON.parse(checkpointBytes);
const journalPath = "outputs/reports/2026-10-17T22-20-22-628Z-private-mpeg2-updated-chrome-full-native-100ms-launches.json";
const journalBytes = await read(journalPath), journal = JSON.parse(journalBytes);
assert.equal(journal.driverIdentity.pid, terminal.driverIdentity.pid); assert.equal(journal.wrapperDirectory, terminal.wrapper);
const runtime = path.join(root, "work/allocation-attempt-full-runtime-nFVaja"), fixture = path.join(root, "work/completed-save-fixture-2ymUsf");
assert.equal(journal.runtimeDirectory, runtime); assert.ok(terminal.treeCleanupAudit.paths.includes(runtime));
const identities = {};
for (const directory of [runtime, fixture]) {
  assert.equal(path.dirname(directory), path.join(root, "work")); assert.equal(await realpath(directory), directory);
  const info = await lstat(directory, { bigint: true }); assert.ok(info.isDirectory() && !info.isSymbolicLink()); identities[directory] = info;
  assert.ok(Number(info.birthtimeMs) > Date.parse(terminal.driverIdentity.createdAt));
}
assert.ok(Math.abs(Number(identities[runtime].birthtimeMs - identities[fixture].birthtimeMs)) < 1000);
const names = (await readdir(fixture)).sort(); assert.deepEqual(names, ["artwork.png", "cancel.mkv", "chapters.ffmetadata", "hevc.mkv", "result.mp4"]);
const fixtureFiles = [];
for (const name of names) {
  const file = path.join(fixture, name), info = await lstat(file); assert.ok(info.isFile() && !info.isSymbolicLink());
  assert.ok(info.size > 0 && info.size <= 16 * 1024 ** 2); fixtureFiles.push({ name, bytes: info.size });
}
assert.equal(fixtureFiles.find(row => row.name === "result.mp4").bytes, 131072);
assert.ok((await readFile(path.join(fixture, "chapters.ffmetadata"), "utf8")).includes("MPEG-2 café — 音楽"));
const moduleZip = await read("outputs/reports/2026-10-17T22-20-22-628Z-private-mpeg2-updated-chrome-full-native-100ms-warm-cache-module.mjs.gz");
const moduleSource = gunzipSync(moduleZip, { maxOutputLength: 262144 }).toString(); assert.ok(moduleSource.includes('createOwnedRuntimeScratch("completed-save-fixture-")'));
const command = "ConvertTo-Json -InputObject @(Get-CimInstance Win32_Process | ForEach-Object {@{pid=[int]$_.ProcessId;createdAt=$_.CreationDate.ToUniversalTime().ToString('o');commandLine=$_.CommandLine}}) -Compress";
const { stdout } = await promisify(execFile)("powershell.exe", ["-NoProfile", "-NonInteractive", "-Command", command], { windowsHide: true, timeout: 15000, maxBuffer: 2097152 });
const current = JSON.parse(stdout), births = terminal.treeCleanupAudit.recordedBirths.map(identity => {
  const live = current.find(row => row.pid === identity.pid); assert.ok(!live || Math.abs(Date.parse(live.createdAt) - Date.parse(identity.createdAt)) > 1);
  return { identity, ownedBirthAbsent: true, reusedPidUnchanged: Boolean(live) };
});
for (const row of current) assert.ok(![runtime, fixture, terminal.wrapper, terminal.candidateDirectory].some(directory => row.commandLine?.toLowerCase().includes(directory.toLowerCase())));
assert.equal(sha(await read("dist/client" + baselineBinding.url)), baselineBinding.sha256);
assert.equal(sha(await read("dist/client/assets/index-CIzbeB0A.css")), "f78f673c089ceb0dcfd1a885ff03e2a43984d851cfbe1d915e9a773a45c747dd");
const original = path.join(root, "test.mkv"), originalStat = await lstat(original); assert.equal(originalStat.size, 2958573265);
const hash = createHash("sha256"); for await (const chunk of createReadStream(original, { highWaterMark: 1048576 })) hash.update(chunk);
const originalSha256 = hash.digest("hex"); assert.equal(originalSha256, terminal.protectedAfter.sha256);
const compressed = gzipSync(checkpointBytes, { level: 9 }); await writeFile(path.join(root, checkpointPath + ".gz"), compressed, { flag: "wx" });
assert.deepEqual(gunzipSync(await read(checkpointPath + ".gz")), checkpointBytes);
// Identity-check again immediately before deleting only these exact owned roots.
for (const directory of [runtime, fixture]) {
  const info = await lstat(directory, { bigint: true }); assert.equal(info.dev, identities[directory].dev); assert.equal(info.ino, identities[directory].ino);
  assert.equal(await realpath(directory), directory); await rm(directory, { recursive: true, maxRetries: 5, retryDelay: 100 });
  await assert.rejects(access(directory), { code: "ENOENT" });
}
await rm(path.join(root, checkpointPath));
const output = "evidence/2026-10-18-jspi-unreported-run-analysis.json", own = "scripts/analyze-jspi-unreported-run.mjs", ownBytes = await read(own);
await writeFile(path.join(root, output), JSON.stringify({ recordedAt: new Date().toISOString(), status: "worker-event-bookkeeping-crash-not-media-or-memory-acceptance",
  terminal: { path: terminalPath, sha256: sha(terminalBytes) }, sourceArchive: terminal.sourceArchive, all829ExecutedCurrentPostPinsEqual: true,
  nativePartialPhases: checkpoint.native.phases, coverageThroughSequence: checkpoint.coverageThroughSequence,
  exactSelectedBlankBaselineUnavailable: true, finalReportUnavailable: true, durablyProvenCompletedControls: null,
  cause: "Uncaught fixed32 worker-event callback assertion; enclosing Node finally could not produce final report or delete all scratch",
  births, fixtureFilesRemoved: fixtureFiles, ownedOrphanDirectoriesRemoved: [runtime, fixture],
  fixtureOwnership: { exactGeneratedPrefixAndExpectedFileInventory: true, birthMatchesJournalBoundRuntimeWithinOneSecond: true,
    generatedModuleSha256: sha(moduleSource), generatedMetadataMatched: true, noUnrelatedProcessesKilled: true },
  normalDistRestored: true, original: { bytes: originalStat.size, sha256: originalSha256 },
  checkpoint: { path: checkpointPath + ".gz", bytes: compressed.length, sha256: sha(compressed), restoredBytes: checkpointBytes.length,
    restoredSha256: sha(checkpointBytes), redundantRawRemoved: true },
  journal: { path: journalPath, sha256: sha(journalBytes) }, ownSource: { path: own, sha256: sha(ownBytes), preimage: ownBytes.toString("base64") },
  nativeConversionPerformed: false, speedGainProven: false, memoryAcceptance: false, publicAcceptance: false, fullOriginalAcceptance: false,
  nextAction: "Replace fatal callback history overflow with bounded history plus complete scalar totals and safe-boundary error checks; add durable validated-control checkpoint, then retry this changed harness once without changing production assets or memory/quality gates." }, null, 2) + "\n", { flag: "wx" });
console.log(JSON.stringify({ output, sourceCount: 829, ownedBirthsAbsent: births.length, orphanDirectoriesRemoved: [runtime, fixture], unfinishedOutputRemovedBytes: 131072, originalSha256 }));
