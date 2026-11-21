import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { createHash } from "node:crypto";
import { createReadStream } from "node:fs";
import { lstat, readFile, writeFile } from "node:fs/promises";
import path from "node:path";

const CUE_COUNT = 6144;
const MAX_NATIVE_BYTES = 4 * 1024 ** 2;
const MAX_INPUT_BYTES = 6 * 1024 ** 2;
export const TIMED_TEXT_CANCEL_INPUT_NAME = "within-test-timed-text-cancellation.mp4";
export const TIMED_TEXT_CANCEL_OUTPUT_NAME = "within-test-timed-text-cancellation.vtt";
export const TIMED_TEXT_CO64_SEED = "fixtures/media/within-test-synthetic-hevc-aac.mkv";
export const TIMED_TEXT_CO64_WORK_BYTES = 10 * 1024 ** 3;
const CO64_MIN_OFFSET = 2 ** 32;
const CO64_FF_LIMIT = 6 * 1024 ** 3;
const CO64_LOOP_REPEATS = 768;
const CO64_START_MS = 20_000_000;
// FFmpeg's tx3g mux clock is 1/1,000,000 here. Separate genuine calibration
// cues limit an individual early delta to ~1e9 ticks; one 5.5-hour gap was
// actually clipped by the fixture muxer. The later 6,144 cues still ALL have
// to live physically after the 4 GiB boundary, regardless of these markers.
const CO64_CALIBRATION_COUNT = 20;

const clock = (ms) => new Date(ms).toISOString().slice(11, 23);
const timing = (index) => `${clock(100 + index * 100)} --> ${clock(160 + index * 100)}`;
const cueText = index => `Track two cue ${index + 1} — ${"Résumé & café 基準 😀 ".repeat(9).trimEnd()}`;
const DECOY_TEXT = "Unselected track: never a delivered cue";

function nativeRun(command, args, scratch, input, timeout = 30_000) {
  const result = spawnSync(command, args, { cwd: scratch.directory, env: scratch.env, input,
    encoding: "utf8", windowsHide: true, timeout, maxBuffer: MAX_NATIVE_BYTES });
  if (result.error) throw result.error;
  assert.equal(result.status, 0, `${command}: ${result.stderr}`);
  return result.stdout;
}

// Build the independent byte oracle from actual FFmpeg-decoded cues, after
// checking every decoded timestamp and cue against the fixture definition.
// No application/worker imports, and no complete user input or output here.
function decodedCueOracle(decoded, count, expectedTiming, expectedText) {
  const normalized = decoded.replaceAll("\r\n", "\n");
  assert.ok(normalized.endsWith("\n\n"), "Native SRT is truncated");
  const blocks = normalized.slice(0, -2).split("\n\n");
  assert.equal(blocks.length, count);
  const hash = createHash("sha256");
  let bytes = 8;
  hash.update("WEBVTT\n\n");
  for (const [i, block] of blocks.entries()) {
    const [index, time, ...payload] = block.split("\n");
    assert.equal(index, String(i + 1));
    assert.equal(time, expectedTiming(i).replaceAll(".", ","));
    // Normalize only FFmpeg's default SubRip font wrapper, not arbitrary markup.
    const plain = payload.join("\n").replace(/<\/?font(?: (?:face|size|color)="(?:Serif|18|0|#000000)")*>/g, "");
    assert.equal(plain, expectedText(i));
    const cue = `${time.replaceAll(",", ".")}\n${plain.replaceAll("&", "&amp;").replaceAll("<", "&lt;").replaceAll(">", "&gt;")}\n\n`;
    hash.update(cue);
    bytes += Buffer.byteLength(cue);
  }
  return { cues: count, bytes, sha256: hash.digest("hex") };
}

// The caller owns scratch, uses only the bundled synthetic media seed, and
// must close scratch in finally. No native processes perform browser jobs.
export async function createTimedTextCancellationFixture(scratch, seed, container = "mp4", co64 = false) {
  assert.ok(["mp4", "mov", "3gp"].includes(container), "Unknown fixture container");
  assert.ok(!co64 || container === "mp4");
  if (co64) {
    const hash = createHash("sha256");
    assert.equal((await lstat(seed)).size, 5945271);
    for await (const chunk of createReadStream(seed, { highWaterMark: 262144 })) hash.update(chunk);
    assert.equal(hash.digest("hex"), "5b8fdc40c1679299442736984826ff4d01be2e69915906ea4e31c0dde267dedc");
  }
  const ffmpeg = process.env.WITHIN_FFMPEG_EXECUTABLE ?? "ffmpeg";
  const ffprobe = process.env.WITHIN_FFPROBE_EXECUTABLE ?? "ffprobe";
  const common = ["-hide_banner", "-loglevel", "error"];
  const decoy = path.join(scratch.directory, "timed-text-decoy.srt");
  const input = path.join(scratch.directory, TIMED_TEXT_CANCEL_INPUT_NAME.replace(/\.mp4$/, `.${container}`));
  const decoyTiming = "00:00:00.150 --> 00:00:00.450";
  const markerCount = co64 ? CO64_CALIBRATION_COUNT : 0;
  const selectedTiming = index => {
    if (index < markerCount) return `${clock(index * 1_000_000 + 100)} --> ${clock(index * 1_000_000 + 400)}`;
    const fileIndex = index - markerCount;
    return co64 ? `${clock(CO64_START_MS + 100 + fileIndex * 100)} --> ${clock(CO64_START_MS + 160 + fileIndex * 100)}` : timing(fileIndex);
  };
  const selectedCueText = index => index < markerCount ? `Timeline calibration cue ${index + 1}` : cueText(index - markerCount);
  await writeFile(decoy, `1\n${decoyTiming.replaceAll(".", ",")}\n${DECOY_TEXT}\n\n`, { flag: "wx" });
  const srt = Array.from({ length: CUE_COUNT + markerCount }, (_, i) => `${i + 1}\n${selectedTiming(i).replaceAll(".", ",")}\n${selectedCueText(i)}\n\n`).join("");
  assert.ok(Buffer.byteLength(srt) < MAX_NATIVE_BYTES);
  const generationStarted = Date.now();
  nativeRun(ffmpeg, [...common, "-n", ...(co64 ? ["-stream_loop", String(CO64_LOOP_REPEATS - 1)] : []), "-i", seed, "-f", "srt", "-i", decoy, "-f", "srt", "-i", "pipe:0",
    "-map", "0:v:0", "-map", "0:a:0", "-map", "1:s:0", "-map", "2:s:0",
    "-map_chapters", "-1", "-map_metadata", "-1", "-c:v", "copy", "-c:a", "copy", "-c:s", "mov_text",
    "-tag:s:0", "tx3g", "-tag:s:1", "tx3g", "-metadata:s:s:0", "language=fra", "-metadata:s:s:1", "language=spa",
    ...(co64 ? [] : ["-movflags", "+faststart"]), "-fs", String(co64 ? CO64_FF_LIMIT : MAX_INPUT_BYTES), "-f", container, input], scratch, srt, co64 ? 300_000 : 30_000);
  const generationElapsedMs = Date.now() - generationStarted;
  const info = await lstat(input);
  assert.ok(info.isFile() && info.size > (co64 ? CO64_MIN_OFFSET : 1_048_576) && info.size < (co64 ? CO64_FF_LIMIT : MAX_INPUT_BYTES));
  const { streams, format } = JSON.parse(nativeRun(ffprobe, ["-v", "error", "-show_entries",
    "stream=codec_name,codec_type,codec_tag_string,id,nb_frames:stream_tags=language:format_tags=major_brand", "-of", "json", input], scratch));
  const majorBrand = format?.tags?.major_brand;
  if (container === "3gp") assert.match(majorBrand ?? "", /^3gp[a-z0-9]$/);
  else assert.equal(majorBrand, container === "mov" ? "qt  " : "isom");
  assert.deepEqual(streams.map(stream => stream.codec_type), ["video", "audio", "subtitle", "subtitle"]);
  const subtitle = streams.slice(2);
  assert.deepEqual(subtitle.map(stream => [stream.codec_name, stream.codec_tag_string, stream.tags?.language]),
    [["mov_text", "tx3g", "fra"], ["mov_text", "tx3g", "spa"]]);
  const trackIds = subtitle.map(stream => Number(stream.id));
  assert.ok(trackIds.every(id => Number.isSafeInteger(id) && id > 0) && trackIds[0] !== trackIds[1]);
  assert.ok(Number(subtitle[1].nb_frames) >= CUE_COUNT);
  const srtOutput = (i, target) => ["-map", `0:s:${i}`, "-c:s", "srt", "-f", "srt", target];
  let decoyText, selectedText, physicalScale;
  if (co64) {
    const decoyCopy = path.join(scratch.directory, "oracle-decoy.srt");
    selectedText = nativeRun(ffmpeg, [...common, "-n", "-i", input, ...srtOutput(0, decoyCopy), ...srtOutput(1, "pipe:1")], scratch, undefined, 180_000);
    assert.ok((await lstat(decoyCopy)).size < 4096);
    decoyText = await readFile(decoyCopy, "utf8");
    const { packets } = JSON.parse(nativeRun(ffprobe, ["-v", "error", "-select_streams", "s:1", "-show_packets",
      "-show_entries", "packet=pos,size,pts_time", "-of", "json", input], scratch, undefined, 180_000));
    const visible = packets.filter(packet => Number(packet.size) > 2);
    assert.equal(visible.length, CUE_COUNT + markerCount);
    const late = visible.slice(markerCount);
    for (const [index, packet] of late.entries()) assert.equal(Number(packet.pts_time), (CO64_START_MS + 100 + index * 100) / 1000);
    const firstCueOffset = Math.min(...late.map(packet => Number(packet.pos)));
    const lastCueEnd = Math.max(...late.map(packet => Number(packet.pos) + Number(packet.size)));
    assert.ok(firstCueOffset >= CO64_MIN_OFFSET && lastCueEnd <= info.size, "Every late selected cue must physically follow the 4 GiB boundary");
    // FFprobe's declared video sample count proves the whole native loop was
    // muxed. Four-GiB padding, sparse-file tricks and file-size truncation
    // cannot provide this exact count from the source's 288 HEVC frames.
    const videoFrames = Number(streams[0].nb_frames);
    assert.equal(videoFrames, CO64_LOOP_REPEATS * 288);
    const hash = createHash("sha256");
    for await (const data of createReadStream(input, { highWaterMark: 1048576 })) hash.update(data);
    physicalScale = { loops: CO64_LOOP_REPEATS, videoFrames, firstCueOffset, lastCueEnd, timelineCalibrationCues: markerCount,
      lateCueCount: CUE_COUNT, allLateSelectedCuesPhysicallyAboveFourGiB: true,
      sourceSha256: hash.digest("hex"), generationElapsedMs, browserReencodedVideo: false, protectedOriginalSelected: false };
  } else {
    const decode = i => nativeRun(ffmpeg, [...common, "-i", input, ...srtOutput(i, "pipe:1")], scratch);
    decoyText = decode(0); selectedText = decode(1);
  }
  const decoyOracle = decodedCueOracle(decoyText, 1, () => decoyTiming, () => DECOY_TEXT);
  const expected = decodedCueOracle(selectedText, CUE_COUNT + markerCount, selectedTiming, selectedCueText);
  assert.ok(expected.bytes > 1_048_576 && expected.bytes <= MAX_NATIVE_BYTES && expected.sha256 !== decoyOracle.sha256);
  return { input, inputBytes: info.size, container, majorBrand, trackIds, selectedTrackId: trackIds[1], expected, decoyOracle,
    ...(physicalScale ? { physicalScale } : {}),
    selectedPacketCount: Number(subtitle[1].nb_frames),
    nativeTool: nativeRun(ffprobe, ["-version"], scratch).split(/\r?\n/)[0] };
}
