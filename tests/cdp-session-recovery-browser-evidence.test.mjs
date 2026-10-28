import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";
import { sha } from "../images/resvg-source/source-pins.mjs";
const read = file => readFile(new URL("../" + file, import.meta.url));
test("actual repaired diagnostic browser verification keeps all ten assertions and a scoped full-tree pass, never causal optimization or release proof", async () => {
  const proof = JSON.parse(await read("evidence/2026-10-28-cdp-session-recovery-browser-terminal.json")), bytes = await read(proof.rawReport);
  assert.equal(bytes.length, proof.rawReportBytes); assert.equal(sha(bytes), proof.rawReportSha256);
  const row = JSON.parse(bytes); assert.equal(row.executedHead, proof.executedHead); assert.deepEqual(row.failures, []);
  assert.equal(row.status, "passed-ten-private-small-svg-browser-cases-not-public-stress-acceptance");
  assert.deepEqual([row.stats.expected, row.stats.unexpected, row.stats.skipped, row.stats.flaky], [10, 0, 0, 0]);
  assert.equal(row.cases.length, 10); assert.ok(row.cases.every(value => value.ok));
  assert.equal(row.memory.incrementalPrivateMiB, (row.memory.peak.privateBytes - row.blankBaseline.privateBytes) / 1048576);
  assert.equal(row.memory.incrementalPrivateMiB, 241.7578125); assert.equal(row.memory.limitMiB, 250);
  assert.equal(row.memory.validSamples, 156); assert.equal(row.memory.unavailableSamples, 0);
  assert.equal(row.baselineAdjusted, false); assert.equal(row.browserServicesDisabledByDriver, false);
  assert.equal(row.domSnapshotRecording, true); assert.equal(row.networkHarRecording, true);
  assert.equal(row.allocationDiagnostic, false); assert.equal(row.allocatorCaptures.length, 0);
  let available = 0, unavailable = 0;
  for (const sample of row.realmSamples) for (const target of sample.targets ?? []) if (target.type === "worker") {
    if (target.usedJSHeapBytes === null) { unavailable++; assert.ok(target.error); } else { available++; assert.ok(target.usedJSHeapBytes >= 0); }
  }
  assert.deepEqual([available, unavailable], [22, 13]);
  assert.equal(row.ownedRuntimeRemoved, true); assert.equal(row.processCleanup.length, 4);
  assert.ok(row.processCleanup.every(value => value.status === "owned-identity-absent"));
  assert.deepEqual(row.protectedOriginalAfter, row.protectedOriginalBefore);
  assert.equal(row.publicEngineReplacement, false); assert.equal(row.fullStressOrOomAcceptance, false);
  assert.equal(proof.repeatableMemoryOrSpeedImprovementProven, false); assert.equal(proof.priorFailureRelabelled, false);
  for (const [file, digest] of Object.entries(row.sourcePins)) assert.equal(sha(await read(file)), digest, file);
});
test("actual private raw source-path witness remains measured and is not labelled successful reproduction", async () => {
  const row = JSON.parse(await read("evidence/2026-10-27-svg-source-path-audit.json"));
  assert.equal(row.ownedRandomBuildPrefixOccurrences, 188); assert.deepEqual(row.sectionIds, [11]);
  assert.equal(row.uniquePrefixes.length, 1); assert.match(row.uniquePrefixes[0], /resvg-source-compile-HOdYcB$/);
  assert.equal(row.rawBinaryRetainedOnDisk, false); assert.equal(row.sourceRecompileExecuted, false);
  assert.equal(row.sourceBuildRepeatProven, false); assert.equal(row.publicReplacement, false);
});
