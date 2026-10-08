import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { access, readFile } from "node:fs/promises";
import path from "node:path";
import test from "node:test";
const root = path.resolve(import.meta.dirname, "..");
const json = async file => JSON.parse(await readFile(path.join(root, file)));
const sha = bytes => createHash("sha256").update(bytes).digest("hex");

test("eight actual current-Chrome audio scope reports retain tags/negative controls/full decode and finally cleanup", async () => {
  const proof = await json("evidence/audio-destination-scopes-current-chrome-cli-2026-10-08.json");
  assert.equal(proof.status, "passed-eight-current-installed-chrome-small-scope-checks");
  assert.equal(proof.exitCode, 0); assert.equal(proof.failure, null); assert.equal(proof.reports.length, 8);
  assert.equal(new Set(proof.reports.map(row => row.profileId)).size, 8);
  assert.equal(proof.ownedRuntimeRemoved, true);
  await assert.rejects(access(proof.ownedRuntime), { code: "ENOENT" });
  for (const field of ["protectedOriginalRead", "nativeConverterUsed", "completeChromiumMemoryAcceptance",
    "scalingAcceptance", "lossyQualityAcceptance", "artworkAcceptance", "speedupAcceptance", "publicAcceptance"])
    assert.equal(proof[field], false);
  for (const [file, hash] of Object.entries(proof.sourcePins)) assert.equal(sha(await readFile(path.join(root, file))), hash);
  for (const row of proof.reports) {
    assert.match(row.path, /^output\/playwright\/audio-destination-scopes-[a-z0-9-]+-[0-9a-f-]{36}\.json$/);
    const bytes = await readFile(path.join(root, row.path)); assert.equal(sha(bytes), row.sha256);
    const report = JSON.parse(bytes);
    assert.equal(report.browser, "154.0.8037.98");
    assert.equal(report.status, "passed-small-destination-scope-check");
    assert.equal(report.fullIndependentDecode, "passed");
    assert.equal(report.output.positive.scope, "audio-stream");
    assert.equal(report.output.positive.fields.length, 7);
    for (const field of report.output.positive.fields) {
      assert.equal(field.status, "preserved"); assert.equal(field.actualValue, field.expectedValue);
    }
    assert.equal(report.output.changed.status, "failed");
    assert.equal(report.output.changed.fields[0].status, "changed");
    assert.equal(report.output.wrongScope.status, "failed");
    for (const field of report.output.wrongScope.fields) {
      assert.equal(field.status, "missing"); assert.equal(field.actualValue, null);
    }
    const metrics = report.browserState.metrics;
    assert.equal(metrics.wasmMemoryBytes, 33554432); assert.equal(metrics.peakWasmMemoryBytes, 33554432);
    assert.ok(metrics.peakPendingOperations <= 1); assert.equal(metrics.pendingOperations, 0);
    assert.equal(metrics.queuedBytes, 0);
    for (const field of ["maxReadChunkBytes", "maxWriteChunkBytes", "peakQueuedBytes"]) assert.ok(metrics[field] <= 262144);
    assert.equal(report.opfsCleanupVerified, true); assert.equal(report.ownedFixturesAndOutputsRemoved, true);
    assert.deepEqual(report.remainingOpfsEntries, []); assert.equal(report.sourcePinsUnchanged, true);
    assert.deepEqual(report.sourcePins, report.postSourcePins);
    await assert.rejects(access(report.runtimeDirectory), { code: "ENOENT" });
  }
});

test("initial Windows server-path failure remains zero conversions with exact executed source and removed runtime", async () => {
  const failed = await json("evidence/audio-destination-scopes-current-chrome-2026-10-08.json");
  assert.equal(failed.status, "failed-or-incomplete"); assert.equal(failed.exitCode, 1);
  assert.deepEqual(failed.reports, []); assert.equal(failed.ownedRuntimeRemoved, true);
  await assert.rejects(access(failed.ownedRuntime), { code: "ENOENT" });
  for (const [file, hash] of Object.entries(failed.sourcePins)) assert.equal(sha(await readFile(path.join(root, file))), hash);
  const correction = await readFile(path.join(root, "scripts/check-audio-destination-scopes-current-chrome-cli.mjs"), "utf8");
  assert.ok(correction.includes("node_modules/wrangler/bin/wrangler.js"));
  assert.ok(correction.includes("assert.equal(reverse, source"));
  assert.ok(correction.includes("finally { await runtime.close(); }"));
});
