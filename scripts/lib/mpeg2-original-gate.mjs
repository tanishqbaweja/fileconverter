// Exact full original, not a generated replacement or a claim of public support.
import assert from "node:assert/strict";
import path from "node:path";
import { fileURLToPath } from "node:url";
export async function selectExactLocalOriginal(page, file) {
  assert.equal(path.resolve(file), fileURLToPath(new URL("../../test.mkv", import.meta.url)), "Only repository original input is permitted");
  const session = await page.context().newCDPSession(page);
  try {
    const { root } = await session.send("DOM.getDocument", { depth: 0 });
    const { nodeId } = await session.send("DOM.querySelector", { nodeId: root.nodeId, selector: 'input[type="file"]' });
    assert.ok(Number.isSafeInteger(nodeId) && nodeId > 0, "Production input element unavailable");
    await session.send("DOM.setFileInputFiles", { nodeId, files: [file] });
    await page.waitForFunction(() => {
      const files = document.querySelector('input[type="file"]')?.files;
      return files?.length === 1 && files[0].name === "test.mkv" && files[0].size === 2958573265;
    });
    return { mechanism: "DOM.setFileInputFiles on existing production input; same-host OS-picker adapter only",
      remotePlaywrightUpload: false, sourceCopyCreated: false, completeOriginalSelected: true, alternateConversionPath: false };
  } finally { await session.detach(); }
}
export const MPEG2_ORIGINAL_GATE = Object.freeze({ bytes: 2958573265,
  sha256: "31f36695b5b44c62125a9e4264e84dc085accd21c02cc3487aae597f54b9db34",
  width: 1920, height: 804, frames: 296160, frameRate: "24/1", maximumConversionMs: 21600000,
  validatorDeadlineMs: 7200000, publicAcceptance: false, repeatedStressAcceptance: false });
const tags = value => Object.fromEntries(Object.entries(value ?? {}).map(([key, value]) => [key.toLowerCase(), value]));
export function assertMpeg2OriginalStructure(source, output, warnings) {
  const expected = MPEG2_ORIGINAL_GATE;
  assert.equal(source.format.size, String(expected.bytes));
  assert.equal(source.streams.length, 4); assert.equal(output.streams.length, 3);
  const [sv, sa, sub, cover] = source.streams, [ov, oa, oc] = output.streams;
  assert.equal(sv.codec_name, "hevc"); assert.equal(ov.codec_name, "mpeg2video");
  for (const stream of [sv, ov]) { assert.equal(stream.width, expected.width); assert.equal(stream.height, expected.height); assert.equal(stream.avg_frame_rate, expected.frameRate); }
  for (const field of ["sample_aspect_ratio", "display_aspect_ratio", "pix_fmt", "color_range", "color_space", "color_transfer", "color_primaries", "chroma_location"])
    assert.equal(ov[field], sv[field], "Original video field changed: " + field);
  for (const field of ["codec_name", "profile", "sample_rate", "channels", "channel_layout", "extradata_size"])
    assert.equal(oa[field], sa[field], "Copied audio field changed: " + field);
  assert.equal(sa.codec_name, "aac"); assert.equal(tags(oa.tags).language, tags(sa.tags).language);
  for (const [before, after] of [[sv, ov], [sa, oa]]) {
    for (const [key, value] of Object.entries(tags(before.tags))) {
      if (["duration", "number_of_frames", "number_of_bytes", "_statistics_writing_app", "_statistics_writing_date_utc", "_statistics_tags", "bps"].includes(key)) continue;
      const actual = tags(after.tags);
      assert.equal(key === "title" ? actual.name : actual[key], value, "Original stream tag changed: " + key);
    }
    for (const key of ["default", "forced", "hearing_impaired", "visual_impaired", "comment", "original"])
      assert.equal(after.disposition[key], before.disposition[key], "Original disposition changed: " + key);
  }
  assert.equal(sub.codec_name, "subrip");
  assert.ok(warnings.some(w => /Source stream 2 \(subrip\).*explicitly excluded/i.test(w)), "SubRip exclusion must be genuinely disclosed, not silently omitted");
  assert.equal(cover.codec_name, "png"); assert.equal(cover.disposition.attached_pic, 1);
  assert.equal(oc.codec_name, "png"); assert.equal(oc.disposition.attached_pic, 1);
  assert.equal(oc.width, cover.width); assert.equal(oc.height, cover.height);
  for (const [key, value] of Object.entries(tags(source.format.tags))) assert.equal(tags(output.format.tags)[key], value, "Original format tag changed: " + key);
  assert.deepEqual(output.chapters, source.chapters);
  assert.ok(Math.abs(Number(output.format.duration) - Number(source.format.duration)) < 0.02);
  assert.ok(Number(output.format.size) >= expected.bytes && Number(output.format.size) <= 12 * 1024 ** 3, "Original output must be comparable real video, not tiny extraction");
  return { sourceFrames: expected.frames, sourceDimensionsPreserved: true, audioStructurePreserved: true,
    streamTagsAndDispositionsPreserved: true, formatTagsPreserved: true, chaptersPreserved: true,
    pngArtworkRepresented: true, subripExcludedWithActualWarning: true,
    subtitleConversionImplemented: false, publicAcceptance: false };
}
export async function compareOriginalAacPackets(beforeIterable, afterIterable) {
  const before = beforeIterable[Symbol.asyncIterator](), after = afterIterable[Symbol.asyncIterator]();
  let packets = 0, maximumPtsErrorSeconds = 0, maximumDtsErrorSeconds = 0, maximumDurationErrorSeconds = 0, unavailableDurations = 0;
  try {
    for (;;) {
      const [a, b] = await Promise.all([before.next(), after.next()]); assert.equal(a.done, b.done, "Original AAC packet count changed"); if (a.done) break;
      const x = a.value, y = b.value; assert.equal(x.hash, y.hash, "Original AAC bytes/order changed");
      assert.equal(x.streamIndex, 1); assert.equal(y.streamIndex, 1); assert.ok(++packets <= 10000000);
      const pts = Math.abs(x.pts - y.pts), dts = Math.abs(x.dts - y.dts);
      assert.ok(pts < 0.001 && dts < 0.001, "Original AAC clock changed");
      maximumPtsErrorSeconds = Math.max(maximumPtsErrorSeconds, pts); maximumDtsErrorSeconds = Math.max(maximumDtsErrorSeconds, dts);
      assert.equal(x.skip, y.skip); assert.equal(x.tail, y.tail);
      if (x.duration === null || y.duration === null) { assert.equal(x.duration, y.duration); unavailableDurations++; }
      else { const error = Math.abs(x.duration - y.duration); assert.ok(error < 0.001); maximumDurationErrorSeconds = Math.max(maximumDurationErrorSeconds, error); }
    }
  } finally { await Promise.allSettled([before.return?.(), after.return?.()]); }
  assert.ok(packets > 0);
  return { packets, maximumPtsErrorSeconds, maximumDtsErrorSeconds, maximumDurationErrorSeconds, unavailableDurations,
    bytesAndOrderIdentical: true, trimFieldsPreserved: true, maximumRetainedPackets: 2, pcmValidationCovered: false };
}
