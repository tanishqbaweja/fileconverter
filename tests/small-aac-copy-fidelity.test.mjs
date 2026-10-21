import assert from "node:assert/strict";
import test from "node:test";
import { readSmallAacTrim, validateSmallAacEvidence, validateSmallCopiedAac } from "../scripts/lib/small-aac-copy-fidelity.mjs";
const hash = "a".repeat(64);
function probe(output = false, packetTrim = false) {
  return { format: { format_name: output ? "mov,mp4,m4a,3gp,3g2,mj2" : "matroska,webm" },
    streams: [{ index: 1, codec_name: "aac", profile: "LC", channels: 1, sample_rate: "48000", initial_padding: output ? 0 : 1024 }],
    packets: [{ stream_index: 1, pts_time: output ? "-0.021333" : "-0.021", dts_time: output ? "-0.021333" : "-0.021", data_hash: "SHA256:" + hash,
      ...(packetTrim ? { side_data_list: [{ side_data_type: "Skip Samples", skip_samples: 1024, discard_padding: 0 }] } : {}) },
    { stream_index: 1, pts_time: "0", dts_time: "0", duration_time: "0.021333", data_hash: "SHA256:" + hash }] };
}
const pcm = () => ({ channels: 1, bytesPerSample: 2, decodedSamplesPerChannel: 2048, declaredLeadingSamples: 1024,
  rawSha256: hash, afterDeclaredPrefixSha256: "b".repeat(64) });
test("only independently declared Matroska header priming with matching negative preroll supplies old FFprobe's absent packet field", () => {
  const before = readSmallAacTrim(probe(), "source"), after = readSmallAacTrim(probe(true, true), "output");
  assert.equal(before.headerFallbackUsed, true); assert.equal(before.observedPacketSkip, null); assert.equal(after.headerFallbackUsed, false);
  assert.equal(validateSmallAacEvidence(before, after, pcm(), pcm()).audibleSamplesPerChannel, 1024);
  assert.equal(readSmallAacTrim(probe(false, true), "source").headerFallbackUsed, false);
});
test("malformed, conflicting, ambiguous and interior trim cannot be reinterpreted to obtain a pass", () => {
  for (const mutate of [p => { p.streams[0].initial_padding = null; }, p => { p.streams[0].profile = "HE-AAC"; },
    p => { p.packets[0].pts_time = "0"; }, p => { p.packets[0].data_hash = "missing"; },
    p => { p.packets[0].side_data_list = [{ side_data_type: "Skip Samples", skip_samples: 1008, discard_padding: 0 }]; },
    p => { p.packets[1].side_data_list = [{ side_data_type: "Skip Samples", skip_samples: 1, discard_padding: 0 }]; }]) {
    const p = probe(); mutate(p); assert.throws(() => readSmallAacTrim(p, "source"));
  }
  const p = probe(true); p.streams[0].initial_padding = 1024; assert.throws(() => readSmallAacTrim(p, "output"), /No inferred trim/);
});
test("every PCM byte/count, packet byte, trim and original1ms clock guard remains mandatory", () => {
  const source = readSmallAacTrim(probe(), "source"), output = readSmallAacTrim(probe(true, true), "output");
  for (const mutate of [p => { p.rawSha256 = "c".repeat(64); }, p => { p.afterDeclaredPrefixSha256 = "d".repeat(64); },
    p => { p.decodedSamplesPerChannel -= 1024; }, p => { p.declaredLeadingSamples = 1008; }]) {
    const value = pcm(); mutate(value); assert.throws(() => validateSmallAacEvidence(source, output, pcm(), value));
  }
  for (const mutate of [o => { o.leading = 1008; }, o => { o.trailing = 1; },
    o => { o.semanticPackets[1].data_hash = "SHA256:" + "c".repeat(64); },
    o => { o.semanticPackets[1].pts_time = "0.002"; }]) {
    const value = structuredClone(output); mutate(value); assert.throws(() => validateSmallAacEvidence(source, value, pcm(), pcm()));
  }
});
test("track selection is explicitly bounded before file access or a native decoder starts", async () => {
  for (const audioOrdinal of [-1, 8, 0.5, null, "1"])
    await assert.rejects(validateSmallCopiedAac("not-read", "not-read", { audioOrdinal }), /audioOrdinal/);
});
test("the independently recorded zero-start source retains its exact header trim and audible origin", () => {
  const before = probe(), after = probe(true, true);
  for (const p of [before, after]) { p.packets[0].pts_time = "0"; p.packets[0].dts_time = "0";
    p.packets[1].pts_time = "0.021333"; p.packets[1].dts_time = "0.021333"; }
  before.streams[0].start_time = "0.000000";
  const source = readSmallAacTrim(before, "source"), output = readSmallAacTrim(after, "output");
  assert.equal(source.trimProvenance, "explicit-Matroska-initial_padding-at-observed-zero-start");
  const result = validateSmallAacEvidence(source, output, pcm(), pcm());
  assert.equal(result.sourceAudibleStartSeconds, 1024 / 48000);
  assert.equal(result.sourceAudibleStartSeconds, result.outputAudibleStartSeconds);
  const missing = structuredClone(before); delete missing.streams[0].start_time;
  assert.throws(() => readSmallAacTrim(missing, "source"), /corroborated/);
  const shifted = structuredClone(output); shifted.audibleStartSeconds += 0.002;
  assert.throws(() => validateSmallAacEvidence(source, shifted, pcm(), pcm()), /origin changed/);
  const noOutputTrim = structuredClone(after); delete noOutputTrim.packets[0].side_data_list;
  assert.throws(() => validateSmallAacEvidence(source, readSmallAacTrim(noOutputTrim, "output"), pcm(), pcm()), /Leading trim changed/);
});
