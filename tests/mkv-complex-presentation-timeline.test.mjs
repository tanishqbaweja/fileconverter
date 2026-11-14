import assert from "node:assert/strict";
import test from "node:test";
import { readFile } from "node:fs/promises";
import { createReadStream } from "node:fs";
import { createHash } from "node:crypto";
import { validateComplexPositiveStartTimeline } from "../scripts/lib/mkv-complex-presentation-timeline.mjs";
import { positiveBFrameMkvFixture } from "../scripts/lib/mkv-complex-fidelity.mjs";

const input = () => {
  const video = Array.from({ length: 72 }, (_, i) => ({ stream_index: 0, duration_time: "0.041000",
    pts_time: (5 + (i < 24 ? i / 12 : 2 + (i - 24) / 24)).toFixed(3).padEnd(8, "0"),
    dts_time: (5 + (i < 24 ? i / 12 : 2 + (i - 24) / 24)).toFixed(6), data_hash: "SHA256:" + i.toString(16).padStart(64, "0") }));
  video.forEach(p => { p.pts_time = Number(p.pts_time).toFixed(6); });
  const audio = [1, 2].flatMap(stream_index => Array.from({ length: 189 }, (_, i) => ({ stream_index,
    pts_time: Number((5 + (i - 1) * 1024 / 48000).toFixed(3)).toFixed(6),
    dts_time: Number((5 + (i - 1) * 1024 / 48000).toFixed(3)).toFixed(6), duration_time: "0.021000",
    data_hash: "SHA256:" + stream_index.toString().repeat(64), ...(i ? {} : { side_data_list: [{ side_data_type: "Skip Samples", skip_samples: 1024, discard_padding: 0 }] }) })));
  const sourcePackets = [...video, ...audio], outputPackets = structuredClone(sourcePackets);
  const sourceProbe = { streams: [{ codec_name: "h264" }, { codec_name: "aac", sample_rate: "48000" }, { codec_name: "aac", sample_rate: "48000" }],
    format: { format_name: "matroska,webm", start_time: "5.000000", duration: "9.031000" } };
  const outputProbe = structuredClone(sourceProbe); outputProbe.format = { format_name: "mov,mp4,m4a,3gp,3g2,mj2", start_time: "5.000000", duration: "4.031333" };
  const sourceDecodedHashes = ["0,v", "1,a", "2,a"].map((kind, i) => `${kind},SHA256=${(i + 1).toString().repeat(64)}`).join("\n");
  const serializedTimeline = { movie: { durationTicks: "0", timeScale: 1000 }, tracks: [0, 1, 2].map(index => ({
    kind: index ? "soun" : "vide", timeScale: index ? 48000 : 16000, durationTicks: "0", firstFragmentDecodeTimeTicks: "0", editListPresent: true,
    edits: [{ mediaTimeTicks: "-1", segmentDurationTicks: "5000", mediaRateInteger: 1, mediaRateFraction: 0 },
      { mediaTimeTicks: index ? "1024" : "0", segmentDurationTicks: "0", mediaRateInteger: 1, mediaRateFraction: 0 }] })) };
  for (const index of [0, 1, 2]) {
    const rows = outputPackets.filter(p => p.stream_index === index);
    outputProbe.streams[index].duration = (Number(rows.at(-1).dts_time) + Number(rows.at(-1).duration_time) - Number(rows[0].dts_time)).toFixed(6);
  }
  return { sourceProbe, outputProbe, sourcePackets, outputPackets, sourceDecodedHashes, outputDecodedHashes: sourceDecodedHashes, serializedTimeline };
};
test("Positive VFR timeline checks each actual clock/span and both distinct container-header meanings at unchanged 50ms", () => {
  const r = validateComplexPositiveStartTimeline(input());
  assert.equal(r.source.start, 5); assert.equal(r.output.start, 5);
  assert.ok(r.rawFormatDurationDifferenceSeconds > 4.99);
  assert.ok(r.sourceHeaderEndErrorSeconds < 0.05 && r.outputProbeDurationErrorSeconds < 0.05);
  assert.equal(r.serializedUnknownDurationsAndEditsChecked, true);
  assert.equal(r.headerToleranceSeconds, 0.05); assert.equal(r.clockToleranceSeconds, 0.001);
  assert.equal(r.noTimestampRebasing, true); assert.equal(r.completeDecodedContentEqual, true);
});
test("Positive timeline rejects rebasing, corrupt endpoints, unavailable duration, changed PCM and unlike duration treated as equal", () => {
  for (const change of [
    v => { v.outputProbe.format.duration = "9.031000"; },
    v => { v.sourceProbe.format.duration = "4.031000"; },
    v => { v.outputPackets[20].pts_time = "0.000000"; },
    v => { delete v.outputPackets.at(-1).duration_time; },
    v => { v.outputDecodedHashes += "changed"; },
    v => { v.outputPackets[71].duration_time = "0.090000"; },
    v => { delete v.outputProbe.format.start_time; },
    v => { v.serializedTimeline.tracks[0].durationTicks = "4000"; },
    v => { v.serializedTimeline.tracks[1].edits[1].mediaTimeTicks = "1008"; },
    v => { v.serializedTimeline.tracks[0].edits[0].segmentDurationTicks = "0"; },
  ]) { const v = input(); change(v); assert.throws(() => validateComplexPositiveStartTimeline(v)); }
});
test("Retained B-frame diagnostic proves reported decode-span semantics while keeping the original duration assertion failed", async () => {
  const raw = await readFile(new URL("../evidence/2026-11-14T23-44-15-049Z-mkv-startup-dts-bframes.json", import.meta.url));
  assert.equal(createHash("sha256").update(raw).digest("hex"), "5605cfcd537e475fa5a5fa0c5d3ee08aa905a6e2681df37b4efa96d74044b265");
  const r = JSON.parse(raw), v = r.arms[0].cases[0].validation;
  assert.equal(r.status, "failed-not-acceptance"); assert.equal(r.diagnosticOnly, true);
  assert.ok(v.headerDiagnostic.rawDurationDeltaSeconds > 0.05);
  assert.equal(v.headerDiagnostic.originalHeaderToleranceSeconds, 0.05);
  assert.equal(v.headerDiagnostic.allPriorIndependentChecksPassed, true);
  assert.equal(v.serializedTimeline.movie.durationTicks, "0");
  assert.ok(v.serializedTimeline.tracks.every(t => t.durationTicks === "0" && t.firstFragmentDecodeTimeTicks === "0"));
  assert.deepEqual(v.packets.clocks.map(t => t.maximumPtsErrorUs), [0, 333, 333]);
  assert.equal(v.packets.clocks[0].comparableDts, 70); assert.equal(v.packets.clocks[0].maximumComparableDtsErrorUs, 0);
  assert.equal(v.outputDecodedHashes, v.sourceDecodedHashes); assert.equal(v.fullDecode, true);
  for (const track of v.headerDiagnostic.output) {
    const first = track.first[0], last = track.last.at(-1);
    const span = Number(last.dts_time) + Number(last.duration_time) - Number(first.dts_time);
    assert.ok(Math.abs(Number(v.outputProbe.streams[track.index].duration) - span) < 1e-6);
  }
  const video = v.headerDiagnostic.output[0];
  assert.equal(Number(video.last.at(-1).dts_time) + Number(video.last.at(-1).duration_time) - Number(video.first[0].dts_time), 4.083);
  assert.equal(v.outputProbe.format.duration, "4.083000");
  assert.equal(v.outputSha256, "5958e362932a277ceba09d4734c3428dd8d5f8759b51e30fb18dde6723c70a0e");
});
test("Positive-start source is one pinned reusable fixture with unchanged payloads, trim and exact +5s available clocks", async () => {
  const data = new URL(`../${positiveBFrameMkvFixture.file}`, import.meta.url), h = createHash("sha256"); let bytes = 0;
  for await (const b of createReadStream(data, { highWaterMark: 262144 })) { h.update(b); bytes += b.length; }
  assert.equal(bytes, positiveBFrameMkvFixture.bytes); assert.equal(h.digest("hex"), positiveBFrameMkvFixture.sha256);
  const descriptor = JSON.parse(await readFile(new URL(data.href + ".json")));
  assert.equal(descriptor.sha256, positiveBFrameMkvFixture.sha256);
  for (const flag of ["packetPayloadAndTrimIdentity", "everyAvailablePtsAndDtsShiftedExactlyFiveSeconds", "unavailableInitialDtsPreserved", "nativeToolUsedOnlyForFixtureGenerationAndInspection"]) assert.equal(descriptor[flag], true);
  assert.equal(descriptor.offsetSeconds, 5); assert.equal(descriptor.formatStartSeconds, 5);
  assert.equal(descriptor.status, "reusable-bitexact-source-generated-twice-identically");
});
