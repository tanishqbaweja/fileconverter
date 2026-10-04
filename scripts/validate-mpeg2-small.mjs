// Own disposable helper scratch and restore generated assets on every exit.
import assert from "node:assert/strict";
import { execFile, spawn } from "node:child_process";
import { access } from "node:fs/promises";
import { createServer } from "node:net";
import path from "node:path";
import { promisify } from "node:util";
import { createOwnedRuntimeScratch, finishOwnedCleanup } from "./lib/owned-runtime-scratch.mjs";

const root = path.resolve(import.meta.dirname, ".."), exec = promisify(execFile);
assert.ok(process.argv.length === 2 || (process.argv.length === 3 && process.argv[2] === "--cleanup-smoke"));
const cleanupSmoke = process.argv[2] === "--cleanup-smoke";
let runtime, server, runner, staged = false;
const stop = async (child) => {
  if (!child?.pid || child.exitCode != null || child.signalCode != null) return;
  if (process.platform === "win32") {
    await exec("taskkill.exe", ["/PID", String(child.pid), "/T", "/F"], { windowsHide: true });
  } else { process.kill(-child.pid, "SIGTERM"); }
};
try {
  runtime = await createOwnedRuntimeScratch("mpeg2-runtime-");
  if (cleanupSmoke) {
    await exec(process.execPath, ["scripts/stage-mpeg2-candidate.mjs", "stage", "byob"],
      { cwd: root, env: runtime.env, windowsHide: true }); staged = true;
    process.stdout.write(`Restoration-only cleanup smoke: ${runtime.directory}\n`);
  } else {
  const port = await new Promise((resolve, reject) => {
    const listener = createServer(); listener.once("error", reject);
    listener.listen(0, "127.0.0.1", () => {
      const value = listener.address().port;
      listener.close((error) => error ? reject(error) : resolve(value));
    });
  });
  const origin = `http://127.0.0.1:${port}`;
  const environment = { ...runtime.env, WRANGLER_SEND_METRICS: "false",
    WITHIN_REUSE_SERVER: "1", WITHIN_TEST_BASE_URL: origin, WITHIN_TEST_PORT: String(port),
    WITHIN_BROWSER_CHANNEL: "chrome", WITHIN_TEST_VIDEO: "off" };
  await exec(process.execPath, ["scripts/stage-mpeg2-candidate.mjs", "stage", "byob"],
    { cwd: root, env: environment, windowsHide: true }); staged = true;
  server = spawn(process.execPath, ["node_modules/wrangler/bin/wrangler.js", "dev",
    "--config", "dist/server/wrangler.json", "--port", String(port)],
  { cwd: root, env: environment, windowsHide: true, detached: process.platform !== "win32", stdio: "ignore" });
  const deadline = Date.now() + 30_000; let ready = false;
  while (Date.now() < deadline) {
    if (server.exitCode != null) throw new Error("Production server exited during startup.");
    try { if ((await fetch(origin)).ok) { ready = true; break; } } catch { /* bounded startup */ }
    await new Promise((resolve) => setTimeout(resolve, 250));
  }
  assert.ok(ready, "Production server failed to start");
  runner = spawn(process.execPath, ["node_modules/@playwright/test/cli.js", "test",
    "tests/browser/mpeg2-candidate.spec.ts", "--reporter=line"],
  { cwd: root, env: environment, windowsHide: true, detached: process.platform !== "win32", stdio: "inherit" });
  await new Promise((resolve, reject) => {
    const timer = setTimeout(() => reject(new Error("Private correctness test timeout; no automatic retry.")), 180_000);
    runner.once("error", (error) => { clearTimeout(timer); reject(error); });
    runner.once("exit", (code) => {
      clearTimeout(timer);
      if (code === 0) resolve();
      else reject(new Error(`Private correctness tests exited ${code}`));
    });
  });
  }
} catch (error) {
  process.stderr.write(`${error.stack ?? error}\n`); process.exitCode = 1;
} finally {
  // Stop helper trees before restoring files/removing their owned scratch.
  await finishOwnedCleanup([() => stop(runner), () => stop(server)]);
  // Restoration spawns a Node child using this scratch. Its exit/cache flush
  // must finish BEFORE removal; these are dependent, not parallel actions.
  try {
    if (staged) await exec(process.execPath, ["scripts/stage-mpeg2-candidate.mjs", "restore", "byob"],
      { cwd: root, env: runtime?.env, windowsHide: true });
  } finally { if (runtime) await runtime.close(); }
  if (runtime) await assert.rejects(access(runtime.directory), { code: "ENOENT" });
  process.stdout.write("Private MPEG2 helper trees stopped, generated assets restored, owned runtime scratch removed.\n");
}
