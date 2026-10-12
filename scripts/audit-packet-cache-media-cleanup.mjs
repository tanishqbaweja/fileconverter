// Independent terminal absence check: never close/kill a process or delete media.
import assert from "node:assert/strict";
import { execFile } from "node:child_process";
import { access, readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import { promisify } from "node:util";
import { gunzipSync } from "node:zlib";
import { sha } from "./lib/stable-ui-headless-baseline-recipe.mjs";
const root = path.resolve(import.meta.dirname, ".."), read = file => readFile(path.join(root, file));
assert.equal(process.argv.length, 2);
const proofPath = "evidence/2026-10-12T05-33-59-279Z-packet-cache-media.json", proofBytes = await read(proofPath), proof = JSON.parse(proofBytes);
assert.equal(sha(proofBytes), "dfdadacce76b199f6c7e5abec889a19a8f0bcbb67b6c302fdbd89781b828c3c7");
assert.equal(proof.failure, null); assert.equal(proof.analysis.genuineValidatedConversions, 3);
const zipped = await read(proof.report.archive.path); assert.equal(sha(zipped), proof.report.archive.sha256);
const raw = gunzipSync(zipped, { maxOutputLength: 2097152 }); assert.equal(sha(raw), proof.report.sha256);
const report = JSON.parse(raw), pids = [...new Set(report.rows.filter(row => "memoryScope" in row)
  .flatMap(row => row.samples.flatMap(sample => sample.processes.map(process => process.pid))))].sort((a, b) => a - b);
assert.ok(pids.length > 0 && pids.length <= 128);
for (const pid of pids) assert.ok(Number.isInteger(pid) && pid > 0);
const helpers = proof.cleanup.helpers; assert.equal(sha(await read(helpers.path)), helpers.sha256);
for (const row of helpers.launchRecords) { assert.equal(row.absence.status, "owned-identity-absent"); pids.push(row.identity.pid); }
const queriedPids = [...new Set(pids)].sort((a, b) => a - b), filter = queriedPids.map(pid => `ProcessId = ${pid}`).join(" or ");
const { stdout } = await promisify(execFile)("powershell.exe", ["-NoProfile", "-NonInteractive", "-Command",
  `$ErrorActionPreference = 'Stop'; ConvertTo-Json -InputObject @(Get-CimInstance Win32_Process -Filter '${filter}' | ForEach-Object { @{pid=$_.ProcessId;parentPid=$_.ParentProcessId;createdAt=$_.CreationDate.ToUniversalTime().ToString('o')} }) -Compress`],
{ cwd: root, windowsHide: true, timeout: 15000, maxBuffer: 131072 });
const current = JSON.parse(stdout), terminalAt = Date.parse(proof.recordedAt);
assert.ok(Number.isFinite(terminalAt));
for (const row of current) {
  assert.ok(queriedPids.includes(row.pid));
  assert.ok(Number.isFinite(Date.parse(row.createdAt)) && Date.parse(row.createdAt) > terminalAt,
    "Existing PID must be proven born after the terminal receipt; never kill it or assume absence");
}
const absentPaths = [proof.cleanup.ownedWrapper, helpers.runtime, path.join(root, proof.report.path)];
for (const directory of absentPaths) await assert.rejects(access(directory), { code: "ENOENT" });
const ownPath = "scripts/audit-packet-cache-media-cleanup.mjs", ownBytes = await read(ownPath);
const output = "evidence/2026-10-12T05-33-59-279Z-packet-cache-media-cleanup-audit.json";
await writeFile(path.join(root, output), JSON.stringify({ observedAt: new Date().toISOString(),
  proof: { path: proofPath, sha256: sha(proofBytes) }, queriedPids, current,
  allSampledProcessesAbsentOrPidReusedAfterTerminal: true, terminalAt: proof.recordedAt,
  scope: "Sampled PIDs absent or current birth strictly after the terminal receipt, so not the sampled process. Helper births were qualified by original runner. Short Chromium samples contain no birth timestamp; not relabelled as birth-qualified.",
  absentPaths, noProcessesKilled: true, noMediaDeleted: true, originalRead: false, publicAcceptance: false,
  ownSource: { path: ownPath, sha256: sha(ownBytes), preimage: ownBytes.toString("base64") } }, null, 2) + "\n", { flag: "wx" });
console.log(JSON.stringify({ output, sampledAndHelperPids: queriedPids.length, currentPostTerminalReusedPids: current.length,
  allSampledProcessesAbsentOrPidReusedAfterTerminal: true }));
