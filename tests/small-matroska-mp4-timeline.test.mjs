import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";
import { validateSmallMatroskaMp4Timeline } from "../scripts/lib/small-matroska-mp4-timeline.mjs";

const proof = JSON.parse(await readFile(new URL("../evidence/mpeg2-duration-semantics-2026-10-05.json", import.meta.url)));
const vector = (row) => structuredClone(row);

test("Retained genuine timeline edges expose unlike header duration scalars, not 94ms of lost content", () => {
  for (const row of proof.cases) {
    const result = validateSmallMatroskaMp4Timeline(vector(row));
    assert.equal(result.clockToleranceSeconds, 0.001);
    assert.equal(result.durationToleranceSeconds, 0.060);
    assert.ok(result.sourceHeaderEndErrorSeconds < 0.060);
    assert.ok(result.outputHeaderEndErrorSeconds < 0.060);
    assert.ok(Math.abs(result.source.end - result.output.end) <= 0.001);
    if (row.sourceCodec === "hevc") {
      assert.ok(result.rawFormatDurationDifferenceSeconds > 0.093);
      assert.equal(result.source.end, 4.093);
      assert.equal(result.output.end, 4.093);
      assert.equal(result.source.start, 0.083);
      assert.equal(result.output.start, 0.083);
      assert.ok(Math.abs(result.sourceHeaderEndErrorSeconds - 0.011) < 1e-12);
      assert.ok(result.outputHeaderEndErrorSeconds < 1e-12);
    }
  }
  // These are frozen boundary-vector tests, not a substitute for complete
  // packet/PCM/browser verification or the large protected memory gate.
  assert.equal(proof.publicAcceptance, false);
  assert.equal(proof.primaryMemoryAcceptance, false);
});

test("Presentation checks independently reject incorrect headers, shifted frames, lost audio and priming", () => {
  const base = vector(proof.cases.find((row) => row.sourceCodec === "hevc"));
  const changed = (mutate) => { const copy = structuredClone(base); mutate(copy); return copy; };
  assert.throws(() => validateSmallMatroskaMp4Timeline(changed((x) => { x.outputProbe.format.duration = "4.071"; })), /Output duration\/header endpoint inconsistent/);
  assert.throws(() => validateSmallMatroskaMp4Timeline(changed((x) => { x.sourceProbe.format.duration = "4.154"; })), /Source duration\/header endpoint inconsistent/);
  assert.throws(() => validateSmallMatroskaMp4Timeline(changed((x) => { x.outputFrames[95] += 0.002; })), /PTS changed/);
  assert.throws(() => validateSmallMatroskaMp4Timeline(changed((x) => { x.outputFrames.pop(); })), /frame count changed/);
  assert.throws(() => validateSmallMatroskaMp4Timeline(changed((x) => { x.outputDecodedAudioHashes[0] = `SHA256=${"0".repeat(64)}`; })), /decoded audio changed/);
  assert.throws(() => validateSmallMatroskaMp4Timeline(changed((x) => { x.outputPackets[0].side_data_list[0].skip_samples = 0; })), /skip_samples changed/);
});

test("Timeline semantics are source pinned and unknowns or unbounded histories never become success", async () => {
  const base = vector(proof.cases[0]);
  const unknown = structuredClone(base); unknown.outputProbe.format.duration = null;
  assert.throws(() => validateSmallMatroskaMp4Timeline(unknown), /unavailable/);
  const unsupported = structuredClone(base); unsupported.sourceProbe.format.format_name = "avi";
  assert.throws(() => validateSmallMatroskaMp4Timeline(unsupported), /container semantics unavailable/);
  const excessive = structuredClone(base); excessive.sourcePackets = Array(4097).fill(excessive.sourcePackets[0]);
  assert.throws(() => validateSmallMatroskaMp4Timeline(excessive), /packet cap/);
  const source = await readFile(new URL("../scripts/verify-mpeg2-timeline-semantics.mjs", import.meta.url), "utf8");
  assert.match(source, /45261fc3f0bc3f3cce0395966eeadfdacc4779d97fb4b31d2ae490a2ce99e093/);
  assert.match(source, /7ed52b0e5932026058a55483e72880eb592cdef048b0cec15e9ea7e922ad0347/);
  assert.match(source, /463c59c8a2ef0382507a7880a17e73badd498a3e2e546ee6d8d7abe3bb4a1b0c/);
  assert.match(source, /bytes.length <= 512 \* 1024/);
  assert.match(source, /7e3781e3ca/);
  assert.match(source, /331596532337bd5312c40f66f60a7fd10310b40907f2ed23295d7c0a73463dad/);
  assert.match(source, /cc303eaed1b0bdbd44260c3897aad64b43f0af5e4ae2d5ffa774978b518e19bd/);
  assert.match(source, /204a43fc0ea584e521b329d2ee8720c8015e557f97f7565084edb29f4088ef95/);
});

test("Four small browser passes do not waive the original-size auxiliary heap failure", async () => {
  const e = JSON.parse(await readFile(new URL("../evidence/mpeg2-timeline-passed-protected-auxiliary-oom-2026-10-05.json", import.meta.url)));
  assert.deepEqual(e.small.suite, { passed: 4, failed: 0, seconds: 20.1, retries: 0 });
  assert.equal(e.small.cases.length, 2);
  for (const c of e.small.cases) {
    assert.ok(c.ssim >= 0.98);
    assert.deepEqual(c.decodedAudio.outputDecodedAudioHashes, c.decodedAudio.sourceDecodedAudioHashes);
    assert.equal(c.presentation.durationToleranceSeconds, 0.060);
    assert.equal(c.presentation.clockToleranceSeconds, 0.001);
    assert.ok(c.presentation.sourceHeaderEndErrorSeconds < 0.060);
    assert.ok(c.presentation.outputHeaderEndErrorSeconds < 0.060);
  }
  assert.equal(e.protected.originalBytes, 2958573265);
  assert.equal(e.protected.originalSha256, "31f36695b5b44c62125a9e4264e84dc085accd21c02cc3487aae597f54b9db34");
  assert.equal(e.protected.inputSettings.width, 1920);
  assert.equal(e.protected.inputSettings.height, 804);
  assert.equal(e.protected.requestedRuns, 3);
  assert.equal(e.protected.attemptedRuns, 1);
  assert.equal(e.protected.metrics.inputBytes, 353857);
  assert.equal(e.protected.metrics.outputBytes, 0);
  assert.equal(e.protected.attemptedHeapEndBytes, 34701056);
  assert.equal(e.protected.metrics.wasmMemoryBytes, 33554432);
  assert.equal(e.protected.failureCaller, "av_refstruct_pool_get -> alloc_frame");
  assert.equal(e.protected.outputValidated, false);
  assert.equal(e.publicAcceptance, false);
  assert.equal(e.primaryMemoryAcceptance, false);
  assert.equal(e.speedGainClaim, null);
  assert.equal(e.nextAction.actualFailingPool, null);
  assert.equal(e.nextAction.liveAuxiliaryBytes, null);
  assert.equal(e.nextAction.idleAuxiliaryBytes, null);
  assert.ok(Object.values(e.cleanup.protected).every((v) => v === true));
  assert.equal(e.cleanup.independentChecksPending, false);
});
