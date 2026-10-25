import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { readFile } from "node:fs/promises";
import test from "node:test";
import { gunzipSync } from "node:zlib";
import { validateAudioInterruption } from "../scripts/lib/audio-io-recovery-validation.mjs";
const metrics = { peakWasmMemoryBytes: 33554432, inputBytes: 262144, outputBytes: 4096, queuedBytes: 0, pendingOperations: 0,
  peakPendingOperations: 1, peakQueuedBytes: 4096, maxReadChunkBytes: 262144, maxWriteChunkBytes: 4096 };
const beforeCancel = { jobState: "running", metrics };
const cancel = () => ({ jobState: "cancelled", opfsName: null, opfsNames: [], workerStatus: "ready", error: null, metrics: { ...metrics } });
const proof = () => ({ beforeCancel, storageBefore: [], storageAfter: [] });
test("cancellation evidence requires real input/output progress and recovered production worker, not pre-start interruption", () => {
  const result = validateAudioInterruption("cancel", cancel(), proof());
  assert.equal(result.status, "passed-private-audio-interruption-cleanup"); assert.equal(result.outputAcceptance, false); assert.equal(result.publicAcceptance, false);
  assert.equal(result.realProgressBeforeCancel, true);
  for (const changed of [{ jobState: "idle", metrics }, { jobState: "running", metrics: { ...metrics, inputBytes: 0 } },
    { jobState: "running", metrics: { ...metrics, outputBytes: 0 } }])
    assert.throws(() => validateAudioInterruption("cancel", cancel(), { ...proof(), beforeCancel: changed }));
});
test("terminal success, retained partials, outstanding IO, missing Wasm and oversized buffers cannot pass cancellation proof", () => {
  for (const mutate of [s => { s.jobState = "complete"; }, s => { s.opfsName = "partial.opus"; }, s => { s.opfsNames = ["partial.opus"]; },
    s => { s.workerStatus = "starting"; }, s => { s.metrics.queuedBytes = 1; }, s => { s.metrics.pendingOperations = 1; },
    s => { delete s.metrics.peakWasmMemoryBytes; }, s => { s.metrics.maxReadChunkBytes = 262145; }, s => { s.metrics.peakPendingOperations = 2; }]) {
    const state = cancel(); mutate(state); assert.throws(() => validateAudioInterruption("cancel", state, proof()));
  }
  assert.throws(() => validateAudioInterruption("cancel", cancel(), { ...proof(), storageAfter: [{ name: "partial", bytes: 0 }] }));
  assert.throws(() => validateAudioInterruption("cancel", cancel(), { ...proof(), storageBefore: [{ name: "unknown" }], storageAfter: [{ name: "unknown" }] }));
});
test("write failure proof identifies the existing after-write injection without presenting it as a real OS failure or completed output", () => {
  const state = { ...cancel(), jobState: "error", error: "The destination rejected a bounded write.", metrics: { ...metrics, outputBytes: 0 } };
  const result = validateAudioInterruption("write", state, proof());
  assert.equal(result.outputAcceptance, false); assert.match(result.faultModel, /not-OS-failure/);
  assert.throws(() => validateAudioInterruption("write", { ...state, error: "unrelated failure" }, proof()));
  assert.throws(() => validateAudioInterruption("write", { ...state, metrics: { ...state.metrics, peakQueuedBytes: 0 } }, proof()));
});
test("real browser gate uses existing URL fault handling, UI cancel after progress, same-page recovery and never publishes incomplete output", async () => {
  const source = await readFile("scripts/test-audio-metadata-production-runtime.mjs", "utf8");
  assert.match(source, /--audio-io-recovery/); assert.match(source, /duration=180/);
  assert.match(source, /state\.metrics\?\.inputBytes > 0 && state\.metrics\?\.outputBytes > 0/);
  assert.match(source, /getByRole\("button", \{ name: "Cancel safely", exact: true \}\).click\(\)/);
  assert.match(source, /history.replaceState\(null, "", "\/\?test=1" \+ \(fault \? "&fault=write" : ""\)\)/);
  assert.match(source, /validateAudioInterruption\(conversion.interruption, state/);
  assert.match(source, /bothInterruptionsPassed: true, noContextOrPageRecreation: true, noStaleErrorOrWarning: true/);
  assert.equal(source.split("chromium.launchPersistentContext(").length - 1, 1);
  assert.match(source, /passed-private-audio-interruption-case/); assert.match(source, /compareNativeAudioPcm\(input, output/);
  assert.match(source, /active.peak.privateBytes - report.blankBaseline.privateBytes/); assert.match(source, /await runtime.close\(\)/);
});
test("retained first IO gate stays failed: real native header error had a falsely zero uninitialized Wasm diagnostic", async () => {
  const root = new URL("../", import.meta.url), sha = b => createHash("sha256").update(b).digest("hex");
  const receipt = JSON.parse(await readFile(new URL("evidence/2026-10-25T03-58-45.506Z-audio-metadata-fidelity-result.json", root)));
  assert.equal(receipt.status, "failed"); assert.equal(receipt.publicAcceptance, false); assert.equal(receipt.cases.length, 3);
  assert.equal(receipt.cases[0].status, "passed-private-audio-interruption-case");
  assert.equal(receipt.cases[1].status, "failed"); assert.equal(receipt.cases[2].status, "failed");
  assert.equal(receipt.memory.incrementalPrivateMiB, 195.78515625); assert.equal(receipt.memory.validSamples, 468); assert.equal(receipt.memory.unavailableSamples, 0);
  const archive = await readFile(new URL(receipt.archive.path, root)); assert.equal(sha(archive), receipt.archive.sha256);
  const raw = gunzipSync(archive, { maxOutputLength: 1048576 }); assert.equal(sha(raw), receipt.archive.restoredSha256);
  const report = JSON.parse(raw), cancellation = report.cases[0], failure = report.cases[1];
  assert.ok(cancellation.beforeCancel.metrics.inputBytes > 0 && cancellation.beforeCancel.metrics.outputBytes > 0);
  assert.equal(failure.browserState.jobState, "error"); assert.match(failure.browserState.error, /destination rejected a bounded write.*Audio header write failed: I\/O error/);
  assert.equal(failure.browserState.metrics.peakWasmMemoryBytes, 0); assert.equal(failure.browserState.metrics.maxWriteChunkBytes, 0);
  assert.equal(failure.browserState.metrics.peakQueuedBytes, 47); assert.deepEqual(failure.storageAfter, []);
  assert.ok(receipt.protectedOriginalUnchanged); assert.ok(Object.values(receipt.cleanup).every(Boolean));
  const journal = await readFile(new URL(receipt.losslessJournal.file, root)); assert.equal(sha(journal), receipt.losslessJournal.archiveSha256);
  assert.equal(sha(gunzipSync(journal, { maxOutputLength: 8 * 1048576 })), receipt.losslessJournal.sha256);
  const validator = await readFile(new URL("scripts/lib/audio-io-recovery-validation.mjs", root), "utf8");
  assert.match(validator, /metrics.peakWasmMemoryBytes >= 33554432/); // Fix observation, never relax proof.
});
