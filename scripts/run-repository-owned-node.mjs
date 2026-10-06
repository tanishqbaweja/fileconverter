// Scope subprocess caches/logs/temp to one fresh repository-owned runtime, clean on every exit.
import assert from "node:assert/strict";
import { spawn } from "node:child_process";
import path from "node:path";
import { createOwnedRuntimeScratch } from "./lib/owned-runtime-scratch.mjs";
const root = path.resolve(import.meta.dirname, ".."), args = process.argv.slice(2);
assert.ok(args.length > 0 && args.length <= 32);
const runtime = await createOwnedRuntimeScratch("repository-node-command-");
try {
  const child = spawn(process.execPath, args, { cwd: root, env: { ...runtime.env,
    WRANGLER_SEND_METRICS: "false", NEXT_TELEMETRY_DISABLED: "1" }, windowsHide: true, stdio: "inherit" });
  const code = await new Promise((resolve, reject) => { child.once("error", reject); child.once("exit", (code, signal) => {
    if (signal) reject(new Error(`Owned command terminated by ${signal}`)); else resolve(code); }); });
  process.exitCode = code ?? 1;
} finally { await runtime.close(); }
