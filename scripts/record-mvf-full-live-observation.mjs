// One read-only birth-qualified observation, not conversion acceptance/restart.
import assert from "node:assert/strict";
import { execFile } from "node:child_process";
import { readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import { promisify } from "node:util";
import { sha } from "./lib/stable-ui-headless-baseline-recipe.mjs";
assert.equal(process.argv.length, 2);
const root = path.resolve(import.meta.dirname, ".."), read = file => readFile(path.join(root, file));
const supervisorPath = "evidence/2026-10-14T22-43-40-203Z-mvf-arena-supervisor-full.json";
const callerPath = "evidence/2026-10-14T22-43-44-516Z-mvf-arena-full-live.json";
const checkpointPath = "outputs/reports/2026-10-14T22-45-10-603Z-private-mpeg2-mvf-arena-full-native-100ms-native-checkpoint.json";
const supervisor = JSON.parse(await read(supervisorPath)), caller = JSON.parse(await read(callerPath));
const checkpointBytes = await read(checkpointPath), checkpoint = JSON.parse(checkpointBytes);
assert.equal(supervisor.status, "running"); assert.equal(supervisor.childExit, null);
const expected = [supervisor.supervisorIdentity, supervisor.childIdentity, caller.driverIdentity, checkpoint.identities.root, checkpoint.identities.monitor];
const ids = expected.map(row => row.pid); assert.equal(new Set(ids).size, 5);
const command = "$ErrorActionPreference='Stop'; $mvfOwnedIds=" + ids.join(",") + "; ConvertTo-Json -InputObject @(Get-CimInstance Win32_Process | Where-Object {$mvfOwnedIds -contains $_.ProcessId} | ForEach-Object {@{pid=[int]$_.ProcessId;parentPid=[int]$_.ParentProcessId;createdAt=$_.CreationDate.ToUniversalTime().ToString('o')}}) -Compress";
const { stdout } = await promisify(execFile)("powershell.exe", ["-NoProfile", "-NonInteractive", "-EncodedCommand", Buffer.from(command, "utf16le").toString("base64")],
  { cwd: root, windowsHide: true, timeout: 15000, maxBuffer: 16384 });
const current = JSON.parse(stdout), checks = expected.map(identity => {
  const actual = current.find(row => row.pid === identity.pid); assert.ok(actual);
  assert.equal(actual.parentPid, identity.parentPid); assert.equal(Date.parse(actual.createdAt), Date.parse(identity.createdAt));
  return { expected: identity, actual, sameOwnedBirthPresent: true };
});
const own = "scripts/record-mvf-full-live-observation.mjs", ownBytes = await read(own), stamp = new Date().toISOString().replaceAll(/[:.]/g, "-");
const output = `evidence/${stamp}-mvf-arena-full-live-observation.json`;
const value = { recordedAt: new Date().toISOString(), scope: "actual-current-owned-births-not-terminal-or-conversion-acceptance", supervisorPath, callerPath,
  checks, checkpoint: { path: checkpointPath, observedSha256: sha(checkpointBytes), updatedAt: checkpoint.updatedAt,
    coverageThroughSequence: checkpoint.coverageThroughSequence, baseline: checkpoint.baseline,
    phases: checkpoint.native.phases.map(row => ({ phase: row.phase, validSamples: row.validSamples, unavailableSamples: row.unavailableSamples })) },
  sourceArchive: caller.sourceArchive, conversionAcceptance: false, noProcessesKilled: true, noAutomaticRestart: true,
  ownSource: { path: own, sha256: sha(ownBytes), preimage: ownBytes.toString("base64") } };
await writeFile(path.join(root, output), JSON.stringify(value, null, 2) + "\n", { flag: "wx" });
console.log(JSON.stringify({ output, ownedBirthsCurrentlyLive: checks.length, phases: value.checkpoint.phases }));
