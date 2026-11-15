import assert from "node:assert/strict";
import test from "node:test";
import { readFile } from "node:fs/promises";
import { createHash } from "node:crypto";
import { gunzipSync } from "node:zlib";
const file = "evidence/2026-11-15T08-00-36-051Z-mkv-hevc-header-parser-loop-source-control.json";
const sha = bytes => createHash("sha256").update(bytes).digest("hex");
const load = async () => {
  const bytes = await readFile(file); assert.equal(sha(bytes), "93e71282cad5a7b57d8ba7e22b5991c459d187c47e421c84b4c6ea5b82e21ea4");
  return JSON.parse(bytes);
};

test("actual corrected native core passes the EXACT failed loop input, without native conversion, public promotion or a changed threshold", async () => {
  const r = await load(), b = r.candidateBuild.build;
  assert.equal(r.status, "passed-loop-source-fidelity-control-not-large-file-or-public-acceptance");
  assert.equal(r.hevcHeaderParserCandidate, true); assert.equal(r.hevcKnownDtsCandidate, true);
  assert.equal(r.candidateBuild.head, "0e2f2caa924413a1edc81c23c49c027dd952fec8");
  assert.equal(r.candidateBuild.runId, "43691831594");
  assert.equal(b.artifacts["within-direct.wasm"].sha256, "41c4a075de285d0d906b2711c5e5420a401235ab89e1f185abe5d48a830a3eba");
  assert.equal(b.artifacts["within_remux.c"].sha256, "5c0a8caa8f3efeb6a024aa6708694203a1529d1d099e9e5faababd5be05c4bb6");
  assert.equal(b.artifacts["matroskadec.c"].sha256, "4aabbf70e250dbb3f3538abe27ae1e6030b336e794a055e846488437c9d4c1ee");
  assert.equal(b.artifacts["hevc-parser.c"].sha256, "9f8f39654688c25e02deb95793b7128fbb4b68e3073a392ac795a232154e3752");
  assert.deepEqual(b.source.library.enabledDecoders, ["h264"]); assert.equal(b.source.hevcDecoderAdded, false);
  assert.equal(b.source.hevcHeaderParser.decodedPicturesAdded, false); assert.equal(b.source.hevcNominalDtsSynthesis, false);
  assert.deepEqual(b.wasmMemory, [{ imported: true, initialPages: 384, maximumPages: 1024, shared: true }]);
  assert.equal(r.fixture.bytes, 11887449); assert.equal(r.fixture.sha256, "fe5f8d41d50faf86054455b7a97d47b754aaf39fbe6883f4c0496767224a2629");
  const priorBytes = await readFile(r.unchangedFailedInputReference.file);
  assert.equal(sha(priorBytes), r.unchangedFailedInputReference.sha256);
  const prior = JSON.parse(priorBytes); assert.equal(prior.status, "failed-not-acceptance");
  assert.equal(r.fixture.sha256, prior.fixture.sha256); assert.equal(r.fixture.sourcePacketHashes, prior.fixture.sourcePacketHashes);
  assert.equal(r.unchangedFailedInputReference.sameEntireInputSha256, true);
  for (const field of ["nativeConversionUsed", "productionFilesReplaced", "publicAcceptance", "headed", "browserServicesDisabled", "speedGainProven"])
    assert.equal(r[field], false, field);
  assert.equal(r.peakLimitMiB, 250); assert.equal(r.cleanupLimitMiB, 96);
});

test("two genuine deterministic remuxes preserve every payload/available clock, trim, full decoded video and PCM through cancellation/write-error recovery", async () => {
  const r = await load(), [a] = r.arms;
  assert.deepEqual(r.failures, []); assert.deepEqual(a.failures, []); assert.deepEqual(a.forbiddenRequests, []);
  assert.deepEqual(a.cases.map(c => c.state), ["complete", "cancelled", "error", "complete"]);
  for (const c of [a.cases[0], a.cases[3]]) {
    assert.equal(c.metrics.inputBytes, r.fixture.bytes); assert.equal(c.metrics.outputBytes, 11894121);
    assert.ok(c.metrics.maxReadChunkBytes <= 262144 && c.metrics.maxWriteChunkBytes <= 1048576 && c.metrics.peakQueuedBytes <= 1048576);
    assert.equal(c.metrics.peakPendingOperations, 1); assert.equal(c.metrics.pendingOperations, 0); assert.equal(c.metrics.queuedBytes, 0);
    assert.equal(c.metrics.peakWasmMemoryBytes, 24 * 1048576);
    assert.ok(c.metrics.elapsedMs > 0); assert.equal(c.outputRemoved, true);
    assert.equal(c.validation.outputSha256, "19adadcc74ba2a2acde01de262303ba2dcc43035de371999160c115eb7d750e9");
    const v = c.validation;
    assert.equal(v.sourcePacketHashes, v.outputPacketHashes); assert.equal(v.completeEncodedStreamHashesEqual, true);
    assert.equal(v.video.packets, 576); assert.equal(v.video.comparableDts, 574); assert.equal(v.video.unavailableSourceDts, 2);
    assert.equal(v.video.maximumPtsDeltaUs, 0); assert.equal(v.video.maximumDtsDeltaUs, 0); assert.equal(v.video.maximumIntervalErrorUs, 0);
    assert.equal(v.video.maximumDefaultDurationDifferenceUs, 32000); assert.equal(v.video.everyOutputIntervalCheckedAgainstAdjacentDts, true);
    assert.equal(v.video.sourceEndUs, 24030000); assert.equal(v.video.outputEndUs, v.video.sourceEndUs);
    assert.equal(v.video.generatedStartupDtsValidated, true); assert.equal(v.video.maximumStartupTimingScalars, 15);
    assert.equal(v.aac.packets, 1128); assert.equal(v.aac.initialSkipSamples, 1024); assert.equal(v.aac.trailingDiscardSamples, 0);
    assert.ok(v.aac.maximumPtsErrorSeconds <= 0.001 && v.aac.maximumDtsErrorSeconds <= 0.001 && v.aac.maximumDurationErrorSeconds <= 0.001);
    assert.equal(v.sourcePcm, v.outputPcm); assert.equal(v.sourceDecodedHashes, v.outputDecodedHashes);
    assert.match(v.sourceDecodedHashes, /^0,v,SHA256=eeeb22f7d3d9bde8e960abe5fa1076c56efc629f57c1f2c2e14673b6592206ad\r?\n1,a,SHA256=a85260ea607fc87146f7083d39365a8052bff6b66c9261b4e471f790becd2601$/);
    assert.ok(v.fullDecode && v.completeDecodedVideoAndPcmEqual && v.candidateGate.passed);
    assert.equal(v.outputProbe.streams[0].duration, "24.030000");
    assert.equal(v.serializedTimeline.completeFragmentInventory, false); assert.equal(v.serializedTimeline.mediaPayloadBytesRead, 0);
    assert.deepEqual(v.serializedTimeline.tracks.map(t => t.firstFragmentDecodeTimeTicks), ["0", "0"]);
    assert.equal(v.serializedTimeline.tracks[1].edits[0].mediaTimeTicks, "1024");
    assert.equal(c.binding.totalBrowserSampleBytes, 12288); assert.equal(c.binding.maximumHostProbeBufferBytes, 4096);
    assert.equal(c.binding.convertedCopyCreated, false); assert.equal(c.binding.allOutputBytesCompared, false);
  }
  assert.ok(a.cases.every(c => c.outputRemoved));
});

test("retained native journal independently rederives unchanged full-tree peak and original-idle cleanup; all disposable ownership closes", async () => {
  const r = await load(), [a] = r.arms, packed = await readFile(a.archive.file);
  assert.equal(packed.length, a.archive.bytes); assert.equal(sha(packed), a.archive.sha256);
  const raw = gunzipSync(packed, { maxOutputLength: 8 * 1048576 }); assert.equal(sha(raw), a.archive.decodedSha256);
  const samples = JSON.parse(raw), active = samples.filter(s => Date.parse(s.timestamp) >= a.memory.start && Date.parse(s.timestamp) <= a.memory.end);
  const valid = active.filter(s => s.privateBytes !== null && Array.isArray(s.processes));
  assert.equal(valid.length, 204); assert.equal(active.length - valid.length, 0);
  for (const s of valid) assert.equal(s.processes.reduce((n, p) => n + p.privateBytes, 0), s.privateBytes);
  const peak = Math.max(...valid.map(s => s.privateBytes));
  assert.equal((peak - a.blank.privateBytes) / 1048576, 162.125);
  assert.equal(a.memory.incrementalPrivateMiB, 162.125); assert.equal(a.memory.validSamples, valid.length);
  assert.equal(a.memory.unavailableSamples, active.length - valid.length);
  assert.equal((a.cleanupStable.privateBytes - a.loaded.privateBytes) / 1048576, 36.96484375);
  assert.equal(a.memory.cleanupAboveIdleMiB, 36.96484375);
  assert.equal(a.browserCleanup.status, "owned-observed-pids-absent"); assert.equal(a.browserCleanup.observedPids.length, 42);
  assert.ok(a.serverCleanup.ownedRootAbsent && a.ownedRuntimeRemoved && r.fixtureRuntimeRemoved && r.toolDownloadRemoved);
  assert.deepEqual(r.originalBefore, r.originalAfter);
  assert.deepEqual(r.originalAfter, { bytes: 2958573265, sha256: "31f36695b5b44c62125a9e4264e84dc085accd21c02cc3487aae597f54b9db34" });
});
