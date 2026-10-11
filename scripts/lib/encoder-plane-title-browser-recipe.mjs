import assert from "node:assert/strict";
import path from "node:path";
import { pathToFileURL } from "node:url";
import { makeEncoderPlaneBrowserRecipe, ENCODER_PLANE_SLOT } from "./encoder-plane-browser-recipe.mjs";
import { validateMatroskaMp4StreamTitle } from "./matroska-mp4-stream-title.mjs";
export const TITLE_FIXTURE_VIDEO = "Primary café — 音楽";
export function makeEncoderPlaneTitleBrowserRecipe(sources, root, runtime, stamp, branch, build) {
  const original = makeEncoderPlaneBrowserRecipe(sources, root, runtime, stamp, branch, build);
  const uri = pathToFileURL(path.join(root, "scripts/lib/matroska-mp4-stream-title.mjs")).href;
  const edits = [
    ['import { expect, test } from "@playwright/test";',
      `import { expect, test } from "@playwright/test";\nimport { validateMatroskaMp4StreamTitle } from ${JSON.stringify(uri)};`],
    ['"-metadata:s:a:1", "title=Second 音楽", "-avoid_negative_ts", "make_zero",',
      `"-metadata:s:a:1", "title=Second 音楽", "-metadata:s:v:0", ${JSON.stringify("title=" + TITLE_FIXTURE_VIDEO)}, "-avoid_negative_ts", "make_zero",`],
    ['expect(afterVideo.tags?.encoder).toBe("Within FFmpeg MPEG-2");',
      `expect(afterVideo.tags?.encoder).toBe("Within FFmpeg MPEG-2");\n      expect(beforeVideo.tags?.title).toBe(${JSON.stringify(TITLE_FIXTURE_VIDEO)});\n      const inputAudioTitles = before.streams.filter((s) => s.codec_type === "audio");\n      const outputAudioTitles = after.streams.filter((s) => s.codec_type === "audio");\n      expect(outputAudioTitles).toHaveLength(inputAudioTitles.length);\n      rows.push({ kind: "exact-stream-title-mapping", video: validateMatroskaMp4StreamTitle(beforeVideo.tags, afterVideo.tags),\n        audio: inputAudioTitles.map((stream, index) => validateMatroskaMp4StreamTitle(stream.tags, outputAudioTitles[index].tags)) });`],
  ];
  let spec = original.spec;
  for (const [before, after] of edits) { assert.equal(spec.split(before).length - 1, 1); spec = spec.replace(before, after); }
  let reversed = spec;
  for (const [before, after] of edits.toReversed()) reversed = reversed.replace(after, before);
  assert.equal(reversed, original.spec, "No codec, pixel, audio, clock, memory, writer or recovery gate changes");
  return { ...original, spec };
}
export function verifyEncoderPlaneTitleGoldenReport(report, baseline, build) {
  assert.equal(report.candidateName, ENCODER_PLANE_SLOT);
  assert.equal(report.manifest.artifacts["split-encoder.wasm"], build.encoderManifest.artifacts["split-encoder.wasm"]);
  assert.equal(report.manifest.provenance.encoder.commit, build.run.headSha);
  const conversions = value => value.rows.filter(row => !row.kind && row.status === "passed");
  const actual = conversions(report), expected = conversions(baseline);
  assert.equal(actual.length, 3); assert.equal(expected.length, 3);
  for (let i = 0; i < 3; i++) {
    // Source/output byte counts and hashes must change with the added video title.
    // Keep them as new evidence, never project them onto the historical fixture.
    for (const field of ["outputCodec", "frames", "audioTracks", "ssim", "timestampAlignedSsim", "destination",
      "sourceCodec", "audioPacketHashes", "sourceFrameTimes", "outputFrameTimes", "warnings"])
      assert.deepEqual(actual[i][field], expected[i][field], field);
    for (const field of ["sourceBytes", "outputBytes"])
      assert.ok(actual[i][field] > expected[i][field] && actual[i][field] <= expected[i][field] + 4096);
    assert.match(actual[i].outputSha256, /^[a-f0-9]{64}$/);
    assert.notEqual(actual[i].outputSha256, expected[i].outputSha256);
    const m = actual[i].metrics;
    assert.equal(m.peakWasmMemoryBytes, 50331648); assert.equal(m.peakPendingOperations, 1);
    assert.equal(m.pendingOperations, 0); assert.equal(m.queuedBytes, 0);
    assert.ok(m.maxReadChunkBytes <= 65536 && m.maxWriteChunkBytes <= 524288 && m.peakQueuedBytes <= 524288);
  }
  const rows = kind => report.rows.filter(row => row.kind === kind);
  assert.equal(rows("independent-pre-assertion-probes").length, 3);
  for (const row of rows("independent-pre-assertion-probes")) {
    const source = row.sourceProbe.streams.filter(s => s.codec_type === "video" && !s.disposition?.attached_pic);
    const output = row.outputProbe.streams.filter(s => s.codec_type === "video" && !s.disposition?.attached_pic);
    assert.equal(source.length, 1); assert.equal(output.length, 1);
    assert.equal(source[0].tags.title, TITLE_FIXTURE_VIDEO);
    validateMatroskaMp4StreamTitle(source[0].tags, output[0].tags);
    const inputAudio = row.sourceProbe.streams.filter(s => s.codec_type === "audio");
    const outputAudio = row.outputProbe.streams.filter(s => s.codec_type === "audio");
    assert.equal(inputAudio.length, 2); assert.equal(outputAudio.length, 2);
    for (let i = 0; i < 2; i++) validateMatroskaMp4StreamTitle(inputAudio[i].tags, outputAudio[i].tags);
  }
  assert.equal(rows("exact-stream-title-mapping").length, 3);
  assert.equal(rows("independent-frame-diagnostic").length, 3);
  for (const row of rows("independent-frame-diagnostic")) assert.equal(row.nativeFullDecodePassed, true);
  assert.equal(rows("independent-decoded-audio").length, 3);
  for (const row of rows("independent-decoded-audio")) assert.deepEqual(row.sourceDecodedAudioHashes, row.outputDecodedAudioHashes);
  for (const kind of ["direct-write-failure", "cancel-after-direct-output"]) {
    assert.equal(rows(kind).length, 1); assert.equal(rows(kind)[0].status, "passed"); assert.deepEqual(rows(kind)[0].partialBytes, []);
  }
  const inventories = report.rows.filter(row => "cleanupRemovedEntries" in row);
  assert.equal(inventories.length, 5); for (const row of inventories) assert.deepEqual(row.cleanupRemovedEntries, []);
  return { genuineConversions: 3, exactVideoAndAudioTitlePreservation: true, adverseRecoveryCases: 2,
    independentPixelAudioAndClockGatesUnchanged: true, titleBearingFixturesDifferFromOldGoldens: true,
    completeChromiumMemoryAcceptance: false, fullOriginalCompleted: false, speedImprovementProven: false };
}
