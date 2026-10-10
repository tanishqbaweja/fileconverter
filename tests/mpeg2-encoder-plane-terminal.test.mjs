// Synthetic positives test verifier logic only, never actual video acceptance.
import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { readFile } from "node:fs/promises";
import path from "node:path";
import test from "node:test";
import { gunzipSync } from "node:zlib";
import { sha } from "../scripts/lib/stable-ui-headless-baseline-recipe.mjs";
import { encoderPlaneTerminalFacts, recomputeFullSessionNativeFacts } from "../scripts/lib/encoder-plane-terminal-facts.mjs";
const root = path.resolve(import.meta.dirname, ".."), MiB = 1048576;
function synthetic() {
  const processRows = [[0, 100 * MiB, 150 * MiB], [1, 200 * MiB, 300 * MiB]];
  const phase = name => ({ phase: name, validSamples: 10, unavailableSamples: 0,
    peak: [1, "2026-10-10T00:00:00Z", name, 300 * MiB, 450 * MiB, 1, null, processRows] });
  const run = number => ({ number, cimPeakPrivateBytes: (280 + number * 10) * MiB,
    state: { jobState: "complete", opfsName: null, metrics: { wasmMemoryBytes: 50331648, peakWasmMemoryBytes: 50331648,
      maxReadChunkBytes: 65536, maxWriteChunkBytes: 65536, peakQueuedBytes: 65536,
      peakPendingOperations: 1, pendingOperations: 0, queuedBytes: 0, outputBytes: 3000000000, elapsedMs: 1000000 } },
    independentValidation: { fullDecode: true, ssim: 0.99, maximumTimestampErrorSeconds: 0,
      frameCount: 296160, outputBytes: 3000000000, sha256: "a".repeat(64),
      probe: { streams: [{ codec_type: "video", codec_name: "mpeg2video", width: 1920, height: 804, nb_read_frames: "296160" }] } },
    recovery: { stable: true, privateBytes: 150 * MiB } });
  return { status: "passed-private-protected-session", diagnosticOnly: false, requestedRuns: 3,
    source: { path: "test.mkv", bytes: 2958573265, sha256: "31f36695b5b44c62125a9e4264e84dc085accd21c02cc3487aae597f54b9db34" },
    manifest: { artifacts: { "split-encoder.wasm": "a4ba6225414ca7a658d349ae81926e5ed040fa73be4540fe8a7adf7656fe1cee",
      "within-mpeg2-split.wasm": "86704920f30ed243240614df92d05deba9f76c33e739a927903677b677f8a8ec" },
    aggregateWasmMemoryBytes: 50331648, allowMemoryGrowth: false },
    actualWasmMemoryLimits: { decoderMux: [{ imported: true, initialPages: 512, maximumPages: 512, shared: true }],
      encoder: [{ imported: true, initialPages: 256, maximumPages: 256, shared: true }] },
    progressProbe: { mode: "encoder-plane-full-completion", fullCompletionRequired: true,
      partialOutputStopEnabled: false, maximumConversionMs: 21600000, checkpointOutputBytes: null,
      checkpointReached: false, jsAllocationSamplingEnabled: false },
    conversionJsReport: null, forbiddenRequests: [], blankBaseline: { stable: true, privateBytes: 100 * MiB },
    loadedIdle: { stable: true, privateBytes: 150 * MiB },
    startupSettlement: { pageStayedBlank: true, processesExcluded: 0, baselineInflated: false, flagsChanged: false,
      minimumMs: 300000, actualMs: 300001, earlyWindow: { privateBytes: 100 * MiB } },
    abortDiagnostic: { captureError: null, noForcedGc: true, noDebuggerPause: true, syntheticMallocInvoked: false, records: [] },
    limitMiB: 250, formula: "peak complete Chromium process-tree private memory during conversion - stable clean blank-Chromium process-tree private memory",
    nativeMemory: { error: null, intervalMs: 100, phases: [1, 2, 3].flatMap(n => [phase(`pre-conversion-${n}`), phase(`conversion-${n}`)]),
      identities: [{ pid: 100, parentPid: 900, createdAt: "2026-10-10T00:00:00Z" }, { pid: 101, parentPid: 100, createdAt: "2026-10-10T00:00:00Z" }] },
    ownedPids: { chrome: 100 }, runs: [1, 2, 3].map(run), failure: null,
    splitFinalSamples: [1, 2, 3].map(() => ({ frames: 296160, packets: 296160, completedPackets: 296160,
      closed: true, aggregateWasmMemoryBytes: 50331648, activePackets: 0, queuedPackets: 0, queuedFrames: 0,
      additionalPixelBufferBytes: 0, additionalJsPacketBufferBytes: 0 })) };
}
test("Synthetic successful session requires all three validations and simultaneous native/all-repeat CIM peaks; never public/scaling/speed acceptance", () => {
  const value = encoderPlaneTerminalFacts(synthetic());
  assert.equal(value.fullOriginalSessionGatePassed, true); assert.equal(value.completedConversions, 3);
  assert.equal(value.native.actualPeakPrivateBytes, 310 * MiB); assert.equal(value.native.observedIncrementalPrivateMiB, 210);
  assert.equal(value.publicAcceptance, false); assert.equal(value.scalingAcceptance, false);
  assert.equal(value.conversionSpeedAcceptance, false); assert.equal(value.additionalCleanSessionRequired, true);
});
test("Synthetic negatives reject partial/foreign/renamed/unsafe/fidelity/baseline/ownership data; absent samples never become zero", () => {
  for (const mutate of [
    r => { r.runs.pop(); }, r => { r.runs[2].independentValidation = null; },
    r => { r.runs[1].independentValidation.ssim = 0.97; }, r => { r.runs[0].independentValidation.fullDecode = false; },
    r => { r.runs[0].independentValidation.maximumTimestampErrorSeconds = 0.002; },
    r => { r.runs[0].independentValidation.probe.streams[0].codec_name = "hevc"; },
    r => { r.runs[0].state.metrics.peakPendingOperations = 2; }, r => { r.splitFinalSamples[0].queuedFrames = 1; },
    r => { r.manifest.artifacts["split-encoder.wasm"] = "0".repeat(64); }, r => { r.source.bytes--; },
    r => { r.progressProbe.partialOutputStopEnabled = true; }, r => { r.startupSettlement.processesExcluded = 1; },
    r => { r.blankBaseline.privateBytes++; }, r => { r.nativeMemory.phases[0].peak[3]++; },
    r => { r.ownedPids.chrome = 900; }, r => { r.runs[0].cimPeakPrivateBytes = undefined; },
    r => { r.forbiddenRequests.push({ method: "POST" }); },
  ]) { const value = synthetic(); mutate(value); assert.throws(() => encoderPlaneTerminalFacts(value)); }
  const gap = synthetic(); gap.nativeMemory.phases[3].unavailableSamples = 1;
  assert.equal(encoderPlaneTerminalFacts(gap).fullOriginalSessionGatePassed, false);
  const excess = synthetic(); excess.runs[2].cimPeakPrivateBytes = 351 * MiB;
  assert.equal(encoderPlaneTerminalFacts(excess).fullOriginalSessionGatePassed, false);
  assert.equal(encoderPlaneTerminalFacts(excess).native.observedIncrementalPrivateMiB, 251);
});
test("Actual historical failed full encoder run keeps exact complete-tree227.78515625MiB and remains failure, not a new candidate or pass", async () => {
  const p = JSON.parse(await readFile(path.join(root, "evidence/2026-10-09T20-55-24-319Z-single-idle-original-full-terminal.json")));
  const bytes = await readFile(path.join(root, p.candidate.compressedReport.path)); assert.equal(sha(bytes), p.candidate.compressedReport.sha256);
  const raw = gunzipSync(bytes); assert.equal(sha(raw), p.candidate.compressedReport.restoredSha256);
  const report = JSON.parse(raw), native = recomputeFullSessionNativeFacts(report);
  assert.equal(native.actualPeakPrivateBytes, 478404608); assert.equal(native.observedIncrementalPrivateMiB, 227.78515625);
  assert.equal(native.completedRuns, 0); assert.equal(native.completeChromiumMemoryAcceptance, false);
  assert.throws(() => encoderPlaneTerminalFacts(report), "Old encoder evidence cannot certify changed encoder");
});
test("Post-terminal command refuses live receipts before source/archive/process inspection and cannot launch converter/build/browser", async () => {
  const source = await readFile(path.join(root, "scripts/analyze-encoder-plane-full-terminal.mjs"), "utf8");
  assert.ok(source.indexOf("assert.match(receiptPath") < source.indexOf("const receiptBytes ="));
  assert.ok(!/chromium\.launch|spawn\(|taskkill|vinext|Start-Process/.test(source));
  for (const token of ["maxOutputLength", "executed.generatedCaller, caller.generated", "sourcePreimagesVerified",
    "raw.manifest, build.manifest", "Actual owned birth identity is still alive", "noProcessesKilled: true", "flag: \"wx\"", "windowsHide: true"])
    assert.ok(source.includes(token), token);
  const syntax = spawnSync(process.execPath, ["--check", "--input-type=module"], { input: source, encoding: "utf8", windowsHide: true });
  assert.equal(syntax.status, 0, syntax.stderr);
  const rejected = spawnSync(process.execPath, ["scripts/analyze-encoder-plane-full-terminal.mjs",
    "evidence/2026-10-10T13-32-15-738Z-encoder-plane-full-live.json"], { cwd: root, encoding: "utf8", windowsHide: true });
  assert.equal(rejected.status, 1); assert.match(rejected.stderr, /AssertionError/);
});

test("Actual older baseline archive uses its immutable separate raw byte/hash binding; no historical receipt is rewritten", async () => {
  const receipt = JSON.parse(await readFile(path.join(root, "evidence/2026-10-09T16-55-27-062Z-progress-compositing-original-full-completion.json")));
  assert.equal(Object.hasOwn(receipt.candidate.compressedReport, "restoredBytes"), false);
  const zipped = await readFile(path.join(root, receipt.candidate.compressedReport.path));
  assert.equal(zipped.length, receipt.candidate.compressedReport.bytes); assert.equal(sha(zipped), receipt.candidate.compressedReport.sha256);
  const bytes = gunzipSync(zipped, { maxOutputLength: 33554432 });
  assert.equal(bytes.length, receipt.candidate.rawReport.bytes); assert.equal(sha(bytes), receipt.candidate.rawReport.sha256);
  const report = JSON.parse(bytes); assert.equal(report.source.bytes, 2958573265);
  assert.equal(report.source.sha256, synthetic().source.sha256);
  const source = await readFile(path.join(root, "scripts/analyze-encoder-plane-full-terminal.mjs"), "utf8");
  assert.ok(source.includes("restoredBytes: previousReceipt.candidate.rawReport.bytes"));
  assert.ok(source.includes("restoredSha256: previousReceipt.candidate.rawReport.sha256"));
});
