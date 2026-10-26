// Capture the exact npm lock audit without sending any user files or media.
import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { createHash } from "node:crypto";
import { access, readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import { createOwnedRuntimeScratch } from "./lib/owned-runtime-scratch.mjs";

const root = path.resolve(import.meta.dirname, ".."), label = process.argv[2];
assert.match(label ?? "", /^[a-z0-9][a-z0-9-]{1,64}$/);
assert.equal(process.argv.length, 3);
const destination = path.join(root, "evidence", `${label}.json`);
await assert.rejects(access(destination), { code: "ENOENT" }, "Choose a new label; never replay or overwrite an existing audit");
const sha = bytes => createHash("sha256").update(bytes).digest("hex");
const packageBytes = await readFile(path.join(root, "package.json"));
const lockBytes = await readFile(path.join(root, "package-lock.json"));
const lock = JSON.parse(lockBytes), runtime = await createOwnedRuntimeScratch("dependency-audit-");
const report = { schemaVersion: 1, scope: "npm lock dependency audit only; no runtime exploit, Wasm, conversion or memory certification",
  command: "npm audit --json --ignore-scripts --package-lock-only", startedAt: new Date().toISOString(),
  packageSha256: sha(packageBytes), lockSha256: sha(lockBytes),
  packageEntries: Object.fromEntries(Object.entries(lock.packages).filter(([key]) => key).map(([key, value]) => [key, sha(JSON.stringify(value))])),
  graphRoot: lock.packages[""], cleanup: { ownedScratchRemoved: false } };
try {
  const npmCli = process.env.npm_execpath ?? path.join(path.dirname(process.execPath), "node_modules/npm/bin/npm-cli.js");
  const result = spawnSync(process.execPath, [npmCli, "audit", "--json", "--ignore-scripts", "--package-lock-only"], {
    cwd: root, windowsHide: true, encoding: "utf8", maxBuffer: 4 * 1048576, timeout: 180000,
    env: { ...runtime.env, npm_config_cache: path.join(runtime.directory, "npm-cache"), npm_config_update_notifier: "false" },
  });
  if (result.error) throw result.error;
  assert.ok(result.status === 0 || result.status === 1, `npm audit exit ${result.status}`);
  report.auditExitCode = result.status; report.audit = JSON.parse(result.stdout);
  assert.equal(report.audit.auditReportVersion, 2); assert.equal(report.audit.error, undefined);
  assert.ok(report.audit.metadata?.vulnerabilities);
  assert.equal(sha(await readFile(path.join(root, "package-lock.json"))), report.lockSha256, "Audit must not modify lock");
} finally {
  await runtime.close(); report.cleanup.ownedScratchRemoved = true;
}
report.finishedAt = new Date().toISOString();
await writeFile(destination, JSON.stringify(report, null, 2) + "\n", { flag: "wx" });
console.log(JSON.stringify({ path: path.relative(root, destination).replaceAll("\\", "/"),
  auditExitCode: report.auditExitCode, vulnerabilities: report.audit.metadata.vulnerabilities,
  packageEntries: Object.keys(report.packageEntries).length, cleanup: report.cleanup }));
