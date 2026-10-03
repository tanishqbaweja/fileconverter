// Own every disposable server/profile/temp directory and restore staged dist.
import assert from "node:assert/strict";
import { execFile, spawn } from "node:child_process";
import { lstat, mkdir, mkdtemp, realpath, rm, stat } from "node:fs/promises";
import { createServer } from "node:net";
import path from "node:path";
import { promisify } from "node:util";

const root = path.resolve(import.meta.dirname, ".."), exec = promisify(execFile);
let work, server, staged = false;
try {
  await assert.rejects(stat(path.join(root, "output/playwright/h264-candidate.json")), { code: "ENOENT" });
  work = await mkdtemp(path.join(root, "work/h264-small-validation-"));
  const temporary = path.join(work, "temp"); await mkdir(temporary);
  const port = await new Promise((resolve, reject) => { const listener = createServer(); listener.once("error", reject);
    listener.listen(0, "127.0.0.1", () => { const value = listener.address().port; listener.close((error) => error ? reject(error) : resolve(value)); }); });
  const origin = `http://127.0.0.1:${port}`;
  const environment = { ...process.env, TEMP: temporary, TMP: temporary, WRANGLER_SEND_METRICS: "false",
    WITHIN_REUSE_SERVER: "1", WITHIN_TEST_BASE_URL: origin, WITHIN_TEST_PORT: String(port), WITHIN_BROWSER_CHANNEL: "chrome", WITHIN_TEST_VIDEO: "off" };
  await exec(process.execPath, ["scripts/stage-h264-candidate.mjs", "stage", "byob"], { cwd: root, windowsHide: true }); staged = true;
  server = spawn(process.execPath, ["node_modules/wrangler/bin/wrangler.js", "dev", "--config", "dist/server/wrangler.json", "--port", String(port)],
    { cwd: root, env: environment, windowsHide: true, stdio: "ignore" });
  const deadline = Date.now() + 30_000; let ready = false;
  while (Date.now() < deadline) { try { if ((await fetch(origin)).ok) { ready = true; break; } } catch { /* bounded startup */ }
    await new Promise((resolve) => setTimeout(resolve, 250)); }
  assert.ok(ready, "Production server failed to start");
  const result = await exec(process.execPath, ["node_modules/@playwright/test/cli.js", "test", "tests/browser/h264-candidate.spec.ts", "--reporter=line"],
    { cwd: root, env: environment, windowsHide: true, maxBuffer: 1024 ** 2, timeout: 180_000 });
  process.stdout.write(result.stdout); process.stderr.write(result.stderr);
} catch (error) {
  process.stdout.write(error.stdout ?? ""); process.stderr.write(error.stderr ?? "");
  process.stderr.write(`${error.message}\n`); process.exitCode = 1;
} finally {
  if (server?.pid && server.exitCode == null) await exec("taskkill.exe", ["/PID", String(server.pid), "/T", "/F"], { windowsHide: true }).catch(() => {});
  if (staged) await exec(process.execPath, ["scripts/stage-h264-candidate.mjs", "restore", "byob"], { cwd: root, windowsHide: true });
  if (work) { assert.equal(path.dirname(work), path.join(root, "work")); assert.equal((await lstat(work)).isSymbolicLink(), false);
    assert.equal(await realpath(work), path.join(await realpath(path.join(root, "work")), path.basename(work)));
    await rm(work, { recursive: true, force: true, maxRetries: 5, retryDelay: 500 }); }
}
