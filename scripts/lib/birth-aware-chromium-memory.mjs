import assert from "node:assert/strict";
import { spawn } from "node:child_process";
import { lstat, readFile, realpath, unlink, writeFile } from "node:fs/promises";
import path from "node:path";
import { validateNativeBatch } from "./persistent-chromium-memory.mjs";
import { makeBirthAwareMemoryObserver } from "./birth-aware-memory-observer-source.mjs";

export function validateBirthOwnershipProofs(batch, previousQueries = 0) {
  assert.ok(Number.isSafeInteger(batch.birthFallbackQueries) && batch.birthFallbackQueries >= previousQueries);
  assert.ok(Array.isArray(batch.ownershipProofs) && batch.ownershipProofs.length <= 32);
  for (const proof of batch.ownershipProofs) {
    assert.ok(Number.isSafeInteger(proof.pid) && proof.pid > 0 && Number.isSafeInteger(proof.parentPid) && proof.parentPid >= 0);
    assert.ok(Number.isSafeInteger(proof.observations) && proof.observations > 0);
    for (const key of ["earliestFileTime", "latestFileTime", "boundaryFileTime"]) assert.match(proof[key], /^\d{17,19}$/);
    const low = BigInt(proof.earliestFileTime), high = BigInt(proof.latestFileTime), boundary = BigInt(proof.boundaryFileTime);
    assert.ok(high >= low && high - low <= 9n);
    assert.ok(["GetProcessTimes", "Win32_Process.CreationDate"].includes(proof.source));
    if (proof.source === "GetProcessTimes") assert.equal(high, low);
    if (proof.reason === "predates-current-parent") assert.ok(high < boundary);
    else { assert.equal(proof.reason, "previous-owned-pid-reused"); assert.ok(boundary < low || boundary > high); }
  }
  return batch.birthFallbackQueries;
}

export async function startChromiumMemoryMonitor(rootPid, temporary, intervalMs = 100) {
  assert.equal(process.platform, "win32"); assert.ok(Number.isSafeInteger(rootPid) && rootPid > 0);
  assert.ok(Number.isInteger(intervalMs) && intervalMs >= 100 && intervalMs <= 1000);
  const root = path.resolve(import.meta.dirname, "../.."), workRoot = await realpath(path.join(root, "work")), tempRoot = await realpath(temporary);
  const relative = path.relative(workRoot, tempRoot); assert.ok(relative && !relative.startsWith("..") && !path.isAbsolute(relative));
  const source = makeBirthAwareMemoryObserver(await readFile(new URL("./windows-tree-monitor.cs", import.meta.url), "utf8"),
    await readFile(new URL("./windows-process-birth-proof.cs", import.meta.url), "utf8"));
  const generatedFile = path.join(tempRoot, "birth-aware-native-observer.cs"); await writeFile(generatedFile, source.generated, { flag: "wx" });
  const generatedIdentity = await lstat(generatedFile, { bigint: true });
  const child = spawn("powershell.exe", ["-NoProfile", "-NonInteractive", "-File", path.join(import.meta.dirname, "windows-tree-monitor-birth-aware.ps1"),
    "-SourcePath", generatedFile, "-SourceSha256", source.generatedSha256, "-RootPid", String(rootPid), "-IntervalMs", String(intervalMs)],
  { cwd: root, env: { ...process.env, TEMP: tempRoot, TMP: tempRoot }, windowsHide: true, stdio: ["pipe", "pipe", "pipe"] });
  let buffer = "", stderr = "", pending, fatal, sequence = 0, queries = 0, proofs = [];
  const fail = error => { fatal ??= error; pending?.reject(fatal); pending = null; };
  child.stderr.on("data", bytes => { stderr = (stderr + bytes.toString()).slice(-8192); });
  child.on("error", fail); child.stdin.on("error", fail);
  child.on("exit", code => fail(new Error(`Birth-aware observer exited (${code}): ${stderr}`)));
  child.stdout.setEncoding("utf8");
  child.stdout.on("data", bytes => {
    buffer += bytes;
    if (buffer.length > 8 * 1024 ** 2) { fail(new Error("Observer response buffer cap")); child.kill(); return; }
    let newline;
    while ((newline = buffer.indexOf("\n")) >= 0) {
      const line = buffer.slice(0, newline).trim(); buffer = buffer.slice(newline + 1);
      try { assert.ok(pending, "Unexpected observer response"); const value = JSON.parse(line), operation = pending; pending = null; operation.resolve(value); }
      catch (error) { fail(error); child.kill(); return; }
    }
  });
  const response = (request, timeout) => new Promise((resolve, reject) => {
    if (fatal) { reject(fatal); return; } if (pending) { reject(new Error("Only one observer operation may be pending")); return; }
    const timer = setTimeout(() => { fail(new Error("Native observer response timed out")); child.kill(); }, timeout);
    pending = { resolve: value => { clearTimeout(timer); resolve(value); }, reject: error => { clearTimeout(timer); reject(error); } };
    if (request) child.stdin.write(request + "\n");
  });
  let closing;
  const close = () => closing ??= (async () => {
    if (child.exitCode == null && child.signalCode == null) await new Promise(resolve => {
      const timer = setTimeout(() => { child.kill(); }, 3000);
      child.once("exit", () => { clearTimeout(timer); resolve(); }); child.stdin.end("quit\n");
    });
    const current = await lstat(generatedFile, { bigint: true }); assert.equal(current.dev, generatedIdentity.dev); assert.equal(current.ino, generatedIdentity.ino);
    assert.equal(await readFile(generatedFile, "utf8"), source.generated); await unlink(generatedFile);
  })();
  try { assert.equal((await response(null, 15000)).ready, true); } catch (error) { await close(); throw error; }
  return { pid: child.pid, intervalMs, close,
    ownershipSummary: () => ({ generatedSourceSha256: source.generatedSha256, baselineSha256: source.baselineSha256, helperSha256: source.helperSha256,
      fallbackBirthQueries: queries, proofs: structuredClone(proofs), memoryFormulaChanged: false, processNameOrSandboxExclusions: false }),
    async drain() { const batch = await response("drain", 5000); sequence = validateNativeBatch(batch, rootPid, sequence);
      queries = validateBirthOwnershipProofs(batch, queries); proofs = batch.ownershipProofs; return batch; },
  };
}
