// Synthetic positives test verifier logic only, never actual full conversion proof.
import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { readFile } from "node:fs/promises";
import path from "node:path";
import test from "node:test";
import { gunzipSync } from "node:zlib";
import { sha } from "../scripts/lib/stable-ui-headless-baseline-recipe.mjs";
import { makeStagedFullTerminalAnalyzer } from "../scripts/lib/encoder-plane-staged-terminal-recipe.mjs";
import { makeStagedFullFailureAnalyzer } from "../scripts/lib/encoder-plane-staged-failure-recipe.mjs";
import { makeTitleFullTerminalAnalyzer, titleTerminalAnalysisFiles } from "../scripts/lib/encoder-plane-title-terminal-recipe.mjs";
import { encoderPlaneTitleTerminalFacts, boundedTitleFullCleanupDiagnostics } from "../scripts/lib/encoder-plane-title-terminal-facts.mjs";
import { describeOwnedCleanupError } from "../scripts/lib/bounded-cleanup-error.mjs";
import { makeEncoderPlaneTitleFullDriver, makeEncoderPlaneTitleFullCaller } from "../scripts/lib/encoder-plane-title-full-recipe.mjs";
import { validateMatroskaMp4StreamTitle } from "../scripts/lib/matroska-mp4-stream-title.mjs";
const root = path.resolve(import.meta.dirname, ".."), read = file => readFile(path.join(root, file)), MiB = 1048576;
const source = (await read("scripts/analyze-encoder-plane-full-terminal.mjs")).toString();
async function restore(record, cap = 8388608) {
  const compressed = await read(record.path);
  assert.equal(compressed.length, record.bytes); assert.equal(sha(compressed), record.sha256);
  const restored = gunzipSync(compressed, { maxOutputLength: cap });
  assert.equal(restored.length, record.restoredBytes); assert.equal(sha(restored), record.restoredSha256);
  return JSON.parse(restored);
}
function synthetic() {
  const processRows = [[0, 100 * MiB, 150 * MiB], [1, 200 * MiB, 300 * MiB]];
  const phase = name => ({ phase: name, validSamples: 10, unavailableSamples: 0,
    peak: [1, "2026-10-11T00:00:00Z", name, 300 * MiB, 450 * MiB, 1, null, processRows] });
  const sourceProbe = { streams: [{ codec_type: "video", tags: { title: "Primary café — 音楽" } },
    { codec_type: "audio", tags: { title: "Audio 音楽" } }] };
  const probe = { streams: [{ codec_type: "video", codec_name: "mpeg2video", width: 1920, height: 804,
    nb_read_frames: "296160", tags: { name: "Primary café — 音楽" } },
  { codec_type: "audio", tags: { name: "Audio 音楽" } }] };
  const run = number => ({ number, cimPeakPrivateBytes: (280 + number * 10) * MiB,
    state: { jobState: "complete", opfsName: null, metrics: { wasmMemoryBytes: 50331648, peakWasmMemoryBytes: 50331648,
      maxReadChunkBytes: 65536, maxWriteChunkBytes: 65536, peakQueuedBytes: 65536, peakPendingOperations: 1,
      pendingOperations: 0, queuedBytes: 0, outputBytes: 3000000000, elapsedMs: 1000000 } },
    independentValidation: { fullDecode: true, ssim: 0.99, maximumTimestampErrorSeconds: 0,
      frameCount: 296160, outputBytes: 3000000000, sha256: "a".repeat(64), probe: structuredClone(probe) },
    independentPreAssertionProbe: structuredClone(probe),
    exactVideoTitleMapping: validateMatroskaMp4StreamTitle(sourceProbe.streams[0].tags, probe.streams[0].tags),
    exactAudioTitleMappings: [validateMatroskaMp4StreamTitle(sourceProbe.streams[1].tags, probe.streams[1].tags)],
    recovery: { stable: true, privateBytes: 150 * MiB } });
  return { status: "passed-private-protected-session", diagnosticOnly: false, requestedRuns: 3,
    source: { path: "test.mkv", bytes: 2958573265,
      sha256: "31f36695b5b44c62125a9e4264e84dc085accd21c02cc3487aae597f54b9db34", probe: sourceProbe },
    manifest: { artifacts: { "split-encoder.wasm": "a4ba6225414ca7a658d349ae81926e5ed040fa73be4540fe8a7adf7656fe1cee",
      "within-mpeg2-split.wasm": "86704920f30ed243240614df92d05deba9f76c33e739a927903677b677f8a8ec" },
    aggregateWasmMemoryBytes: 50331648, allowMemoryGrowth: false },
    actualWasmMemoryLimits: { decoderMux: [{ imported: true, initialPages: 512, maximumPages: 512, shared: true }],
      encoder: [{ imported: true, initialPages: 256, maximumPages: 256, shared: true }] },
    progressProbe: { mode: "encoder-plane-full-completion", fullCompletionRequired: true, partialOutputStopEnabled: false,
      maximumConversionMs: 21600000, checkpointOutputBytes: null, checkpointReached: false, jsAllocationSamplingEnabled: false },
    conversionJsReport: null, forbiddenRequests: [], blankBaseline: { stable: true, privateBytes: 100 * MiB },
    loadedIdle: { stable: true, privateBytes: 150 * MiB },
    startupSettlement: { pageStayedBlank: true, processesExcluded: 0, baselineInflated: false, flagsChanged: false,
      minimumMs: 300000, actualMs: 300001, earlyWindow: { privateBytes: 100 * MiB } },
    abortDiagnostic: { captureError: null, noForcedGc: true, noDebuggerPause: true, syntheticMallocInvoked: false, records: [] },
    limitMiB: 250, formula: "peak complete Chromium process-tree private memory during conversion - stable clean blank-Chromium process-tree private memory",
    nativeMemory: { error: null, intervalMs: 100, phases: [1, 2, 3].flatMap(n => [phase(`pre-conversion-${n}`), phase(`conversion-${n}`)]),
      identities: [{ pid: 100, parentPid: 900, createdAt: "2026-10-11T00:00:00Z" }, { pid: 101, parentPid: 100, createdAt: "2026-10-11T00:00:00Z" }] },
    ownedPids: { chrome: 100 }, runs: [1, 2, 3].map(run), failure: null,
    splitFinalSamples: [1, 2, 3].map(() => ({ frames: 296160, packets: 296160, completedPackets: 296160,
      closed: true, aggregateWasmMemoryBytes: 50331648, activePackets: 0, queuedPackets: 0, queuedFrames: 0,
      additionalPixelBufferBytes: 0, additionalJsPacketBufferBytes: 0 })) };
}

test("both audit modes reverse exactly to unchanged historical gates with new title identities and own pins", () => {
  for (const failureOnly of [false, true]) {
    const recipe = makeTitleFullTerminalAnalyzer(source, root, failureOnly);
    const old = failureOnly ? makeStagedFullFailureAnalyzer(source, root) : makeStagedFullTerminalAnalyzer(source, root);
    const reversed = recipe.edits.toReversed().reduce((s, [before, after]) => s.replace(after, before), recipe.generated);
    assert.equal(reversed, old.generated);
    const checked = spawnSync(process.execPath, ["--check", "--input-type=module"],
      { input: recipe.generated, encoding: "utf8", windowsHide: true });
    assert.equal(checked.status, 0, checked.stderr);
    for (const token of ["assert.equal(executed.generated, expected.generated)", "executed.generatedCaller, caller.generated",
      "Actual owned birth identity is still alive", "fullProtectedPostSha256Verified", "windowsHide: true", ...titleTerminalAnalysisFiles])
      assert.ok(recipe.generated.includes(token), token);
    assert.equal(recipe.publicAcceptance, false);
    if (failureOnly) {
      assert.ok(recipe.generated.includes('assert.equal(facts.fullOriginalSessionGatePassed, false)'));
      assert.ok(recipe.generated.includes('assert.equal(process.argv[3], "--diagnose-failure")'));
      assert.ok(recipe.generated.includes('"-failure-analysis.json"'));
    } else assert.ok(recipe.generated.includes('assert.ok(!raw.cleanup.errors?.length)'));
  }
  assert.throws(() => makeTitleFullTerminalAnalyzer(source + "\n", root));
});

test("synthetic valid titles preserve all original full gates; absent/changed titles and probes cannot pass", () => {
  const facts = encoderPlaneTitleTerminalFacts(synthetic());
  assert.equal(facts.fullOriginalSessionGatePassed, true);
  assert.equal(facts.validatedTitleMappings.length, 3);
  assert.equal(facts.native.observedIncrementalPrivateMiB, 210);
  for (const field of ["publicAcceptance", "scalingAcceptance", "conversionSpeedAcceptance", "goalComplete",
    "historicalFullOutputRetroactivelyAccepted"]) assert.equal(facts[field], false);
  for (const mutate of [
    r => { delete r.runs[0].independentPreAssertionProbe; },
    r => { r.runs[0].independentValidation.probe.streams[0].tags.name = "wrong"; },
    r => {
      for (const probe of [r.runs[0].independentPreAssertionProbe, r.runs[0].independentValidation.probe])
        probe.streams[0].tags = { handler_name: "VideoHandler" };
    },
    r => {
      for (const probe of [r.runs[1].independentPreAssertionProbe, r.runs[1].independentValidation.probe])
        probe.streams[1].tags.name = "wrong";
    },
    r => { delete r.source.probe.streams[0].tags.title; },
    r => { r.runs[1].exactAudioTitleMappings = []; },
    r => { r.runs[2].exactVideoTitleMapping.value = "wrong"; },
    r => { r.runs[0].independentValidation.ssim = 0.97; },
    r => { r.runs.pop(); },
  ]) { const bad = synthetic(); mutate(bad); assert.throws(() => encoderPlaneTitleTerminalFacts(bad)); }
  const gap = synthetic(); gap.nativeMemory.phases[1].unavailableSamples = 1;
  assert.equal(encoderPlaneTitleTerminalFacts(gap).fullOriginalSessionGatePassed, false);
});

test("cleanup diagnostics retain nested evidence without inventing a historical cause or acceptance", () => {
  const error = new AggregateError([Object.assign(new Error("command failure"), { code: 128, stderr: "actual stderr" })], "cleanup failed");
  const serialized = JSON.stringify(describeOwnedCleanupError(error));
  const result = boundedTitleFullCleanupDiagnostics([serialized, "AggregateError: One or more owned cleanup actions failed"]);
  assert.equal(result[0].diagnostics.details.errors[0].stderr, "actual stderr");
  assert.equal(result[0].serializedDetailsRetained, true);
  assert.equal(result[1].serializedDetailsRetained, false);
  for (const row of result) assert.equal(row.historicalFailureCauseProven, false);
  assert.throws(() => boundedTitleFullCleanupDiagnostics(["x".repeat(32769)]));
});

test("immutable actual240-source launch reconstructs title driver/caller; analyzer files are outside measured pins", async () => {
  const live = JSON.parse(await read("evidence/2026-10-11T00-18-32-419Z-encoder-plane-title-full-live.json"));
  const executed = await restore(live.sourceArchive);
  const prior = JSON.parse(await read(live.previousTerminal.path)), previous = await restore(prior.sourceArchive);
  const branch = JSON.parse(await read("evidence/mpeg2-encoder-plane-prototype-build-branch-2026-10-10.json"));
  assert.equal(makeEncoderPlaneTitleFullDriver(previous, root, live.wrapper, branch).generated, executed.generated);
  assert.equal(makeEncoderPlaneTitleFullCaller((await read("scripts/run-single-idle-original-full.mjs")).toString(), root).generated,
    executed.generatedCaller);
  assert.equal(Object.keys(executed.sourcePreimages).length, 240);
  for (const file of titleTerminalAnalysisFiles) assert.equal(Object.hasOwn(live.sourcePins, file), false, file);
});

test("post-terminal CLI refuses live path in both modes BEFORE archive/fixture/process inspection or scratch", async () => {
  const livePath = "evidence/2026-10-11T00-18-32-419Z-encoder-plane-title-full-live.json";
  for (const args of [[], ["--diagnose-failure"]]) {
    const result = spawnSync(process.execPath, ["scripts/analyze-encoder-plane-title-full-terminal.mjs", livePath, ...args],
      { encoding: "utf8", windowsHide: true, timeout: 10000 });
    assert.equal(result.status, 1); assert.match(result.stderr, /AssertionError/); assert.equal(result.stdout, "");
    assert.ok(!result.stderr.includes("CimInstance") && !result.stderr.includes("test.mkv"));
  }
  const cli = (await read("scripts/analyze-encoder-plane-title-full-terminal.mjs")).toString();
  assert.ok(cli.indexOf("assert.match(receiptPath") < cli.indexOf("const receipt ="));
  assert.ok(cli.indexOf("receipt.driverAbsent.status") < cli.indexOf("const runtime ="));
  assert.doesNotMatch(cli, /spawn\(|execFile\(|kill\(|unlink\(|rm\(/);
});

test("actual prior title/cleanup failure stays zero validated outputs and below-budget is not acceptance", async () => {
  const receipt = JSON.parse(await read("evidence/2026-10-10T18-57-09-340Z-encoder-plane-staged-original-full-terminal.json"));
  const raw = await restore(receipt.candidate.compressedReport, 33554432);
  const facts = encoderPlaneTitleTerminalFacts(raw);
  assert.equal(facts.native.observedIncrementalPrivateMiB, 230.03125);
  assert.equal(facts.completedConversions, 0); assert.equal(facts.fullOriginalSessionGatePassed, false);
  assert.equal(facts.exactStreamTitlesIndependentlyRechecked, false);
  assert.deepEqual(facts.firstCandidateFailure, raw.failure);
  assert.equal(boundedTitleFullCleanupDiagnostics(raw.cleanup.errors)[0].serializedDetailsRetained, false);
});
