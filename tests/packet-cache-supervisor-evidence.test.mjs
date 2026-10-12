import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { readFile } from "node:fs/promises";
import path from "node:path";
import test from "node:test";

const root = path.resolve(import.meta.dirname, ".."), read = name => readFile(path.join(root, name));
const sha = bytes => createHash("sha256").update(bytes).digest("hex");
const audit = JSON.parse(await read("evidence/2026-10-12T09-52-49-560Z-packet-cache-supervisor-probe-audit.json"));

test("actual ordinary-launcher-exit control retains real identities, bounded journal, failure and cleanup without claiming interruption survival", async () => {
  const bytes = await read(audit.report.path); assert.equal(sha(bytes), audit.report.sha256); assert.equal(bytes.length, audit.report.bytes);
  assert.ok(bytes.length <= 262144);
  const report = JSON.parse(bytes), observationBytes = await read(audit.observation.path), observation = JSON.parse(observationBytes);
  assert.equal(sha(observationBytes), audit.observation.sha256);
  assert.deepEqual(observation.rows, [report.supervisorIdentity, report.childIdentity]);
  assert.equal(observation.launcherPidAbsent, true); assert.equal(observation.journalStatusObserved, "running");
  assert.equal(report.childExit.code, 7); assert.equal(report.runtimeRemoved, true);
  for (const stream of [report.stdout, report.stderr]) {
    assert.equal(stream.totalBytes, 1048576); assert.equal(stream.retainedBytes, 65536);
  }
  assert.equal(audit.appAbortSurvivalVerified, false); assert.equal(audit.nativeMemoryRecoveryVerified, false);
  assert.equal(audit.conversionAcceptance, false); assert.equal(audit.noConversionRelaunched, true);
  assert.ok(audit.exitChecks.every(row => row.ownedBirthAbsent));
});

test("five actual supervisor source preimages and audit own preimage join current bytes, no frozen333 harness file modified", async () => {
  const report = JSON.parse(await read(audit.report.path)); assert.equal(Object.keys(report.sourcePins).length, 5);
  for (const [file, pin] of Object.entries(report.sourcePins)) {
    const bytes = await read(file); assert.equal(sha(bytes), pin); assert.deepEqual(bytes, Buffer.from(report.sourcePreimages[file], "base64"));
  }
  const own = await read(audit.ownSource.path); assert.equal(sha(own), audit.ownSource.sha256);
  assert.deepEqual(own, Buffer.from(audit.ownSource.preimage, "base64"));
  const fullProof = JSON.parse(await read("evidence/2026-10-12T05-48-04-956Z-packet-cache-original-full-preparation.json"));
  assert.equal(sha(await read("scripts/run-packet-cache-original-full.mjs")), fullProof.sourcePins["scripts/run-packet-cache-original-full.mjs"]);
});
