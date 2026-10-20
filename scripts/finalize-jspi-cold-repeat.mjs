// Seal the completed observation and remove only its identified disposable files.
import "./lib/reliable-readonly-preflight.mjs";
import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { execFile } from "node:child_process";
import { lstat, readFile, realpath, unlink, writeFile } from "node:fs/promises";
import path from "node:path";
import { promisify } from "node:util";
import { gzipSync, gunzipSync } from "node:zlib";

const root = path.resolve(import.meta.dirname, ".."), sha = bytes => createHash("sha256").update(bytes).digest("hex");
const auditPath = "evidence/2026-10-20-jspi-cold-repeat-independent-analysis.json";
const auditBytes = await readFile(path.join(root, auditPath)), audit = JSON.parse(auditBytes);
assert.equal(audit.coldRepeat.independentColdSessionRepeatVerified, true);
assert.equal(audit.coldRepeat.completeFullOutputs, 6);
assert.equal(audit.all868ExecutedCurrentPostPinsEqual, true);
assert.equal(audit.exactDriverCallerStagerSupervisorReconstructed, true);
assert.equal(audit.publicAcceptance, false); assert.equal(audit.fullProjectAcceptance, false);
for (const [file, record] of Object.entries(audit.ownSources)) {
  assert.equal(sha(await readFile(path.join(root, file))), record.sha256, file);
  assert.equal(sha(Buffer.from(record.preimage, "base64")), record.sha256, file);
}
const terminalBytes = await readFile(path.join(root, audit.terminal.path));
assert.equal(sha(terminalBytes), audit.terminal.sha256);
const terminal = JSON.parse(terminalBytes);
assert.equal(terminal.failure, null); assert.deepEqual(terminal.cleanupErrors, []);
const { stdout } = await promisify(execFile)("powershell.exe", ["-NoProfile", "-NonInteractive", "-Command",
  "ConvertTo-Json -InputObject @(Get-CimInstance Win32_Process | ForEach-Object {@{pid=[int]$_.ProcessId;createdAt=$_.CreationDate.ToUniversalTime().ToString('o')}}) -Compress"],
{ windowsHide: true, timeout: 15000, maxBuffer: 2097152 });
const current = JSON.parse(stdout);
for (const birth of audit.ownedBirthsAbsent)
  assert.ok(!current.some(row => row.pid === birth.pid && Math.abs(Date.parse(row.createdAt) - Date.parse(birth.createdAt)) < 1));
for (const directory of audit.scratchPathsAbsent) {
  assert.equal(path.dirname(directory), path.join(root, "work"));
  await assert.rejects(lstat(directory), { code: "ENOENT" });
}
const prefix = "outputs/reports/2026-10-19T18-09-43-926Z-private-mpeg2-updated-chrome-full-native-100ms";
async function ownedFile(relative) {
  const absolute = path.join(root, relative), stat = await lstat(absolute);
  assert.equal(path.dirname(absolute), path.join(root, "outputs", "reports"));
  assert.equal(stat.isFile(), true); assert.equal(stat.isSymbolicLink(), false);
  assert.equal(await realpath(absolute), absolute);
  return { absolute, stat, bytes: await readFile(absolute) };
}
const trace = await ownedFile(prefix + "-trace.zip");
assert.ok(trace.bytes.length > 0 && trace.bytes.length < 33554432);
assert.equal(trace.bytes.readUInt32LE(0), 0x04034b50);
const checkpoint = await ownedFile(prefix + "-native-checkpoint.json"), checkpointJson = JSON.parse(checkpoint.bytes);
assert.equal(checkpointJson.error ?? null, null);
const compressedPath = prefix + "-native-checkpoint.json.gz", compressed = gzipSync(checkpoint.bytes, { level: 9 });
assert.deepEqual(gunzipSync(compressed), checkpoint.bytes);
await writeFile(path.join(root, compressedPath), compressed, { flag: "wx" });
assert.deepEqual(gunzipSync(await readFile(path.join(root, compressedPath))), checkpoint.bytes);
// No recursive deletion, inferred glob, unrelated process kill, or source change.
for (const file of [trace, checkpoint]) {
  const currentStat = await lstat(file.absolute);
  assert.equal(currentStat.ino, file.stat.ino); assert.equal(currentStat.size, file.bytes.length);
  assert.equal(sha(await readFile(file.absolute)), sha(file.bytes));
  await unlink(file.absolute);
}
const removed = [trace, checkpoint].map(file => ({ path: path.relative(root, file.absolute).replaceAll("\\", "/"), bytes: file.bytes.length, sha256: sha(file.bytes) }));
const result = {
  recordedAt: new Date().toISOString(), status: "cold-repeat-audited-disposable-artifacts-removed",
  audit: { path: auditPath, sha256: sha(auditBytes) }, terminal: audit.terminal,
  coldRepeat: audit.coldRepeat, allNineAuditSourcePreimagesVerified: Object.keys(audit.ownSources).length === 9,
  ownedBirthsStillAbsent: audit.ownedBirthsAbsent.length, scratchPathsStillAbsent: audit.scratchPathsAbsent,
  removed, removedBytes: removed.reduce((sum, row) => sum + row.bytes, 0),
  nativeCheckpoint: { path: compressedPath, bytes: compressed.length, sha256: sha(compressed), restoredBytes: checkpoint.bytes.length, restoredSha256: sha(checkpoint.bytes) },
  recovery: "Successful trace permanently removed; compact reports, raw SSIM, frame timelines and lossless native checkpoint retained. Converted outputs already removed by the harness.",
  original: audit.original, publicAcceptance: false, fullProjectAcceptance: false,
};
await writeFile(path.join(root, "evidence/2026-10-20-jspi-cold-repeat-cycle.json"), JSON.stringify(result, null, 2) + "\n", { flag: "wx" });
console.log(JSON.stringify({ status: result.status, removedBytes: result.removedBytes, nativeCheckpointBytes: compressed.length, ownedBirthsAbsent: result.ownedBirthsStillAbsent }));
