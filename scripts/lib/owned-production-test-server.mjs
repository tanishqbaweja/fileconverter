import assert from "node:assert/strict";
import { spawn, execFile } from "node:child_process";
import { readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import { pathToFileURL } from "node:url";
import { promisify } from "node:util";
import { once } from "node:events";
import { queryReliableProcessIdentity } from "./reliable-owned-identity.mjs";
import { createOwnedServerCloser } from "./owned-server-close.mjs";
const pause = ms => new Promise(resolve => setTimeout(resolve, ms));
async function identity(pid) {
  if (process.platform === "win32") return queryReliableProcessIdentity(pid);
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
  // Wrangler launches nested Node/native helpers. Inherit the test-only
  // subprocess preload as well as hiding the initial server process.
  const preload = `--import=${JSON.stringify(pathToFileURL(path.join(import.meta.dirname, "hidden-unit-subprocesses.mjs")).href)}`;
  const serverEnv = { ...(env ?? process.env), NODE_OPTIONS: [env?.NODE_OPTIONS ?? process.env.NODE_OPTIONS ?? "", preload].filter(Boolean).join(" ") };
  const args = ["node_modules/wrangler/bin/wrangler.js", "dev", "--config", "dist/server/wrangler.json", "--port", String(port), "--persist-to", path.join(directory, "wrangler")];
  const child = spawn(process.execPath, args,
    { cwd: root, env: serverEnv, windowsHide: true, detached: process.platform !== "win32", stdio: ["ignore", "pipe", "pipe"] });
  let log = "", spawnError; child.on("error", error => { spawnError = error; });
  for (const stream of [child.stdout, child.stderr]) stream.on("data", bytes => { log = (log + bytes.toString()).slice(-16384); });
  await once(child, "spawn");
  const born = await identity(child.pid); assert.ok(born, "Fresh server identity unavailable");
  const close = createOwnedServerCloser({ born, readIdentity: identity, terminate: async pid => {
    if (process.platform === "win32") await promisify(execFile)("taskkill.exe", ["/PID", String(pid), "/T", "/F"], { windowsHide: true, timeout: 15000 });
    else process.kill(-pid, "SIGTERM");
  } });
  const baseURL = `http://127.0.0.1:${port}`;
  try {
    const launchRecord = { schemaVersion: 1, role: "owned-production-test-server", identity: born,
      root, directory, executable: process.execPath, arguments: args, baseURL,
      windowsHide: true, nestedSubprocessPreload: preload };
    await writeFile(path.join(directory, "owned-production-server-launch.json"), JSON.stringify(launchRecord, null, 2) + "\n", { flag: "wx" });
    let ready = false;
    for (let attempt = 0; attempt < 60; attempt++) {
      if (spawnError) throw spawnError; assert.equal(child.exitCode, null, log);
      try { if ((await fetch(baseURL, { signal: AbortSignal.timeout(1000) })).ok) { ready = true; break; } } catch {}
      await pause(500);
    }
    assert.ok(ready, "Owned production server startup failed: " + log);
    return { baseURL, identity: born, launchRecord, close };
  } catch (error) {
    try { await close(); } catch (cleanupError) { throw new AggregateError([error, cleanupError], "Owned production server startup and cleanup failed"); }
    throw error;
  }
}
