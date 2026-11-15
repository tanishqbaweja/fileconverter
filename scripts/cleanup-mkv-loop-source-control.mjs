// One-shot recovery for this exact failed run. Never sweep work or kill by name.
import assert from "node:assert/strict";
import { execFile } from "node:child_process";
import { promisify } from "node:util";
import { readFile, writeFile, realpath, lstat, rm, access } from "node:fs/promises";
import { createHash } from "node:crypto";
import { createReadStream } from "node:fs";
import path from "node:path";
import { createOwnedRuntimeScratch } from "./lib/owned-runtime-scratch.mjs";
import { queryReliableProcessIdentity } from "./lib/reliable-owned-identity.mjs";
import { assertOpfsOutputValidationBackingUnchanged } from "./lib/opfs-output-validation-backing.mjs";
const root = path.resolve(import.meta.dirname, ".."), work = path.join(root, "work"), execute = promisify(execFile);
const sourceFile = "evidence/2026-11-15T00-31-57-030Z-mkv-startup-core-loop-source-control.json";
const bytes = await readFile(path.join(root, sourceFile));
assert.equal(createHash("sha256").update(bytes).digest("hex"), "9e80b288d17288be539864a6493368668b0c18ee9c3f32acce245f580167a5b3");
const failed = JSON.parse(bytes), arm = failed.arms[0], row = arm.cases[0];
assert.equal(failed.status, "failed-not-acceptance"); assert.equal(arm.browserCleanup.status, "owned-observed-pids-absent");
const browserRuntime = path.join(work, "mkv-direct-reuse-q4Og5Q"), fixtureRuntime = path.join(work, "mkv-direct-reuse-fixture-1FhHCc");
assert.equal(path.resolve(root, row.binding.physicalFile).startsWith(browserRuntime + path.sep), true);
assert.equal(path.dirname(failed.fixture.file), fixtureRuntime);
const owned = [];
for (const directory of [browserRuntime, fixtureRuntime]) {
  assert.equal(path.dirname(directory), work); assert.equal(await realpath(directory), directory);
  const info = await lstat(directory, { bigint: true }); assert.ok(info.isDirectory() && !info.isSymbolicLink());
  owned.push({ directory, dev: info.dev, ino: info.ino });
}
const hashFile = async file => { const h = createHash("sha256"); for await (const chunk of createReadStream(file, { highWaterMark: 262144 })) h.update(chunk); return h.digest("hex"); };
await assertOpfsOutputValidationBackingUnchanged({ file: path.resolve(root, row.binding.physicalFile), proof: row.binding });
assert.equal(await hashFile(path.join(browserRuntime, "private-mkv-reuse.mjs")), arm.overlay.overlaySha256);
assert.equal(await hashFile(failed.fixture.file), failed.fixture.sha256);
const expectedHarness = { pid: 30400, parentPid: 29428, createdAt: "2026-11-15T00:31:56.6068130Z" };
const expectedServer = { pid: 36068, parentPid: 30400, createdAt: "2026-11-15T00:32:13.6154720Z" };
const runtime = await createOwnedRuntimeScratch("mkv-loop-recovery-");
let receipt;
try {
  assert.deepEqual(await queryReliableProcessIdentity(expectedHarness.pid), expectedHarness);
  assert.deepEqual(await queryReliableProcessIdentity(expectedServer.pid), expectedServer);
  const script = "$ErrorActionPreference='Stop'; $recoveryRows=Get-CimInstance Win32_Process; ConvertTo-Json -InputObject @($recoveryRows | ForEach-Object { @{ pid=[int]$_.ProcessId; parentPid=[int]$_.ParentProcessId; createdAt=$_.CreationDate.ToUniversalTime().ToString('o'); commandLine=$_.CommandLine } }) -Compress";
  const all = JSON.parse((await execute("powershell.exe", ["-NoProfile", "-NonInteractive", "-Command", script],
    { env: runtime.env, windowsHide: true, timeout: 15000, maxBuffer: 2097152 })).stdout);
  const harness = all.find(p => p.pid === expectedHarness.pid), server = all.find(p => p.pid === expectedServer.pid);
  assert.ok(harness.commandLine.endsWith("scripts/qualify-mkv-direct-reuse.mjs --h264-startup-loop-source-control 43653656481 147b05167d5d5729a8aa186c2c073c833816aa3c"));
  assert.ok(server.commandLine.includes("node_modules/wrangler/bin/wrangler.js dev --config dist/server/wrangler.json --port 53612"));
  assert.ok(server.commandLine.endsWith(`--persist-to "${path.join(browserRuntime, "wrangler")}"`));
  const tree = [server];
  for (let i = 0; i < tree.length; i++) {
    assert.ok(tree.length <= 64);
    for (const child of all.filter(p => p.parentPid === tree[i].pid)) {
      assert.ok(!tree.some(p => p.pid === child.pid));
      assert.ok(Date.parse(child.createdAt) >= Date.parse(server.createdAt)); tree.push(child);
    }
  }
  // Recheck the exact birth immediately before the ONLY process-tree kill.
  assert.deepEqual(await queryReliableProcessIdentity(expectedServer.pid), expectedServer);
  let killError = null;
  try { await execute("taskkill.exe", ["/PID", String(expectedServer.pid), "/T", "/F"], { env: runtime.env, windowsHide: true, timeout: 15000, maxBuffer: 65536 }); }
  catch (error) { killError = String(error).slice(0, 1024); }
  const after = await Promise.all(tree.map(async born => {
    const current = await queryReliableProcessIdentity(born.pid);
    assert.ok(current === null || current.createdAt !== born.createdAt, "An owned server birth is still present");
    return { pid: born.pid, ownedBirth: born.createdAt, current, pidReused: current !== null };
  }));
  const removed = [];
  for (const target of owned) {
    assert.equal(path.dirname(target.directory), work); assert.equal(await realpath(target.directory), target.directory);
    const info = await lstat(target.directory, { bigint: true }); assert.ok(info.isDirectory() && !info.isSymbolicLink());
    assert.equal(info.dev, target.dev); assert.equal(info.ino, target.ino);
    await rm(target.directory, { recursive: true, force: false });
    await assert.rejects(access(target.directory), { code: "ENOENT" }); removed.push(path.relative(root, target.directory));
  }
  assert.equal(await hashFile(path.join(root, "test.mkv")), failed.originalAfter.sha256);
  receipt = { status: "owned-server-and-disposable-data-recovered-failed-conversion-still-failed", sourceFile,
    expectedHarness, expectedServer, uniqueOwnedServerArgumentsVerified: true, serverTreeBefore: tree, after,
    allObservedServerBirthsAbsent: true, killError, removed, removedOutputBytes: row.metrics.outputBytes,
    removedGeneratedSourceBytes: failed.fixture.bytes, protectedOriginalUnchanged: true,
    unrelatedProcessesKilled: false, originalBrowserFailureReclassified: false };
} finally { await runtime.close(); }
const file = "evidence/2026-11-15-mkv-loop-source-owned-recovery.json";
await writeFile(path.join(root, file), JSON.stringify(receipt, null, 2) + "\n", { flag: "wx" });
console.log(JSON.stringify({ file, status: receipt.status, removed: receipt.removed, ownedBirthsRemoved: receipt.after.length }));
