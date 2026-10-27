import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";
import { knownOwnedExitsComplete, summarizeShellLoadPairs } from "../scripts/lib/static-shell-memory-experiment.mjs";

const rows = () => [
  { variant: "production", incrementalLoadPrivateMiB: 100 }, { variant: "static", incrementalLoadPrivateMiB: 90 },
  { variant: "static", incrementalLoadPrivateMiB: 102 }, { variant: "production", incrementalLoadPrivateMiB: 99 },
  { variant: "production", incrementalLoadPrivateMiB: 101 }, { variant: "static", incrementalLoadPrivateMiB: 91 },
];
test("matched page-load math retains reversed pairs, regressions and all six runs", () => {
  const result = summarizeShellLoadPairs(rows());
  assert.deepEqual(result.pairs.map(pair => pair.candidateReductionMiB), [10, -3, 10]);
  assert.equal(result.baselineMedianMiB, 100); assert.equal(result.candidateMedianMiB, 91);
  assert.equal(result.pairedReductionMedianMiB, 10); assert.equal(result.candidateLowerInEveryPair, false);
  assert.match(result.scope, /not conversion memory/);
});
test("unavailable or nonfinite measurements never become zero or disappear from the pair count", () => {
  for (const value of [null, undefined, NaN, Infinity]) { const input = rows(); input[0].incrementalLoadPrivateMiB = value;
    assert.throws(() => summarizeShellLoadPairs(input)); }
  assert.throws(() => summarizeShellLoadPairs(rows().slice(0, 5)));
});
test("a partial stop-command warning cannot replace complete PID/parent/birth absence proof", () => {
  const identities = [{ pid: 101, parentPid: 1, createdAt: "2026-10-27T00:00:00Z" }, { pid: 102, parentPid: 101, createdAt: "2026-10-27T00:00:01Z" }];
  const observations = identities.map(identity => ({ identity, status: "owned-identity-absent" }));
  assert.equal(knownOwnedExitsComplete(identities, observations), true);
  assert.equal(knownOwnedExitsComplete(identities, observations.slice(0, 1)), false);
  assert.equal(knownOwnedExitsComplete([], []), false);
  assert.equal(knownOwnedExitsComplete(identities, [{ identity: identities[0], status: "owned-identity-not-proven-absent" }, observations[1]]), false);
});
test("native page-load protocol keeps normal URL/services, complete tree, early baseline, reversed order and owned cleanup", async () => {
  const source = await readFile("scripts/lib/static-shell-memory-experiment.mjs", "utf8");
  assert.match(source, /startBirthAwareMonitor/); assert.match(source, /stableWindow\(row.samples\)/);
  assert.match(source, /row.baselineAdjusted = false/); assert.match(source, /unavailableSamples, 0/);
  assert.match(source, /peak.privateBytes - row.blankBaseline.privateBytes/);
  assert.match(source, /\["production", "static", "static", "production", "production", "static"\]/);
  assert.match(source, /"--headless=new"/); assert.match(source, /await page.goto\(origin \+ "\/"/);
  assert.doesNotMatch(source, /--disable-|--no-sandbox|forceGC|HeapProfiler.collectGarbage|setInputFiles/);
  assert.match(source, /queryReliableProcessIdentity\(child.pid\), identity/);
  assert.match(source, /observeOwnedProcessExit\(identity\)/); assert.match(source, /caseRuntime.close\(\)/);
  assert.match(source, /conversionMemoryAcceptance: false/); assert.match(source, /publicPromotion: false/);
});
