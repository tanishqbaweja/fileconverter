// ONE changed private diagnostic, not an acceptance rerun or native converter.
import assert from "node:assert/strict";
import { spawn } from "node:child_process";
import { createHash } from "node:crypto";
import { access, readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import { gzipSync, gunzipSync } from "node:zlib";
import { createOwnedRuntimeScratch } from "./lib/owned-runtime-scratch.mjs";
import { queryProcessIdentity, observeOwnedProcessExit } from "./lib/owned-process-exit-observation.mjs";
import { makeAiffId3DiagnosticLaunchRecipe } from "./lib/aiff-id3-direct-diagnostic-recipe.mjs";
const root = path.resolve(import.meta.dirname, ".."), stamp = new Date().toISOString().replaceAll(/[:.]/g, "-");
assert.equal(process.argv.length, 2);
const runtime = await createOwnedRuntimeScratch("aiff-id3-diagnostic-launch-");
const sha = bytes => createHash("sha256").update(bytes).digest("hex");
let child = null, completion = null, identity = null, absence = null, code = null, failure = null, recipe = null, archive = null;
try {
  recipe = makeAiffId3DiagnosticLaunchRecipe(await readFile(path.join(root, "scripts/validate-aiff-id3-stress.mjs"), "utf8"), root);
  const bytes = Buffer.from(recipe.generated), compressed = gzipSync(bytes, { level: 9 });
  assert.deepEqual(gunzipSync(compressed), bytes);
  const file = `outputs/reports/${stamp}-aiff-id3-direct-diagnostic-executed-launch.mjs.gz`;
  await writeFile(path.join(root, file), compressed, { flag: "wx" });
  archive = { path: file, bytes: compressed.length, sha256: sha(compressed), restoredBytes: bytes.length, restoredSha256: sha(bytes) };
  const target = path.join(runtime.directory, "launch.mjs"); await writeFile(target, bytes, { flag: "wx" });
  child = spawn(process.execPath, [target, "direct-handle"], { cwd: root, env: runtime.env, windowsHide: true, stdio: "inherit" });
  completion = new Promise((resolve, reject) => { child.once("error", reject); child.once("exit", resolve); });
  identity = await queryProcessIdentity(child.pid); assert.ok(identity && identity.parentPid === process.pid);
  code = await completion;
  process.exitCode = code ?? 1;
} catch (error) { failure = String(error.stack ?? error).slice(0, 8192); process.exitCode = 1; }
finally {
  try {
    // Never remove scratch under a live child or kill an unverified PID.
    if (completion && code === null) {
      try { code = await completion; } catch (error) { failure ??= String(error).slice(0, 8192); }
    }
    if (identity) { absence = await observeOwnedProcessExit(identity); assert.equal(absence.status, "owned-identity-absent"); }
  } finally { await runtime.close(); await assert.rejects(access(runtime.directory), { code: "ENOENT" }); }
}
const proofPath = `evidence/${stamp}-aiff-id3-direct-diagnostic-launch.json`;
await writeFile(path.join(root, proofPath), JSON.stringify({ recordedAt: new Date().toISOString(),
  diagnosticOnly: true, productionAcceptance: false, noAutomaticRetry: true, childExitCode: code, failure,
  baseLaunchSha256: recipe?.baseSha256 ?? null, executedLaunch: archive, identity, absence,
  ownedRuntime: runtime.directory, ownedRuntimeRemoved: true, subprocessWindowsHidden: true, browserHeadless: true }, null, 2) + "\n", { flag: "wx" });
console.log(JSON.stringify({ proofPath, diagnosticOnly: true, childExitCode: code, failure, ownedRuntimeRemoved: true }));
