// Authenticate two failures; never relabel a selection/allowlist refusal as encode proof.
import assert from "node:assert/strict";
import { test } from "node:test";
import { readFile } from "node:fs/promises";
import { createHash } from "node:crypto";
import { gunzipSync } from "node:zlib";
const root = new URL("../", import.meta.url), read = file => readFile(new URL(file, root)), json = async file => JSON.parse(await read(file));
const prefix = "evidence/2026-11-06-vp9-original-cpu-startup", sha = bytes => createHash("sha256").update(bytes).digest("hex");
test("first original attempt retains exact picker transfer refusal before conversion and null memory, not a native failure", async () => {
  const r = await json(prefix + ".json"); assert.equal(r.executedHead, "eb58dfa636afa3846043f280764e2f801f712f9d");
  assert.equal(r.status, "failed-private-vp9-browser-smoke"); assert.ok(r.failures.some(row => row.includes("Cannot transfer files larger than 50Mb")));
  assert.equal(r.browserResult, undefined); assert.equal(r.memory, undefined); assert.equal(r.originalStartup, undefined);
  assert.equal(r.fixture.protectedOriginal, true); assert.equal(r.fixture.copied, false);
});
test("changed same-host CDP selects entire original, but native width/rate refusal happens with zero media I/O and is not startup acceptance", async () => {
  const r = await json(prefix + "-attempt2.json"), result = r.browserResult;
  assert.equal(r.executedHead, "004fe9ecf030c548bb13bd84d335ab436987fc11"); assert.equal(r.inputSelection.completeOriginalSelected, true);
  assert.equal(r.inputSelection.remotePlaywrightUpload, false); assert.equal(r.inputSelection.sourceCopyCreated, false);
  assert.equal(result.sourceFileBytes, 2958573265); assert.equal(result.sourceCopied, false); assert.equal(result.encoder, null);
  assert.equal(result.type, "error"); assert.match(result.message, /outside the bounded allowlist/);
  assert.equal(result.metrics.inputBytes, 0); assert.equal(result.metrics.outputBytes, 0); assert.equal(result.writeAttempts, 0);
  assert.equal(result.cleanupComplete, true); assert.equal(result.partialOutputBytes, 0);
  assert.equal(r.originalStartup.passedStartupOnly, false); assert.equal(r.originalStartup.fullOriginalConverted, false);
  assert.equal(r.originalStartup.independentFullFidelityPassed, false); assert.equal(r.originalStartup.partialOutputRemoved, true);
  assert.equal(r.memory.incrementalPrivateMiB, (514392064 - 350576640) / 1048576); assert.equal(r.memory.incrementalPrivateMiB, 156.2265625);
  assert.equal(r.memory.validSamples, 25); assert.equal(r.memory.unavailableSamples, 0); assert.equal(r.publicAcceptance, false);
});
test("both failed attempts preserve exact raw evidence and remove owned data/processes without modifying protected original", async () => {
  const manifest = await json(prefix + "-archives.json"); assert.equal(manifest.allRoundtripsVerified, true);
  assert.equal(manifest.reports.length, 2); assert.equal(manifest.originalBytes, 486544); assert.equal(manifest.retainedBytes, 158217);
  for (const row of manifest.reports) {
    const r = await json(row.file), packed = await read(r.rawArchive.file), raw = gunzipSync(packed, { maxOutputLength: 8388608 });
    assert.equal(sha(packed), r.rawArchive.sha256); assert.equal(sha(raw), r.rawArchive.decodedSha256);
    assert.equal(raw.length, r.rawArchive.decodedBytes); assert.equal(sha(await read(row.file)), row.compactSha256);
    assert.equal(r.ownedRuntimeRemoved, true); assert.equal(r.ownedStaticStageRemoved, true);
    assert.equal(r.processCleanup.length, 3); assert.ok(r.processCleanup.every(value => value.status === "owned-identity-absent"));
    assert.deepEqual(r.originalBefore, r.originalAfter); assert.deepEqual(r.forbiddenRequests, []);
    assert.equal(r.originalAfter.sha256, "31f36695b5b44c62125a9e4264e84dc085accd21c02cc3487aae597f54b9db34");
  }
});
