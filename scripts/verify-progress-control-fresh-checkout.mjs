// Small, isolated Git-blob checkout: prove recipe tests do not borrow local engines/dist.
import assert from "node:assert/strict";
import { execFile } from "node:child_process";
import { access, mkdir, readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import { promisify } from "node:util";
import { createOwnedRuntimeScratch } from "./lib/owned-runtime-scratch.mjs";
import { sha } from "./lib/stable-ui-headless-baseline-recipe.mjs";
const root = path.resolve(import.meta.dirname, ".."), exec = promisify(execFile);
assert.equal(process.argv.length, 2);
const files = ["scripts/lib/archived-js-copy-control.mjs", "scripts/lib/progress-compositing-progress-recipe.mjs",
  "scripts/lib/split-copy-progress-recipe.mjs", "scripts/lib/split-render-progress-recipe.mjs", "scripts/lib/stable-ui-headless-baseline-recipe.mjs",
  "scripts/diagnose-progress-compositing-original.mjs", "scripts/lib/driver-source-pin-union.mjs", "tests/progress-compositing-progress.test.mjs",
  "evidence/2026-10-09T15-42-44-939Z-progress-compositing-golden-analysis.json", "evidence/2026-10-09T14-31-37-500Z-split-copy-progress.json",
  "outputs/reports/2026-10-09T14-31-37-500Z-split-copy-progress-baseline-raw.json.gz", "outputs/reports/2026-10-08T22-04-15-944Z-ui-progress-baseline-executed-sources.json.gz"];
const { stdout: commit } = await exec("git", ["rev-parse", "HEAD"], { cwd: root, windowsHide: true, timeout: 15000 });
assert.match(commit.trim(), /^[a-f0-9]{40}$/);
const runtime = await createOwnedRuntimeScratch("progress-control-fresh-checkout-");
const checkout = path.join(runtime.directory, "checkout"), pins = {}; let copiedBytes = 0, result = null, failure = null;
try {
  for (const file of files) {
    const { stdout: bytes } = await exec("git", ["show", `${commit.trim()}:${file}`],
      { cwd: root, windowsHide: true, encoding: "buffer", maxBuffer: 2 * 1024 ** 2, timeout: 15000 });
    assert.ok(Buffer.isBuffer(bytes)); assert.deepEqual(bytes, await readFile(path.join(root, file)), "Must test exactly the committed source");
    copiedBytes += bytes.length; assert.ok(copiedBytes <= 2 * 1024 ** 2, "Bounded tiny checkout, never copy media/core");
    const target = path.join(checkout, file); await mkdir(path.dirname(target), { recursive: true });
    await writeFile(target, bytes, { flag: "wx" }); pins[file] = { bytes: bytes.length, sha256: sha(bytes) };
  }
  for (const name of ["node_modules", "dist", "work", "test.mkv"]) await assert.rejects(access(path.join(checkout, name)), { code: "ENOENT" });
  result = await exec(process.execPath, ["--test", "tests/progress-compositing-progress.test.mjs"],
    { cwd: checkout, env: runtime.env, windowsHide: true, maxBuffer: 65536, timeout: 30000 });
  assert.match(result.stdout, /tests 3/); assert.match(result.stdout, /pass 3/); assert.match(result.stdout, /fail 0/);
} catch (error) { failure = String(error.stack ?? error).slice(0, 8192); process.exitCode = 1; }
finally { await runtime.close(); await assert.rejects(access(runtime.directory), { code: "ENOENT" }); }
const stamp = new Date().toISOString().replaceAll(/[:.]/g, "-");
const proof = { recordedAt: new Date().toISOString(), status: failure ? "failed" : "three-recipe-tests-pass-from-isolated-committed-checkout", failure,
  commit: commit.trim(), sourcePins: pins, copiedBytes, directory: checkout, ownedRuntimeAbsent: true,
  platform: process.platform, architecture: process.arch, node: process.version,
  noLocalNodeModulesOrDistOrCoreOrProtectedFixture: true, noBrowserLaunch: true, noConversion: true, windowsHidden: true,
  tests: { passed: failure ? null : 3, failed: failure ? null : 0, stdout: result?.stdout.slice(0, 8192) ?? null, stderr: result?.stderr.slice(0, 1024) ?? null },
  scope: "This one recipe-test family in an isolated Windows Git-blob checkout; not Linux or all-repository CI/reproducibility acceptance",
  fullRepositoryCiAcceptance: false, linuxAcceptance: false, conversionAcceptance: false };
const output = `evidence/${stamp}-progress-control-fresh-checkout.json`;
await writeFile(path.join(root, output), JSON.stringify(proof, null, 2) + "\n", { flag: "wx" });
console.log(JSON.stringify({ output, status: proof.status, copiedBytes, ownedRuntimeAbsent: true })); assert.equal(failure, null);
