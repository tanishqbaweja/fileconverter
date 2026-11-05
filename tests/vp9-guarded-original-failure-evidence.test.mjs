import assert from "node:assert/strict";
import { test } from "node:test";
import { readFile } from "node:fs/promises";
import { gunzipSync } from "node:zlib";
import { createHash } from "node:crypto";
const read = file => readFile(new URL("../" + file, import.meta.url)), json = async f => JSON.parse(await read(f)),
  base = "evidence/2026-11-06-vp9-original-cpu-startup-attempt4", r = await json(base + ".json"),
  sha = value => createHash("sha256").update(value).digest("hex");
test("guarded original actual failure changes to frame-buffer allocation, never a successful conversion/startup", () => {
  assert.equal(r.executedHead, "cdb3f497beac021ccfabe74da0dbaeadad82a159");
  assert.equal(r.status, "failed-private-vp9-browser-smoke"); assert.equal(r.privateCpuOverride.runId, 42129383089);
  assert.equal(r.browserResult.nativeBrowserCpuOnly, true); assert.equal(r.browserResult.sourceCopied, false);
  assert.equal(r.browserResult.sourceFileBytes, 2958573265);
  assert.match(r.browserResult.message, /Failed to allocate frame buffer/); assert.doesNotMatch(r.browserResult.message, /Failed to allocate temporal filter buffer/);
  assert.equal(r.browserResult.metrics.inputBytes, 353857); assert.equal(r.browserResult.metrics.outputBytes, 485);
  assert.equal(r.originalStartup.passedStartupOnly, false); assert.equal(r.originalStartup.fullOriginalConverted, false);
  assert.equal(r.originalStartup.independentFullFidelityPassed, false); assert.equal(r.browserResult.partialOutputBytes, 0);
  assert.equal(r.browserResult.cleanupComplete, true); assert.equal(r.originalStartup.partialOutputRemoved, true);
  assert.equal(r.memory.incrementalPrivateMiB, 187.3125);
  assert.equal(r.memory.incrementalPrivateMiB, (r.memory.peak.privateBytes - r.blankBaseline.privateBytes) / 1048576);
  assert.equal(r.memory.validSamples, 30); assert.equal(r.memory.unavailableSamples, 0);
});
test("three matching source sites are retained without inventing exact failure site, allocation size or live heap", async () => {
  const audit = await json("evidence/2026-11-06-vp9-frame-buffer-failure-audit.json");
  assert.equal(audit.callSites.length, 3); assert.equal(audit.currentRunId, 42129383089);
  assert.equal(audit.source.sha256, "9c831c453796fcd08598da8b8e27a494fde8d681e87349facd590c48949e9693");
  assert.equal(audit.actualFailingCallSite, null); assert.equal(audit.exactFailedAllocationBytes, null); assert.equal(audit.actualHeapAtFailureBytes, null);
  assert.equal(audit.lastReportedWasmBytes, 76283904); assert.equal(audit.declaredMaximumWasmBytes, 100663296);
  assert.equal(audit.maximumIsNotActualObservedHeap, true); assert.equal(audit.publicAcceptance, false);
});
test("failed run archives exact evidence, cleans owned data/processes, preserves original and retires only obsolete static tool", async () => {
  assert.equal(r.ownedRuntimeRemoved, true); assert.equal(r.ownedStaticStageRemoved, true);
  assert.ok(r.processCleanup.length === 3 && r.processCleanup.every(row => row.status === "owned-identity-absent"));
  assert.deepEqual(r.forbiddenRequests, []); assert.deepEqual(r.originalBefore, r.originalAfter);
  assert.equal(r.originalAfter.sha256, "31f36695b5b44c62125a9e4264e84dc085accd21c02cc3487aae597f54b9db34");
  const packed = await read(r.rawArchive.file), raw = gunzipSync(packed, { maxOutputLength: 8388608 });
  assert.equal(sha(packed), r.rawArchive.sha256); assert.equal(sha(raw), r.rawArchive.decodedSha256); assert.equal(raw.length, 282431);
  const archive = await json(base + "-archive.json"); assert.equal(archive.retainedBytes, 98698); assert.equal(archive.allRoundtripsVerified, true);
  const cleanup = await json("evidence/2026-11-06-vp9-original-width-superseded-input-cleanup.json");
  assert.equal(cleanup.removed, true); assert.equal(cleanup.verifiedExactOwnedContents, true);
  assert.equal(cleanup.target, "work/vp9-duration-input-42122918540"); assert.equal(cleanup.files, 17); assert.equal(cleanup.bytes, 10416178);
  assert.equal(cleanup.replacementRunId, 42129383089); assert.equal(cleanup.userMediaReadOrRemoved, false);
});
