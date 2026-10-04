import assert from "node:assert/strict";
import { spawn } from "node:child_process";
import { realpath } from "node:fs/promises";
import path from "node:path";
import { summarizeTree } from "./chromium-private-memory.mjs";

// A read-only OS observer outside Chromium, not a native conversion helper.
// Unknown process type stays unknown and its private bytes still count in full.
export function validateNativeBatch(batch, rootPid, previousSequence = 0) {
  assert.equal(batch.overflow, false, "Native observer queue overflow; memory coverage is unavailable");
  assert.ok(Array.isArray(batch.samples) && batch.samples.length <= 256);
  assert.ok(Number.isFinite(batch.observerCpuMs) && batch.observerCpuMs >= 0);
  for (const sample of batch.samples) {
    assert.equal(sample.sequence, ++previousSequence, "Missing/out-of-order native memory snapshot");
    assert.ok(Number.isFinite(Date.parse(sample.timestamp)) && Number.isFinite(Date.parse(sample.completedAt)));
    assert.ok(Number.isFinite(sample.nativeElapsedMs) && sample.nativeElapsedMs >= 0);
    if (sample.sampleError != null) {
      assert.equal(sample.privateBytes, null); assert.equal(sample.rssBytes, null); assert.equal(sample.processes, null);
      continue;
    }
    assert.ok(sample.processes.length > 0 && sample.processes.length <= 128);
    assert.equal(new Set(sample.processes.map((p) => p.pid)).size, sample.processes.length);
    for (const entry of sample.processes) {
      assert.ok(Number.isSafeInteger(entry.pid) && entry.pid > 0);
      assert.ok(Number.isSafeInteger(entry.parentPid) && entry.parentPid >= 0);
      assert.match(entry.creationFileTime, /^\d{17,19}$/);
      assert.ok(Number.isFinite(Date.parse(entry.createdAt)));
      entry.type = entry.pid === rootPid ? "browser" : "unknown";
      entry.utilitySubtype = null; entry.sandboxType = null;
    }
    const tree = summarizeTree(sample.processes, rootPid);
    assert.equal(sample.privateBytes, tree.privateBytes); assert.equal(sample.rssBytes, tree.rssBytes);
  }
  return previousSequence;
}

export async function startChromiumMemoryMonitor(rootPid, temporary, intervalMs = 100) {
  assert.equal(process.platform, "win32");
  assert.ok(Number.isSafeInteger(rootPid) && rootPid > 0);
  assert.ok(Number.isInteger(intervalMs) && intervalMs >= 100 && intervalMs <= 1000);
  const root = path.resolve(import.meta.dirname, "../..");
  const workRoot = await realpath(path.join(root, "work")), tempRoot = await realpath(temporary);
  const relative = path.relative(workRoot, tempRoot);
  assert.ok(relative && !relative.startsWith("..") && !path.isAbsolute(relative), "Observer compiler scratch must be repository-local work");
  const child = spawn("powershell.exe", ["-NoProfile", "-NonInteractive", "-File",
    path.join(import.meta.dirname, "windows-tree-monitor.ps1"), "-RootPid", String(rootPid), "-IntervalMs", String(intervalMs)],
  { cwd: root, env: { ...process.env, TEMP: tempRoot, TMP: tempRoot }, windowsHide: true, stdio: ["pipe", "pipe", "pipe"] });
  let buffer = "", stderr = "", pending, fatal, sequence = 0;
  const fail = (error) => { fatal ??= error; pending?.reject(fatal); pending = null; };
  child.stderr.on("data", (bytes) => { stderr = (stderr + bytes.toString()).slice(-8192); });
  child.on("error", fail);
  child.stdin.on("error", fail);
  child.on("exit", (code) => fail(new Error(`Native observer exited (${code}): ${stderr}`)));
  child.stdout.setEncoding("utf8");
  child.stdout.on("data", (bytes) => {
    buffer += bytes;
    if (buffer.length > 8 * 1024 ** 2) { fail(new Error("Observer response buffer cap")); child.kill(); return; }
    let newline;
    while ((newline = buffer.indexOf("\n")) >= 0) {
      const line = buffer.slice(0, newline).trim(); buffer = buffer.slice(newline + 1);
      try {
        assert.ok(pending, "Unexpected observer response");
        const value = JSON.parse(line), operation = pending; pending = null; operation.resolve(value);
      } catch (error) { fail(error); child.kill(); return; }
    }
  });
  const response = (request, timeout) => new Promise((resolve, reject) => {
    if (fatal) { reject(fatal); return; }
    if (pending) { reject(new Error("Only one observer operation may be pending")); return; }
    const timer = setTimeout(() => { fail(new Error("Native observer response timed out")); child.kill(); }, timeout);
    pending = { resolve: (value) => { clearTimeout(timer); resolve(value); }, reject: (error) => { clearTimeout(timer); reject(error); } };
    if (request) child.stdin.write(`${request}\n`);
  });
  const close = async () => {
    if (child.exitCode != null || child.signalCode != null) return;
    await new Promise((resolve) => {
      const timer = setTimeout(() => { child.kill(); }, 3000);
      child.once("exit", () => { clearTimeout(timer); resolve(); });
      child.stdin.end("quit\n");
    });
  };
  try { assert.equal((await response(null, 15000)).ready, true); }
  catch (error) { await close(); throw error; }
  return { pid: child.pid, intervalMs, close,
    async drain() {
      const batch = await response("drain", 5000);
      sequence = validateNativeBatch(batch, rootPid, sequence); return batch;
    } };
}
