// Unit validation and wiring only; no full-original browser execution claimed.
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";
import { MPEG2_ORIGINAL_GATE, assertMpeg2OriginalStructure, compareOriginalAacPackets } from "../scripts/lib/mpeg2-original-gate.mjs";
function fixture() {
  const disposition = { default: 1, forced: 1, hearing_impaired: 0, visual_impaired: 0, comment: 0, original: 0 };
  const video = { codec_name: "hevc", width: 1920, height: 804, avg_frame_rate: "24/1", sample_aspect_ratio: "1:1", display_aspect_ratio: "160:67",
    pix_fmt: "yuv420p", color_range: "tv", color_space: "bt709", color_transfer: "bt709", color_primaries: "bt709", chroma_location: "left",
    disposition, tags: { title: "Original video" } };
  const audio = { codec_name: "aac", profile: "HE-AAC", sample_rate: "48000", channels: 6, channel_layout: "5.1", extradata_size: 4,
    disposition, tags: { language: "hin", title: "Original audio" } };
  const source = { streams: [video, audio, { codec_name: "subrip" }, { codec_name: "png", width: 250, height: 140, disposition: { attached_pic: 1 } }], chapters: [],
    format: { size: String(MPEG2_ORIGINAL_GATE.bytes), duration: "12340.096", tags: { TITLE: "Original film", WEBSiTE: "example.invalid" } } };
  const output = structuredClone(source); output.streams.splice(2, 1); output.streams[0].codec_name = "mpeg2video";
  output.streams[0].tags = { name: "Original video", encoder: "Within FFmpeg MPEG-2" }; output.streams[1].tags = { name: "Original audio", language: "hin" };
  output.format.size = "6414309978"; output.format.duration = "12340.095";
  return { source, output, warnings: ["Source stream 2 (subrip) cannot be represented in MP4 and is explicitly excluded."] };
}
test("original structure requires full-size video, source geometry/colour, audio, tags, dispositions and artwork", () => {
  const f = fixture(); const result = assertMpeg2OriginalStructure(f.source, f.output, f.warnings);
  assert.equal(result.sourceFrames, 296160); assert.equal(result.subtitleConversionImplemented, false); assert.equal(result.publicAcceptance, false);
  for (const mutate of [f => f.output.streams[0].width = 320, f => f.output.streams[0].color_space = "bt601",
    f => f.output.streams[1].tags.language = "eng", f => f.output.streams[1].channels = 2,
    f => f.output.streams[0].tags.name = "lost", f => f.output.streams[0].disposition.forced = 0,
    f => f.output.streams.pop(), f => f.output.format.size = "210000000", f => f.output.format.tags.WEBSiTE = "lost",
    f => f.output.chapters.push({ title: "invented" }), f => f.warnings = []]) {
    const f = fixture(); mutate(f); assert.throws(() => assertMpeg2OriginalStructure(f.source, f.output, f.warnings));
  }
});
function packets(change = () => {}) {
  return (async function* () { for (let i = 0; i < 3; i++) { const row = { hash: "hash-" + i, streamIndex: 1,
    pts: i * 0.042667, dts: i * 0.042667, duration: 0.042667, skip: 0, tail: 0 }; change(row, i); yield row; } })();
}
test("all original AAC packets compare bytes, order, clocks, duration and trim without retention", async () => {
  const r = await compareOriginalAacPackets(packets(), packets(row => { row.pts += 0.000313; row.dts += 0.000313; }));
  assert.equal(r.packets, 3); assert.equal(r.maximumRetainedPackets, 2); assert.equal(r.pcmValidationCovered, false);
  for (const mutate of [row => row.hash = "wrong", row => row.pts += 0.001, row => row.dts += 0.001,
    row => row.duration += 0.002, row => row.skip = 1024, row => row.tail = 1024, row => row.duration = null])
    await assert.rejects(compareOriginalAacPackets(packets(), packets(mutate)));
});
test("full-original mode binds exact source and long deadline, journals all native rows and aborts known memory failure", async () => {
  const driver = await readFile(new URL("../scripts/test-mpeg2-production-runtime.mjs", import.meta.url), "utf8");
  const ui = await readFile(new URL("../scripts/lib/mpeg2-ui-job.mjs", import.meta.url), "utf8");
  assert.match(driver, /fixture = fullOriginal \? path.join\(root, "test.mkv"\)/);
  assert.match(driver, /if \(!fullOriginal\) await native\(/);
  assert.match(driver, /await nativeJournal.appendBatch\(\{ \.\.\.batch, samples: annotated \}\)/);
  assert.match(driver, /fullOriginal && samples.length > 128/);
  assert.match(driver, /nativeJournal\.peaksExcept\(\["blank"\]\)/);
  assert.match(driver, /incrementalPrivateMiB.*250|privateBytes.*1048576 > 250/s);
  assert.match(driver, /if \(requested\) cancel.click\(\)/);
  assert.match(driver, /compactLosslessNativeMemoryJournal\(receipt\)/);
  assert.match(driver, /assertMpeg2OriginalStructure\(source, converted, report.conversion.warnings\)/);
  assert.match(driver, /compareOriginalAacPackets\(packets\(fixture\), packets\(output\)\)/);
  assert.match(driver, /assert.ok\(ssim >= 0.98/); assert.match(driver, /compareStreamingVideoClocks\(clockReference, times\(output\)/);
  assert.match(ui, /files\[0\].name !== "test.mkv" \|\| files\[0\].size !== 2958573265/);
  assert.match(ui, /fullOriginal \? 21600000 : 60000/); assert.match(ui, /fullOriginal \? 250 : 16/);
  assert.equal(MPEG2_ORIGINAL_GATE.maximumConversionMs, 21600000); assert.equal(MPEG2_ORIGINAL_GATE.publicAcceptance, false);
});
