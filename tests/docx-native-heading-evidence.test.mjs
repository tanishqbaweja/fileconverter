import assert from "node:assert/strict";
import test from "node:test";
import { readFile } from "node:fs/promises";
import { gunzipSync } from "node:zlib";
import { createHash } from "node:crypto";
import { reviewDocxHtmlIntegration } from "../scripts/lib/reviewed-docx-html-integration.mjs";
import { prePptxMetricWorker } from "../scripts/lib/reviewed-pptx-destination-metrics.mjs";
const read = file => readFile(new URL("../" + file.replaceAll("\\", "/"), import.meta.url));
const sha = bytes => createHash("sha256").update(bytes).digest("hex");
const raw = await read("evidence/2026-11-07T03-28-03-106Z-docx-html-qualification.json");
assert.equal(sha(raw), "46f97fa291b749551d7540f38720b018e61d3bc6d71df2fcf110890fc9851806");
const r = JSON.parse(raw);
const historical = JSON.parse(await read("fixtures/source/docx-before-run-emphasis-2026-11-07.json"));
test("historical native-generated heading fixture has three independently validated browser outputs, not current emphasis/full Word/scaling qualification", async () => {
  assert.equal(r.status, "passed-private-native-heading-and-recovery-control-not-scaling-or-promotion");
  assert.equal(r.executedHead, "e6ba305b07716a1cb3d461053bd9f2f571bb4345");
  assert.equal(r.outlineControl.fixtureBytes, 36933); assert.equal(r.outlineControl.generated.styleDefinitions, 166);
  assert.equal(r.outlineControl.fixtureSha256, "c2e3f8b7d1c2802e05eecddda9a197fd1d7c7be990320ba62ef4d7bc257e214b");
  assert.equal(r.outlineControl.cases.length, 3);
  for (const c of r.outlineControl.cases) {
    assert.equal(c.outputBytes, 887); assert.equal(c.validated.blocks, 8); assert.deepEqual(c.validated.headingLevels, [1, 2, 3, 9]);
    assert.equal(c.validated.tableCells, 2); assert.equal(c.validated.csp, true);
    assert.equal(c.validated.sha256, "b96bb990f9b011eba9dec30a3e62b9fefd76119c4a101769471192acf262bc07");
    assert.equal(c.destinationObservation.actualFileHandle, true); assert.equal(c.destinationObservation.mode, "handle");
    assert.equal(c.metrics.activeWorkerCount, 1); assert.equal(c.metrics.sharedArrayBufferBytes, 0);
    assert.equal(c.metrics.pendingOperations, 0); assert.equal(c.metrics.queuedBytes, 0); assert.equal(c.metrics.peakPendingOperations, 1);
    assert.ok(c.metrics.maxReadChunkBytes <= 262144 && c.metrics.maxWriteChunkBytes <= 65536 && c.metrics.peakQueuedBytes <= 65536);
  }
  assert.deepEqual(r.outlineControl.validatorControls.map(c => c.exitCode), [0, 1, 1, 1, 1]);
  for (const key of ["workers/docx-html-conversion.ts", "workers/docx-conversion.ts", "workers/docx-outline.ts", "workers/conversion.worker.ts", "lib/capability-registry.ts"])
    if (historical.files[key]) {
      assert.equal(historical.executedBrowserHead, r.executedHead);
      assert.equal(sha(Buffer.from(historical.files[key].utf8)), r.sourcePins[key]);
      assert.equal(historical.files[key].sha256, r.sourcePins[key]);
    } else if (key === "lib/capability-registry.ts") assert.equal(sha(reviewDocxHtmlIntegration(key, await read(key)).previousReviewedBytes), r.sourcePins[key]);
    else if (key === "workers/conversion.worker.ts") assert.equal(sha(prePptxMetricWorker(await read(key))), r.sourcePins[key]);
    else assert.equal(sha(await read(key)), r.sourcePins[key]);
  assert.equal(r.smallNativeHeadingRecoveryVerified, true); assert.equal(r.outlineControlVerified, false);
  assert.equal(r.largeFileScalingVerified, false); assert.equal(r.publicPromotion, false); assert.equal(r.nativePickerVerified, false);
  assert.equal(r.nativeConversionUsed, false); assert.equal(r.headed, false); assert.equal(r.browserServicesDisabled, false);
});
test("immutable full native journal reproduces global peak and original heading cleanup windows, including one late first-run sample", async () => {
  const packed = await read(r.nativeArchive.file); assert.equal(sha(packed), r.nativeArchive.sha256);
  const bytes = gunzipSync(packed, { maxOutputLength: 4194304 }); assert.equal(sha(bytes), r.nativeArchive.decodedSha256);
  const samples = JSON.parse(bytes), window = m => samples.filter(s => Date.parse(s.timestamp) >= Date.parse(m.windowStart) && Date.parse(s.timestamp) <= Date.parse(m.windowEnd));
  for (const s of samples) if (s.privateBytes !== null) assert.equal(s.processes.reduce((n, p) => n + p.privateBytes, 0), s.privateBytes);
  const active = window(r.memory); assert.equal(active.length, 330); assert.equal(active.filter(s => s.privateBytes === null).length, 0);
  assert.equal((Math.max(...active.map(s => s.privateBytes)) - r.blankBaseline.privateBytes) / 1048576, 50.2890625);
  const finalCounts = [];
  for (const c of r.outlineControl.cases) {
    const m = c.smallRunMemory, rows = window(m).filter(s => s.privateBytes !== null); finalCounts.push(rows.length);
    assert.equal(Math.max(...rows.map(s => s.privateBytes)), m.peak.privateBytes);
    assert.equal((m.cleanupStable.privateBytes - r.loadedIdle.privateBytes) / 1048576, m.cleanupDeltaFromLoadedMiB);
    assert.ok(m.cleanupDeltaFromLoadedMiB <= 96 && m.incrementalPrivateMiB <= 250);
  }
  assert.deepEqual(finalCounts, [97, 96, 114]); assert.equal(r.outlineControl.cases[0].smallRunMemory.validSamples, 96, "Historical online count is not rewritten");
  assert.deepEqual(r.outlineControl.cases.map(c => c.smallRunMemory.cleanupDeltaFromLoadedMiB), [12.25, 13.67578125, 11.0859375]);
});
test("real-payload cancellation/write failure/golden recovery, privacy and birth-checked complete owned PID cleanup pass", async () => {
  const cancel = r.cases.find(c => c.kind === "payload-cancel"), error = r.cases.find(c => c.kind === "write-error"), recovery = r.cases.at(-1);
  assert.equal(cancel.armedMetrics.outputBytes, 2162688); assert.equal(cancel.metrics.outputBytes, 2293760); assert.deepEqual(cancel.leftovers, []);
  assert.match(error.message, /destination rejected a bounded write/); assert.deepEqual(error.leftovers, []);
  assert.equal(recovery.kind, "complete"); assert.equal(recovery.outputBytes, 720);
  assert.equal(recovery.validated.sha256, "31bbd28016f7eaef9a9c2ef4fbf91221c7f34450710949302daacdcef5de0a55");
  assert.deepEqual(r.failures, []); assert.deepEqual(r.forbiddenRequests, []);
  assert.equal(r.browserCleanup.status, "owned-observed-pids-absent"); assert.equal(r.browserCleanup.observedPids.length, 29);
  assert.equal(r.browserCleanup.rootIdentityMatched, true); assert.equal(r.browserCleanup.individualChildKills, false);
  assert.deepEqual(r.browserCleanup.observations.at(-1).current, []); assert.equal(r.serverCleanup.ownedRootAbsent, true);
  assert.equal(r.ownedRuntimeRemoved, true); assert.deepEqual(r.protectedOriginalBefore, r.protectedOriginalAfter);
  assert.equal(r.protectedOriginalAfter.sha256, "31f36695b5b44c62125a9e4264e84dc085accd21c02cc3487aae597f54b9db34");
  assert.equal(sha(await read("scripts/lib/owned-chromium-cleanup.mjs")), r.sourcePins["scripts/lib/owned-chromium-cleanup.mjs"]);
});
