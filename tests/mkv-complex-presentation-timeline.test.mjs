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
  return { sourceProbe, outputProbe, sourcePackets, outputPackets, sourceDecodedHashes, outputDecodedHashes: sourceDecodedHashes };
};
test("Positive VFR timeline checks each actual clock/span and both distinct container-header meanings at unchanged 50ms", () => {
  const r = validateComplexPositiveStartTimeline(input());
  assert.equal(r.source.start, 5); assert.equal(r.output.start, 5);
  assert.ok(r.rawFormatDurationDifferenceSeconds > 4.99);
  assert.ok(r.sourceHeaderEndErrorSeconds < 0.05 && r.outputHeaderEndErrorSeconds < 0.05);
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
  ]) { const v = input(); change(v); assert.throws(() => validateComplexPositiveStartTimeline(v)); }
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
