import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { readFile } from "node:fs/promises";
import test from "node:test";
const read = (p) => readFile(new URL(`../${p}`, import.meta.url));
const e = JSON.parse(await read("evidence/owned-runtime-scratch-2026-10-04.json"));

test("actual runtime helper evidence proves local generated logs/update checks and cleanup in both caller outcomes", () => {
  assert.equal(e.status, "passed-helper-lifecycle"); assert.equal(e.runs.length, 2);
  assert.deepEqual(e.runs.map((r) => r.scenario), ["successful-helper", "injected-caller-failure"]);
  assert.equal(e.runs[0].callerError, null); assert.equal(e.runs[1].callerError, "intentional caller failure");
  for (const run of e.runs) {
    assert.equal(run.httpReady, true); assert.equal(run.coop, "same-origin"); assert.equal(run.coep, "require-corp");
    assert.equal(run.cspPresent, true); assert.equal(run.ownedRuntimeAbsent, true);
    assert.equal(run.runtimeBytesRemoved, run.runtimeFilesRemoved.reduce((sum, f) => sum + f.bytes, 0));
    assert.equal(run.runtimeBytesRemoved, 9076);
    assert.equal(run.compileCacheFilesObserved, 0, "Do not fabricate a cache file just to satisfy a helper test");
    assert.equal(run.compileCacheConfinedEnvironment, true);
    assert.equal(run.fileSelectionCount, 0); assert.equal(run.conversionCount, 0);
  }
  assert.equal(e.totalRuntimeFileBytesRemoved, 18152);
  assert.deepEqual(e.newSharedWorkEntries, []); assert.equal(e.blockedHistoricalTargetsTouched, false);
  assert.equal(e.rejectedTest.failedAssertion, "Actual Node cache was scoped locally");
});

test("runtime lifecycle proof binds current wiring without replacing historical executed conversion measurements", async () => {
  for (const [file, expected] of Object.entries(e.currentSources)) {
    assert.equal(createHash("sha256").update(await read(file)).digest("hex"), expected, file);
  }
  for (const file of ["scripts/test-owned-runtime-scratch.mjs", "scripts/lib/owned-runtime-scratch.mjs"]) {
    assert.equal(e.currentSources[file], e.executedSources[file], "Real helper execution bytes stay exactly reproduced");
  }
  assert.equal(JSON.parse(await read("package.json")).devDependencies.wrangler, e.dependency.wranglerVersion);
  const earlier = JSON.parse(await read("evidence/production-native-memory-2026-10-04.json"));
  assert.equal(earlier.executedAtCommit, "b4c8db6f92be0f13f7eaeb25b65edba649aa13b6");
  assert.equal(earlier.executedSources["scripts/memory-profile.mjs"], "d14d4b0fd2d6f315cb703c1854d3db500418ba8787a899551d78ec67caa2e17c");
  assert.notEqual(earlier.currentSources["scripts/memory-profile.mjs"], earlier.executedSources["scripts/memory-profile.mjs"]);
  assert.equal(earlier.incrementalPrivateMiB, 236.5); assert.equal(earlier.runs.length, 3);
});
