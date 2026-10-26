import assert from "node:assert/strict";
import { access, readFile, readdir } from "node:fs/promises";
import path from "node:path";
import { spawnSync } from "node:child_process";
import test from "node:test";
import { transform, version } from "esbuild";

const json = async file => JSON.parse(await readFile(file, "utf8"));
test("the static converter has no unused database CLI/dependency and explicitly owns its actual compiler dependency", async () => {
  const pkg = await json("package.json"), lock = await json("package-lock.json");
  assert.equal(pkg.scripts["db:generate"], undefined);
  for (const group of ["dependencies", "devDependencies"]) {
    assert.equal(pkg[group]["drizzle-kit"], undefined); assert.equal(pkg[group]["drizzle-orm"], undefined);
    assert.deepEqual(lock.packages[""][group], pkg[group]);
  }
  assert.match(pkg.devDependencies.esbuild, /^\d+\.\d+\.\d+$/);
  assert.equal(lock.packages["node_modules/esbuild"].version, pkg.devDependencies.esbuild);
  const [major, minor, patch] = pkg.devDependencies.esbuild.split(".").map(Number);
  assert.ok(major > 0 || minor > 28 || (minor === 28 && patch >= 1), "Explicit compiler includes the Windows development-server patch");
  assert.equal(version, pkg.devDependencies.esbuild, "Installed compiler must match the explicit pin");
  assert.ok(!Object.keys(lock.packages).some(key => /(?:drizzle-kit|drizzle-orm|@esbuild-kit)(?:\/|$)/.test(key)));
  await assert.rejects(access("drizzle.config.ts"), { code: "ENOENT" });
  // The original empty migration journal is preserved, not erased as user data.
  assert.deepEqual((await json("drizzle/meta/_journal.json")).entries, []);
});
test("retained before/final lock audits remove exactly the three unused advisory groups, not every esbuild finding", async () => {
  const before = await json("evidence/2026-10-26-database-scaffold-audit-before.json");
  const after = await json("evidence/2026-10-26-database-scaffold-audit-final.json");
  assert.deepEqual(before.audit.metadata.vulnerabilities, { info: 0, low: 1, moderate: 6, high: 15, critical: 0, total: 22 });
  assert.deepEqual(after.audit.metadata.vulnerabilities, { info: 0, low: 2, moderate: 2, high: 15, critical: 0, total: 19 });
  const removedGroups = Object.keys(before.audit.vulnerabilities).filter(name => !after.audit.vulnerabilities[name]);
  assert.deepEqual(removedGroups.sort(), ["@esbuild-kit/core-utils", "@esbuild-kit/esm-loader", "drizzle-kit"]);
  assert.equal(after.audit.vulnerabilities.esbuild.severity, "low");
  assert.ok(after.audit.vulnerabilities.esbuild.nodes.includes("node_modules/wrangler/node_modules/esbuild"));
  assert.ok(!after.audit.vulnerabilities.esbuild.nodes.includes("node_modules/esbuild"));
  assert.equal(before.auditExitCode, 1); assert.equal(after.auditExitCode, 1); // Remaining findings, not a clean audit.
  assert.equal(before.cleanup.ownedScratchRemoved, true); assert.equal(after.cleanup.ownedScratchRemoved, true);
});
test("recorded lock derivation removes only unused scaffold packages and changes only explicit esbuild artifacts or three peer flags", async () => {
  const before = (await json("evidence/2026-10-26-database-scaffold-audit-before.json")).packageEntries;
  const after = (await json("evidence/2026-10-26-database-scaffold-audit-final.json")).packageEntries;
  assert.equal(Object.keys(before).length, 743); assert.equal(Object.keys(after).length, 687);
  assert.deepEqual(Object.keys(after).filter(key => !before[key]), []);
  const removed = Object.keys(before).filter(key => !after[key]); assert.equal(removed.length, 56);
  for (const key of removed) assert.match(key, /^node_modules\/(?:@drizzle-team\/brocli|@esbuild-kit\/(?:core-utils|esm-loader)|drizzle-kit|drizzle-orm|tsx)(?:\/|$)/);
  const changed = Object.keys(after).filter(key => before[key] !== after[key]); assert.equal(changed.length, 30);
  for (const key of changed) assert.match(key, /^node_modules\/(?:@esbuild\/[^/]+|esbuild|buffer-from|source-map|source-map-support)$/);
  assert.equal(Object.keys(after).filter(key => before[key] === after[key]).length, 657);
});
test("production source has no Drizzle consumer or active remote storage binding; existing static host policy is retained", async () => {
  const hosting = await json(".openai/hosting.json"); assert.equal(hosting.d1, null); assert.equal(hosting.r2, null);
  for (const directory of ["app", "lib", "workers", "worker", "build"]) {
    for (const file of await readdir(directory, { recursive: true })) {
      if (!/\.tsx?$/.test(file)) continue;
      const source = await readFile(path.join(directory, file), "utf8");
      assert.doesNotMatch(source, /(?:from\s+|import\s*\(|require\s*\()\s*["'](?:drizzle-orm|drizzle-kit|@esbuild-kit)(?:["'/])/);
    }
  }
  const worker = await readFile("worker/index.ts", "utf8");
  assert.match(worker, /rejectNonStaticRequest\(request\)/); assert.doesNotMatch(worker, /\b(?:DB|D1Database|R2Bucket)\b/);
});
test("the explicit compiler transforms bounded JSX/TypeScript without introducing a conversion or network path", async () => {
  const result = await transform("const value: number = 2; export const View = () => <b>{value}</b>;", {
    loader: "tsx", jsx: "automatic", format: "esm", sourcemap: false,
  });
  assert.match(result.code, /react\/jsx-runtime/); assert.match(result.code, /value = 2/);
  assert.equal(result.warnings.length, 0);
  const source = await readFile("scripts/capture-dependency-audit.mjs", "utf8");
  assert.match(source, /windowsHide: true/); assert.match(source, /npm_config_cache: path.join\(runtime.directory/);
  assert.match(source, /finally[\s\S]*await runtime.close\(\)/); assert.match(source, /flag: "wx"/);
});
test("audit capture refuses unsafe or existing labels before starting npm or creating scratch, leaving historical evidence intact", async () => {
  const label = "2026-10-26-database-scaffold-audit-final", receipt = `evidence/${label}.json`;
  const original = await readFile(receipt);
  for (const candidate of [label, "../outside", ""]) {
    const result = spawnSync(process.execPath, ["scripts/capture-dependency-audit.mjs", candidate], {
      windowsHide: true, encoding: "utf8", timeout: 10000, maxBuffer: 65536,
    });
    assert.equal(result.error, undefined); assert.equal(result.status, 1);
    assert.match(result.stderr, /AssertionError/); assert.equal(result.stdout, "");
  }
  assert.deepEqual(await readFile(receipt), original);
  const source = await readFile("scripts/capture-dependency-audit.mjs", "utf8");
  assert.ok(source.indexOf("assert.rejects(access(destination)") < source.indexOf("await createOwnedRuntimeScratch"));
});
