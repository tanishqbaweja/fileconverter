import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";
const json = async filename => JSON.parse(await readFile(filename, "utf8"));

test("actual first load uses simultaneous full-tree peak minus early blank median, not a conversion or complete pair", async () => {
  const value = await json("evidence/2026-10-27T11-11-16-393Z-static-shell-memory.json"), proof = value.memoryComparison;
  assert.equal(proof.status, "failed-matched-page-load-diagnostic"); assert.equal(proof.cases.length, 2); assert.equal(proof.summary, undefined);
  const first = proof.cases[0]; assert.equal(first.blankBaseline.stable, true); assert.equal(first.baselineAdjusted, false);
  assert.equal(first.incrementalLoadPrivateMiB, (first.loadPeak.peak.privateBytes - first.blankBaseline.privateBytes) / 1048576);
  assert.equal(first.incrementalLoadPrivateMiB, 71.33984375); assert.equal(first.loadPeak.validSamples, 196);
  assert.equal(first.loadPeak.unavailableSamples, 0); assert.equal(proof.filesSelected, 0); assert.equal(proof.conversionsPerformed, 0);
  assert.equal(proof.browserPinBefore.version, "156.0.8078.48"); assert.equal(proof.conversionMemoryAcceptance, false);
});
test("second blank failed before navigation; all births absent does not rewrite the failed run or create a static benefit", async () => {
  const value = await json("evidence/2026-10-27T11-11-16-393Z-static-shell-memory.json"), row = value.memoryComparison.cases[1];
  assert.equal(row.blankBaseline, null); assert.equal(row.incrementalLoadPrivateMiB, undefined);
  assert.match(row.failures[0], /Earliest blank stability deadline/); assert.equal(row.cleanupErrors.length, 1);
  assert.ok(row.processCleanup.every(entry => entry.status === "owned-identity-absent"));
  assert.equal(row.observerCleanup.status, "owned-identity-absent"); assert.notEqual(value.ownedRuntimeRemoved, true);
  for (const entry of value.memoryComparison.cases) assert.ok(entry.arguments.every(arg => !arg.startsWith("--disable-") && arg !== "--no-sandbox"));
});
test("closed owned scratch recovery reclaims exact generated targets without killing processes or touching blocked traces", async () => {
  const value = await json("evidence/2026-10-27T11-25-12-451Z-static-shell-scratch-cleanup.json");
  assert.equal(value.noProcessesKilled, true); assert.equal(value.noLiveReferences, true); assert.equal(value.directories.length, 2);
  assert.ok(value.directories.every(directory => directory.removed && directory.files > 0 && /^[a-f0-9]{64}$/.test(directory.inventorySha256)));
  assert.equal(value.removedBytes, 188512156); assert.equal(value.directories.reduce((sum, directory) => sum + directory.bytes, 0), value.removedBytes);
  assert.ok(value.observations.every(row => !row.current || Math.abs(Date.parse(row.current.createdAt) - Date.parse(row.identity.createdAt)) >= 1));
});
