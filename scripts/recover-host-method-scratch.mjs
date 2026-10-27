// Reclaim only the exact failed HTTP diagnostic's closed, identity-checked scratch.
import assert from "node:assert/strict";
import { execFile } from "node:child_process";
import { createHash } from "node:crypto";
import { createReadStream } from "node:fs";
import { access, lstat, readFile, readdir, realpath, rm, writeFile } from "node:fs/promises";
import path from "node:path";
import { promisify } from "node:util";
import { queryReliableProcessIdentity } from "./lib/reliable-owned-identity.mjs";
assert.equal(process.platform, "win32"); assert.equal(process.argv.length, 4);
const root = path.resolve(import.meta.dirname, ".."), directory = path.resolve(process.argv[2]), receiptPath = path.resolve(process.argv[3]);
const work = path.join(root, "work"), canonical = value => value.toLowerCase(), execute = promisify(execFile);
const hashFile = async file => { const hash = createHash("sha256"); for await (const chunk of createReadStream(file, { highWaterMark: 262144 })) hash.update(chunk); return hash.digest("hex"); };
assert.equal(canonical(path.dirname(directory)), canonical(work)); assert.match(path.basename(directory), /^method-runtime-[A-Za-z0-9]{6}$/);
assert.equal(canonical(path.dirname(receiptPath)), canonical(path.join(root, "evidence"))); assert.match(path.basename(receiptPath), /-host-method-runtime\.json$/);
const receipt = JSON.parse(await readFile(receiptPath)); assert.equal(receipt.status, "failed-diagnosis"); assert.notEqual(receipt.ownedRuntimeRemoved, true);
assert.equal(canonical(await realpath(work)), canonical(work)); assert.equal(canonical(await realpath(directory)), canonical(directory));
const identity = await lstat(directory, { bigint: true }); assert.ok(identity.isDirectory() && !identity.isSymbolicLink());
if (receipt.runtime) { assert.equal(String(identity.dev), receipt.runtime.dev); assert.equal(String(identity.ino), receipt.runtime.ino); }
const start = Date.parse(receipt.startedAt), finish = Date.parse(receipt.finishedAt); assert.ok(Number.isFinite(start) && finish > start);
assert.ok(Number(identity.birthtimeMs) >= start - 1000 && Number(identity.birthtimeMs) <= finish + 1000);
const probePath = receipt.probeRelativePath ?? "probe.mjs"; assert.ok(["probe.mjs", "probe-source/probe.mjs"].includes(probePath));
assert.equal(await hashFile(path.join(directory, probePath)), receipt.probeSha256);
const pids = new Set(receipt.controls.map(row => row.launchIdentity?.pid).filter(Boolean));
for (const match of receipt.failures.join("\n").matchAll(/PID\s+(\d+)/g)) pids.add(Number(match[1]));
const observed = [];
for (const pid of pids) {
  const current = await queryReliableProcessIdentity(pid); observed.push({ pid, current });
  assert.ok(current === null || Date.parse(current.createdAt) > finish, "A possibly owned process still exists; do not delete its state");
}
const script = `$ErrorActionPreference='Stop'; ConvertTo-Json -InputObject @(Get-CimInstance Win32_Process | Where-Object {$_.Name -in @('node.exe','workerd.exe') -and $_.ProcessId -notin @(${process.pid},${process.ppid}) -and $_.CommandLine -like '*${path.basename(directory)}*'} | ForEach-Object {@{pid=[int]$_.ProcessId;parentPid=[int]$_.ParentProcessId;createdAt=$_.CreationDate.ToUniversalTime().ToString('o')}}) -Compress`;
const { stdout } = await execute("powershell.exe", ["-NoProfile", "-NonInteractive", "-Command", script], { windowsHide: true, timeout: 15000, maxBuffer: 16384 });
assert.deepEqual(JSON.parse(stdout), [], "Another live process references the exact owned scratch");
const files = [];
for (const relative of await readdir(directory, { recursive: true })) {
  const file = path.join(directory, relative), info = await lstat(file, { bigint: true });
  assert.ok(!info.isSymbolicLink()); assert.equal(canonical(await realpath(file)), canonical(file));
  assert.ok(Number(info.mtimeMs) <= finish + 1000, "Preserve later edits or writes");
  if (info.isFile()) files.push({ path: relative, bytes: Number(info.size), sha256: await hashFile(file) });
}
const report = { schemaVersion: 1, scope: "Closed owned HTTP diagnostic cache/log/fixture cleanup only, not media or acceptance",
  sourceReceipt: path.relative(root, receiptPath), directory, identity: { dev: String(identity.dev), ino: String(identity.ino) },
  processObservations: observed, noLiveReferences: true, files, bytes: files.reduce((sum, file) => sum + file.bytes, 0), removed: false };
const current = await lstat(directory, { bigint: true }); assert.equal(current.dev, identity.dev); assert.equal(current.ino, identity.ino);
assert.equal(canonical(await realpath(directory)), canonical(directory)); assert.equal(canonical(path.dirname(directory)), canonical(work));
await rm(directory, { recursive: true, force: false, maxRetries: 5, retryDelay: 100 });
await assert.rejects(access(directory), { code: "ENOENT" }); report.removed = true;
const destination = path.join(root, "evidence", new Date().toISOString().replaceAll(/[:.]/g, "-") + "-host-method-scratch-cleanup.json");
await writeFile(destination, JSON.stringify(report, null, 2) + "\n", { flag: "wx" });
console.log(JSON.stringify({ path: path.relative(root, destination), removed: true, files: files.length, bytes: report.bytes }));
