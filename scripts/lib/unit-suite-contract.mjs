import assert from "node:assert/strict";
import { readFile, readdir } from "node:fs/promises";
import path from "node:path";

const validFile = value => typeof value === "string" && /^tests\/[a-z0-9-]+\.test\.mjs$/.test(value);
export function planUnitSuites(files, manifest, baseline, sources = {}) {
  assert.equal(manifest.schemaVersion, 1); assert.equal(baseline.schemaVersion, 1);
  assert.ok(Array.isArray(files) && files.length > 0 && files.every(validFile));
  assert.equal(new Set(files).size, files.length, "Duplicate discovered test");
  assert.ok(Array.isArray(baseline.files) && baseline.files.length > 0 && baseline.files.every(validFile));
  assert.equal(new Set(baseline.files).size, baseline.files.length);
  const discovered = new Set(files), qualification = new Map();
  assert.ok(Array.isArray(manifest.groups) && manifest.groups.length > 0);
  const ids = new Set();
  for (const group of manifest.groups) {
    assert.match(group.id, /^[a-z][a-z-]+$/); assert.ok(!ids.has(group.id)); ids.add(group.id);
    assert.ok(typeof group.reason === "string" && group.reason.length >= 40);
    assert.ok(Array.isArray(group.files) && group.files.length > 0);
    for (const file of group.files) {
      assert.ok(validFile(file) && discovered.has(file), `Stale/invalid qualification entry: ${file}`);
      assert.ok(!qualification.has(file), `Duplicate qualification entry: ${file}`);
      assert.ok(!baseline.files.includes(file), `Previously hosted public/unit gate cannot leave portable: ${file}`);
      assert.doesNotMatch(sources[file] ?? "", /(?:from\s*|import\s*\()\s*["']\.\.\/(?:lib|workers|app)\//,
        `Production-importing tests must stay portable: ${file}`);
      qualification.set(file, { group: group.id, reason: group.reason });
    }
  }
  for (const file of baseline.files) assert.ok(discovered.has(file), `Prior hosted unit gate removed: ${file}`);
  const all = [...files].sort(), portable = all.filter(file => !qualification.has(file));
  assert.ok(portable.length > 0);
  return { all, portable, qualification: all.filter(file => qualification.has(file)),
    prerequisites: Object.fromEntries(qualification), protectedPriorHostedFiles: baseline.files.length,
    policy: "New tests are portable by default. Qualification is separate, still mandatory where relevant, and never implicitly passed." };
}

export async function loadUnitSuitePlan(root) {
  const files = (await readdir(path.join(root, "tests"))).filter(file => file.endsWith(".test.mjs")).map(file => "tests/" + file);
  const manifest = JSON.parse(await readFile(path.join(root, "tests/qualification-suites.json")));
  const baseline = JSON.parse(await readFile(path.join(root, "tests/portable-unit-baseline.json")));
  const sources = {};
  // Inspect only explicit exceptions. No automatic classification by failure,
  // filename prefix, environment variable, missing dependency or OS platform.
  for (const group of manifest.groups) for (const file of group.files) {
    assert.ok(validFile(file)); sources[file] = await readFile(path.join(root, file), "utf8");
  }
  return planUnitSuites(files, manifest, baseline, sources);
}
