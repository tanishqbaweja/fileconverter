// Helper/storage lifecycle proof only. No user file selected or converted.
import assert from "node:assert/strict";
import { execFile, spawn } from "node:child_process";
import { createHash } from "node:crypto";
import { createServer } from "node:net";
import { readFile, readdir, stat, writeFile } from "node:fs/promises";
import path from "node:path";
import { promisify } from "node:util";
import { createOwnedRuntimeScratch } from "./lib/owned-runtime-scratch.mjs";

const root = path.resolve(import.meta.dirname, ".."), exec = promisify(execFile);
const delay = (ms) => new Promise((resolve) => setTimeout(resolve, ms));
const hash = (bytes) => createHash("sha256").update(bytes).digest("hex");
const before = (await readdir(path.join(root, "work"))).sort(), runs = [];
const allocatedPort = async () => {
  const server = createServer(); await new Promise((resolve) => server.listen(0, "127.0.0.1", resolve));
  const port = server.address().port; await new Promise((resolve) => server.close(resolve)); return port;
};
const stop = async (child) => {
  if (!child || child.exitCode != null || child.signalCode != null) return;
  const exited = new Promise((resolve) => child.once("exit", resolve));
  await exec("taskkill.exe", ["/PID", String(child.pid), "/T", "/F"], { windowsHide: true });
  await Promise.race([exited, delay(5000).then(() => { if (child.exitCode == null && child.signalCode == null) throw new Error("Owned Wrangler did not stop"); })]);
};
let failure = null;
try {
  assert.equal(process.platform, "win32", "This helper smoke uses the owned Windows process-tree terminator");
  for (const scenario of ["successful-helper", "injected-caller-failure"]) {
    const scratch = await createOwnedRuntimeScratch("runtime-smoke-");
    let child, runError = null, headers = null, files = [], totalBytes = 0;
    try {
      const port = await allocatedPort();
      child = spawn(process.execPath, [path.join(root, "node_modules/wrangler/bin/wrangler.js"), "dev",
        "--config", "dist/server/wrangler.json", "--port", String(port)],
      { cwd: root, env: { ...scratch.env, WRANGLER_SEND_METRICS: "false" }, windowsHide: true, stdio: "ignore" });
      const deadline = Date.now() + 30000;
      let response;
      while (Date.now() < deadline) {
        if (child.exitCode != null) throw new Error(`Wrangler exited: ${child.exitCode}`);
        try { response = await fetch(`http://127.0.0.1:${port}`, { signal: AbortSignal.timeout(2000) }); if (response.ok) break; }
        catch { /* Bounded retry during actual server startup. */ }
        await delay(100);
      }
      assert.ok(response?.ok, "Owned production helper readiness timeout");
      headers = Object.fromEntries(["cross-origin-opener-policy", "cross-origin-embedder-policy", "content-security-policy"].map((name) => [name, response.headers.get(name)]));
      assert.equal(headers["cross-origin-opener-policy"], "same-origin");
      assert.equal(headers["cross-origin-embedder-policy"], "require-corp");
      assert.ok(headers["content-security-policy"]);
      assert.match(await response.text(), /Big files\. Small memory\./);
      // Let the real helper write its update-check/log/compile caches locally.
      await delay(3500);
      if (scenario === "injected-caller-failure") throw new Error("intentional caller failure");
    } catch (error) { runError = error.message; }
    finally {
      try {
        await stop(child);
        files = (await readdir(scratch.directory, { recursive: true })).filter((name) => !name.endsWith(path.sep));
        const retained = [];
        for (const name of files) {
          const info = await stat(path.join(scratch.directory, name));
          if (info.isFile()) { totalBytes += info.size; retained.push({ name: name.replaceAll("\\", "/"), bytes: info.size }); }
        }
        files = retained;
      } finally { await scratch.close(); }
    }
    await assert.rejects(stat(scratch.directory), { code: "ENOENT" });
    if (scenario === "successful-helper") assert.equal(runError, null);
    else assert.equal(runError, "intentional caller failure");
    assert.ok(files.some((file) => file.name.startsWith("wrangler-logs/")), "Actual Wrangler logs were scoped locally");
    assert.equal(path.dirname(scratch.env.NODE_COMPILE_CACHE), scratch.directory, "Compile cache, if flushed, must be owned locally");
    runs.push({ scenario, serverPid: child.pid, serverExitCode: child.exitCode, serverSignal: child.signalCode,
      headers, callerError: runError, ownedRuntimeFilesBeforeCleanup: files, runtimeBytesRemoved: totalBytes,
      compileCacheFilesObserved: files.filter((file) => file.name.startsWith("node-compile-cache/")).length,
      compileCacheConfinedEnvironment: true,
      compileCacheNote: "A force-stopped helper may not flush an optional Node compile cache; no cache creation is fabricated",
      ownedRuntimeAbsent: true, fileSelectionCount: 0, conversionCount: 0 });
  }
  assert.deepEqual((await readdir(path.join(root, "work"))).sort(), before, "No new shared work entries remain");
} catch (error) { failure = { name: error.name, message: error.message, stack: error.stack }; process.exitCode = 1; }
const sourceHashes = {};
for (const name of ["scripts/test-owned-runtime-scratch.mjs", "scripts/lib/owned-runtime-scratch.mjs", "scripts/memory-profile.mjs",
  "node_modules/wrangler/package.json"]) sourceHashes[name] = hash(await readFile(path.join(root, name)));
const report = { generatedAt: new Date().toISOString(), scope: "Real production server helper runtime isolation/cleanup; no conversion/memory/speed certification",
  passed: failure == null && runs.length === 2, failure, sourceHashes, runs, sharedWorkNamesBefore: before,
  sharedWorkNamesAfter: (await readdir(path.join(root, "work"))).sort(), blockedHistoricalTargetsTouched: false };
const reportPath = path.join(root, "outputs/reports", `${report.generatedAt.replaceAll(/[:.]/g, "-")}-owned-runtime-scratch.json`);
await writeFile(reportPath, `${JSON.stringify(report, null, 2)}\n`, { encoding: "utf8", flag: "wx" });
process.stdout.write(`${reportPath}\n${JSON.stringify({ passed: report.passed, failure, runs: runs.map((r) => ({ scenario: r.scenario, removedBytes: r.runtimeBytesRemoved, files: r.ownedRuntimeFilesBeforeCleanup.length })) })}\n`);
