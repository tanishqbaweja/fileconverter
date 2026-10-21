import assert from "node:assert/strict";
import { spawn, execFile } from "node:child_process";
import { readFile } from "node:fs/promises";
import path from "node:path";
import { promisify } from "node:util";
import { once } from "node:events";
import { queryProcessIdentity } from "./owned-process-exit-observation.mjs";
const pause = ms => new Promise(resolve => setTimeout(resolve, ms));
async function identity(pid) {
  if (process.platform === "win32") return queryProcessIdentity(pid);
  try {
    const line = await readFile(`/proc/${pid}/stat`, "utf8"), fields = line.slice(line.lastIndexOf(")") + 2).split(" ");
    assert.match(fields[19], /^\d+$/); return { pid, parentPid: Number(fields[1]), startTicks: fields[19] };
  } catch (error) { if (error.code === "ENOENT") return null; throw error; }
}
/** Own one fresh server process/group. Never attach to/reuse an existing server. */
export async function startOwnedProductionTestServer({ root, directory, env, port }) {
  assert.ok(Number.isInteger(port) && port > 1024 && port < 65536);
  const { createServer } = await import("node:net"), probe = createServer();
  await new Promise((resolve, reject) => { probe.once("error", reject); probe.listen(port, "127.0.0.1", resolve); });
  await new Promise(resolve => probe.close(resolve));
  const child = spawn(process.execPath, ["node_modules/wrangler/bin/wrangler.js", "dev", "--config", "dist/server/wrangler.json", "--port", String(port), "--persist-to", path.join(directory, "wrangler")],
    { cwd: root, env, windowsHide: true, detached: process.platform !== "win32", stdio: ["ignore", "pipe", "pipe"] });
  let log = "", spawnError; child.on("error", error => { spawnError = error; });
  for (const stream of [child.stdout, child.stderr]) stream.on("data", bytes => { log = (log + bytes.toString()).slice(-16384); });
  await once(child, "spawn");
  const born = await identity(child.pid); assert.ok(born, "Fresh server identity unavailable");
  let closing;
  const close = () => closing ??= (async () => {
    const current = await identity(child.pid);
    if (current && JSON.stringify(current) === JSON.stringify(born)) {
      if (process.platform === "win32") await promisify(execFile)("taskkill.exe", ["/PID", String(child.pid), "/T", "/F"], { windowsHide: true, timeout: 15000 });
      else process.kill(-child.pid, "SIGTERM");
    }
    for (let attempt = 0; attempt < 40; attempt++) { const now = await identity(child.pid);
      if (!now || JSON.stringify(now) !== JSON.stringify(born)) return { identity: born, ownedRootAbsent: true };
      await pause(100); }
    throw new Error("Owned production server exit unverified");
  })();
  const baseURL = `http://127.0.0.1:${port}`;
  try {
    let ready = false;
    for (let attempt = 0; attempt < 60; attempt++) {
      if (spawnError) throw spawnError; assert.equal(child.exitCode, null, log);
      try { if ((await fetch(baseURL, { signal: AbortSignal.timeout(1000) })).ok) { ready = true; break; } } catch {}
      await pause(500);
    }
    assert.ok(ready, "Owned production server startup failed: " + log);
    return { baseURL, identity: born, close };
  } catch (error) { await close(); throw error; }
}
