// One read-only terminal audit plus lossless compaction of the owned journal.
import assert from "node:assert/strict";
import { execFile } from "node:child_process";
import { createHash } from "node:crypto";
import { createReadStream } from "node:fs";
import { access, lstat, readFile, stat, unlink, writeFile } from "node:fs/promises";
import path from "node:path";
import { promisify } from "node:util";
import { gzipSync, gunzipSync } from "node:zlib";
import { sha, baselineBinding } from "./lib/stable-ui-headless-baseline-recipe.mjs";
import { materializeLayeredFullSourceArchive } from "./lib/duration-drain-full-sources.mjs";
import { inspectDurationFullTerminal } from "./lib/duration-drain-full-terminal.mjs";
import { inspectInstalledChromePin, assertInstalledChromePinsEqual } from "./lib/installed-chrome-pin.mjs";
import { microsecondBirth } from "./lib/microsecond-native-type-join.mjs";
import { createOwnedRuntimeScratch } from "./lib/owned-runtime-scratch.mjs";
assert.equal(process.argv.length, 2);
const root = path.resolve(import.meta.dirname, ".."), read = file => readFile(path.join(root, file));
const stamp = "2026-10-15T11-18-16-969Z", output = `evidence/${stamp}-duration-drain-full-terminal-analysis.json`;
await assert.rejects(access(path.join(root, output)), { code: "ENOENT" });
const terminalPath = `evidence/${stamp}-duration-drain-original-full-terminal.json`, terminalBytes = await read(terminalPath), terminal = JSON.parse(terminalBytes);
const supervisorPath = "evidence/2026-10-15T11-18-08-401Z-duration-drain-supervisor-full.json", supervisorBytes = await read(supervisorPath), supervisor = JSON.parse(supervisorBytes);
assert.equal(supervisor.status, "command-completed-not-conversion-acceptance"); assert.equal(supervisor.childExit.code, 0); assert.equal(supervisor.runtimeRemoved, true);
const record = terminal.candidate.compressedReport, zip = await read(record.path); assert.equal(zip.length, record.bytes); assert.equal(sha(zip), record.sha256);
const raw = gunzipSync(zip, { maxOutputLength: 33554432 }); assert.equal(raw.length, record.restoredBytes); assert.equal(sha(raw), record.restoredSha256);
const report = JSON.parse(raw), analysis = inspectDurationFullTerminal(terminal, report);
const archive = await materializeLayeredFullSourceArchive(root, terminal.sourceArchive);
assert.equal(Object.keys(archive.sourcePins).length, 656); assert.deepEqual(archive.sourcePins, terminal.sourcePins);
assert.deepEqual(terminal.sourcePins, terminal.postSourcePins); assert.deepEqual(report.sourceHashes, terminal.sourcePins);
for (const [file, hash] of Object.entries(terminal.sourcePins)) {
  assert.equal(sha(Buffer.from(archive.sourcePreimages[file].data, "base64")), hash, file); assert.equal(sha(await read(file)), hash, file);
}
for (const directory of [terminal.wrapper, terminal.candidateDirectory, report.runtimeDirectory, supervisor.runtimeDirectory]) await assert.rejects(access(directory), { code: "ENOENT" });
const identities = [...report.nativeMemory.identities, ...report.ownedLaunches.map(row => row.identity), terminal.driverIdentity, supervisor.supervisorIdentity, supervisor.childIdentity];
const unique = [...new Map(identities.map(row => [`${row.pid}/${row.parentPid}/${microsecondBirth(row.createdAt)}`, row])).values()];
const pids = [...new Set(unique.map(row => row.pid))]; assert.ok(pids.length > 5 && pids.length <= 64);
const command = "$ErrorActionPreference='Stop'; $durationAuditPids=" + pids.join(",") + "; ConvertTo-Json -InputObject @(Get-CimInstance Win32_Process | Where-Object {$durationAuditPids -contains $_.ProcessId} | ForEach-Object {@{pid=[int]$_.ProcessId;parentPid=[int]$_.ParentProcessId;createdAt=$_.CreationDate.ToUniversalTime().ToString('o')}}) -Compress";
const runtime = await createOwnedRuntimeScratch("duration-drain-terminal-audit-"); let birthChecks;
try {
  const { stdout } = await promisify(execFile)("powershell.exe", ["-NoProfile", "-NonInteractive", "-EncodedCommand", Buffer.from(command, "utf16le").toString("base64")],
    { cwd: root, env: runtime.env, windowsHide: true, timeout: 15000, maxBuffer: 131072 });
  const observed = JSON.parse(stdout); birthChecks = unique.map(identity => {
    const current = observed.find(row => row.pid === identity.pid) ?? null;
    assert.ok(!current || current.parentPid !== identity.parentPid || microsecondBirth(current.createdAt) !== microsecondBirth(identity.createdAt));
    return { identity, current, ownedBirthAbsent: true, pidReused: current !== null };
  });
} finally { await runtime.close(); }
const original = path.join(root, "test.mkv"); assert.equal((await stat(original)).size, 2958573265);
const digest = createHash("sha256"); for await (const chunk of createReadStream(original, { highWaterMark: 1048576 })) digest.update(chunk);
const originalSha256 = digest.digest("hex"); assert.equal(originalSha256, "31f36695b5b44c62125a9e4264e84dc085accd21c02cc3487aae597f54b9db34");
assert.equal(terminal.protectedAfter.sha256, originalSha256); assertInstalledChromePinsEqual(terminal.browserPinBefore, terminal.browserPinAfter);
const currentBrowserPin = await inspectInstalledChromePin(); assertInstalledChromePinsEqual(terminal.browserPinAfter, currentBrowserPin);
assert.equal(sha(await read("dist/client" + baselineBinding.url)), baselineBinding.sha256);
for (const file of ["within-remux.mjs", "within-remux.wasm", "within-mpeg4.mjs", "within-mpeg4.wasm", "within-direct.mjs", "within-direct.wasm"])
  assert.equal(sha(await read("dist/client/engines/remux/" + file)), sha(await read("public/engines/remux/" + file)));
const checkpointPath = path.relative(root, report.nativeMemory.durableCheckpoint.file).replaceAll("\\", "/");
assert.equal(path.dirname(path.resolve(root, checkpointPath)), path.join(root, "outputs/reports"));
const checkpointBytes = await read(checkpointPath), checkpoint = JSON.parse(checkpointBytes);
assert.equal(checkpoint.coverageThroughSequence, report.nativeMemory.sequence); assert.equal(checkpoint.conversionAcceptance, false);
const phases = rows => rows.map(row => Object.fromEntries(Object.entries(row).filter(([key]) => key !== "unavailableExamples")));
assert.deepEqual(phases(checkpoint.native.phases), phases(report.nativeMemory.phases));
const checkpointZip = gzipSync(checkpointBytes, { level: 9 }); assert.deepEqual(gunzipSync(checkpointZip), checkpointBytes);
const compactPath = checkpointPath + ".gz"; await writeFile(path.join(root, compactPath), checkpointZip, { flag: "wx" });
assert.equal(sha(await read(compactPath)), sha(checkpointZip));
const target = path.resolve(root, checkpointPath), identity = await lstat(target, { bigint: true }); assert.ok(identity.isFile() && !identity.isSymbolicLink());
const checked = await lstat(target, { bigint: true }); assert.equal(checked.dev, identity.dev); assert.equal(checked.ino, identity.ino);
assert.equal(sha(await read(checkpointPath)), sha(checkpointBytes)); await unlink(target); await assert.rejects(access(target), { code: "ENOENT" });
const ownSources = {};
for (const file of ["scripts/analyze-duration-drain-full-terminal.mjs", "scripts/lib/duration-drain-full-terminal.mjs"]) {
  const bytes = await read(file); ownSources[file] = { sha256: sha(bytes), preimage: bytes.toString("base64") };
}
const result = { recordedAt: new Date().toISOString(), ...analysis,
  terminal: { path: terminalPath, sha256: sha(terminalBytes) }, supervisor: { path: supervisorPath, sha256: sha(supervisorBytes), exitZeroIsNotConversionPass: true },
  sourceArchive: terminal.sourceArchive, rawArchive: record, all656CurrentPostExecutedPreimagesVerified: true,
  originalWholePrePostCurrentSha256: originalSha256, browserPin: currentBrowserPin, birthChecks,
  allOwnedMediaAndProfilesAbsent: true, normalAssetsRestored: true, noProcessesKilledByAudit: true,
  losslesslyCompactedCheckpoint: { path: checkpointPath, bytes: checkpointBytes.length, sha256: sha(checkpointBytes),
    archive: { path: compactPath, bytes: checkpointZip.length, sha256: sha(checkpointZip), restoredBytes: checkpointBytes.length, restoredSha256: sha(checkpointBytes) } }, ownSources };
await writeFile(path.join(root, output), JSON.stringify(result, null, 2) + "\n", { flag: "wx" });
console.log(JSON.stringify({ output, frames: result.frames, stagedBytes: result.stagedOutputBytes,
  primaryIncrementalPrivateMiB: result.primaryMemory.incrementalPrivateMiB, ownedBirthsAbsent: birthChecks.length, removedRawCheckpointBytes: checkpointBytes.length }));
