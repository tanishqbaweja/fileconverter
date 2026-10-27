// Exact failed-experiment recovery only; no sweeps, live-process kills or trace pruning.
import assert from "node:assert/strict";
import { execFile } from "node:child_process";
import { createHash } from "node:crypto";
import { createReadStream } from "node:fs";
import { access, lstat, readFile, readdir, realpath, rm, writeFile } from "node:fs/promises";
import path from "node:path";
import { promisify } from "node:util";

assert.equal(process.platform, "win32"); assert.equal(process.argv.length, 4);
const root = path.resolve(import.meta.dirname, ".."), work = path.join(root, "work"), receiptPath = path.resolve(process.argv[2]), candidate = path.resolve(process.argv[3]);
assert.equal(path.dirname(receiptPath), path.join(root, "evidence")); assert.match(path.basename(receiptPath), /-static-shell-memory\.json$/);
assert.equal(path.dirname(candidate), work); assert.match(path.basename(candidate), /^static-shell-candidate-[A-Za-z0-9]{6}$/);
const source = JSON.parse(await readFile(receiptPath)), proof = source.memoryComparison;
assert.equal(proof.status, "failed-matched-page-load-diagnostic"); assert.notEqual(source.ownedRuntimeRemoved, true);
assert.equal(proof.staticServerClosed, true); assert.equal(proof.productionCleanup.status, "owned-identity-absent");
const started = Date.parse(source.startedAt), finished = Date.parse(source.finishedAt); assert.ok(finished > started);
const targets = [candidate], identities = [proof.productionBirth];
for (const row of proof.cases) {
  assert.equal(row.observerCleanup.status, "owned-identity-absent");
  assert.ok(row.processCleanup.length > 0 && row.processCleanup.every(value => value.status === "owned-identity-absent"));
  identities.push(row.chromeBirth, row.observerBirth, ...row.processCleanup.map(value => value.identity));
  if (!row.runtimeRemoved) {
    const arg = row.arguments.find(value => value.startsWith("--user-data-dir=")); assert.ok(arg);
    const profile = path.resolve(arg.slice("--user-data-dir=".length)), directory = path.dirname(profile);
    assert.equal(path.basename(profile), "profile"); assert.equal(path.dirname(directory), work); assert.match(path.basename(directory), /^shell-memory-case-[A-Za-z0-9]{6}$/);
    targets.push(directory);
  }
}
assert.equal(new Set(targets).size, targets.length); assert.ok(targets.length >= 2 && targets.length <= 7);
const nonces = targets.map(directory => path.basename(directory));
const filter = nonces.map(nonce => `$_.CommandLine -like '*${nonce}*'`).join(" -or ");
const script = `$ErrorActionPreference='Stop'; ConvertTo-Json -InputObject @(Get-CimInstance Win32_Process | ForEach-Object {@{pid=[int]$_.ProcessId;parentPid=[int]$_.ParentProcessId;createdAt=$_.CreationDate.ToUniversalTime().ToString('o');isThisProbe=[bool]($_.ProcessId -eq $PID);referencesScratch=[bool](${filter})}}) -Compress`;
const { stdout } = await promisify(execFile)("powershell.exe", ["-NoProfile", "-NonInteractive", "-Command", script], { windowsHide: true, timeout: 15000, maxBuffer: 1048576 });
const processes = JSON.parse(stdout); assert.ok(Array.isArray(processes));
// This command's native launch ancestors contain the literal CLI target too.
// Exclude only the birth-ordered current ancestry, not all PowerShell/process names.
const inspectionAncestry = new Set(); let cursor = processes.find(row => row.pid === process.pid);
assert.ok(cursor);
for (let depth = 0; cursor && depth < 32; depth++) {
  inspectionAncestry.add(cursor.pid);
  const parent = processes.find(row => row.pid === cursor.parentPid);
  if (!parent || Date.parse(parent.createdAt) > Date.parse(cursor.createdAt)) break;
  cursor = parent;
}
assert.ok(processes.every(row => !row.referencesScratch || inspectionAncestry.has(row.pid) || (row.isThisProbe && row.parentPid === process.pid)), "A current non-inspector process references these exact owned targets");
const observations = identities.filter(Boolean).map(identity => {
  const current = processes.find(row => row.pid === identity.pid) ?? null;
  assert.ok(!current || Math.abs(Date.parse(current.createdAt) - Date.parse(identity.createdAt)) >= 1, "Original birth still exists");
  return { identity, current: current ? { pid: current.pid, parentPid: current.parentPid, createdAt: current.createdAt } : null };
});
const digestFile = async filename => { const digest = createHash("sha256"); for await (const bytes of createReadStream(filename, { highWaterMark: 262144 })) digest.update(bytes); return digest.digest("hex"); };
const verified = [];
assert.equal(await realpath(work), work);
for (const directory of targets) {
  assert.equal(await realpath(directory), directory); const identity = await lstat(directory, { bigint: true });
  assert.ok(identity.isDirectory() && !identity.isSymbolicLink());
  assert.ok(Number(identity.birthtimeMs) >= started - 1000 && Number(identity.birthtimeMs) <= finished + 1000);
  const files = [];
  for (const relative of await readdir(directory, { recursive: true })) {
    assert.ok(files.length < 10000); const filename = path.join(directory, relative), info = await lstat(filename, { bigint: true });
    assert.equal(info.isSymbolicLink(), false); assert.equal(await realpath(filename), filename);
    assert.ok(Number(info.mtimeMs) <= finished + 1000, "Preserve later edits or writes");
    if (info.isFile()) files.push({ relative, bytes: Number(info.size), sha256: await digestFile(filename) });
  }
  if (directory === candidate) {
    for (const asset of source.candidateBootstrap.assets) assert.equal(await digestFile(path.join(directory, "client", asset.pathname.slice(1))), asset.sha256);
  } else assert.ok(files.some(file => file.relative.replaceAll("\\", "/") === "profile/DevToolsActivePort"));
  verified.push({ directory, identity: { dev: String(identity.dev), ino: String(identity.ino) }, files: files.length,
    bytes: files.reduce((sum, file) => sum + file.bytes, 0), inventorySha256: createHash("sha256").update(JSON.stringify(files)).digest("hex"), removed: false });
}
for (const item of verified) {
  const current = await lstat(item.directory, { bigint: true }); assert.equal(String(current.dev), item.identity.dev); assert.equal(String(current.ino), item.identity.ino);
  assert.equal(await realpath(item.directory), item.directory); assert.equal(path.dirname(item.directory), work);
  await rm(item.directory, { recursive: true, force: false, maxRetries: 5, retryDelay: 100 });
  await assert.rejects(access(item.directory), { code: "ENOENT" }); item.removed = true;
}
const result = { schemaVersion: 1, scope: "Closed exact failed static-shell memory experiment scratch only; no input or converted media, no blocked trace target touched",
  sourceReceipt: path.relative(root, receiptPath), recordedAt: new Date().toISOString(), noProcessesKilled: true, noLiveReferences: true,
  observations, inspectionAncestry: [...inspectionAncestry], directories: verified, removedBytes: verified.reduce((sum, item) => sum + item.bytes, 0) };
const destination = path.join(root, "evidence", `${result.recordedAt.replaceAll(/[:.]/g, "-")}-static-shell-scratch-cleanup.json`);
await writeFile(destination, JSON.stringify(result, null, 2) + "\n", { flag: "wx" });
console.log(JSON.stringify({ path: path.relative(root, destination), directories: verified.map(item => ({ directory: item.directory, bytes: item.bytes, removed: item.removed })), removedBytes: result.removedBytes }));
