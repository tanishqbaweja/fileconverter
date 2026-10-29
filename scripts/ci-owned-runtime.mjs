// Durable ownership across GitHub job steps; never sweep a previous job's data.
import assert from "node:assert/strict";
import { appendFile, lstat, readFile, realpath, rm, writeFile } from "node:fs/promises";
import path from "node:path";
import { pathToFileURL } from "node:url";
import { createOwnedRuntimeScratch } from "./lib/owned-runtime-scratch.mjs";

const work = path.resolve(import.meta.dirname, "../work");
const ownerName = "ci-runtime-owner.json";
const binding = env => {
  const keys = ["GITHUB_RUN_ID", "GITHUB_RUN_ATTEMPT", "GITHUB_JOB", "GITHUB_SHA"];
  for (const key of keys) assert.match(env[key] ?? "", /^[a-zA-Z0-9_-]{1,128}$/);
  return Object.fromEntries(keys.map(key => [key, env[key]]));
};

export async function prepareCiRuntime(env = process.env) {
  const job = binding(env);
  assert.ok(env.GITHUB_ENV, "GitHub's per-step environment file is required");
  const runtime = await createOwnedRuntimeScratch("ci-");
  try {
    const identity = await lstat(runtime.directory, { bigint: true });
    const owner = path.join(runtime.directory, ownerName);
    await writeFile(owner, JSON.stringify({ schemaVersion: 1, directory: runtime.directory,
      dev: String(identity.dev), ino: String(identity.ino), job }), { flag: "wx" });
    const scoped = { TEMP: runtime.directory, TMP: runtime.directory, TMPDIR: runtime.directory,
      NODE_COMPILE_CACHE: runtime.env.NODE_COMPILE_CACHE, WRANGLER_LOG_PATH: runtime.env.WRANGLER_LOG_PATH,
      npm_config_cache: path.join(runtime.directory, "npm-cache"),
      PLAYWRIGHT_BROWSERS_PATH: path.join(runtime.directory, "browsers"),
      PIP_CACHE_DIR: path.join(runtime.directory, "pip-cache"),
      XDG_CACHE_HOME: path.join(runtime.directory, "xdg-cache"),
      WITHIN_CI_RUNTIME_OWNER: owner };
    for (const value of Object.values(scoped)) assert.doesNotMatch(value, /[\r\n]/);
    await appendFile(env.GITHUB_ENV, Object.entries(scoped).map(([k, v]) => `${k}=${v}\n`).join(""));
    return { directory: runtime.directory, env: scoped };
  } catch (error) { await runtime.close(); throw error; }
}

export async function cleanupCiRuntime(env = process.env) {
  // Prepare might not have run at all (checkout/setup failure). No target, no sweep.
  const owner = env.WITHIN_CI_RUNTIME_OWNER;
  if (!owner) return { status: "not-created", noProcessesKilled: true };
  const directory = path.dirname(owner);
  assert.equal(path.dirname(directory), work);
  assert.match(path.basename(directory), /^ci-[a-zA-Z0-9]{6}$/);
  assert.equal(path.basename(owner), ownerName);
  assert.equal(await realpath(work), work);
  assert.equal(await realpath(directory), directory, "Owned directory was redirected");
  const identity = await lstat(directory, { bigint: true }), ownerIdentity = await lstat(owner);
  assert.ok(identity.isDirectory() && !identity.isSymbolicLink());
  assert.ok(ownerIdentity.isFile() && !ownerIdentity.isSymbolicLink() && ownerIdentity.size <= 8192);
  const record = JSON.parse(await readFile(owner, "utf8"));
  assert.equal(record.schemaVersion, 1); assert.equal(record.directory, directory);
  assert.deepEqual(record.job, binding(env), "A different job cannot clean this runtime");
  assert.equal(record.dev, String(identity.dev)); assert.equal(record.ino, String(identity.ino));
  await rm(directory, { recursive: true, force: false, maxRetries: 5, retryDelay: 100 });
  return { status: "owned-runtime-removed", directory, noProcessesKilled: true };
}

if (process.argv[1] && import.meta.url === pathToFileURL(path.resolve(process.argv[1])).href) {
  assert.equal(process.argv.length, 3);
  assert.ok(["prepare", "cleanup"].includes(process.argv[2]));
  console.log(JSON.stringify(await (process.argv[2] === "prepare" ? prepareCiRuntime() : cleanupCiRuntime())));
}
