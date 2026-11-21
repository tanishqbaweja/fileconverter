import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { createHash } from "node:crypto";
import { lstat, writeFile } from "node:fs/promises";
import path from "node:path";

const CUE_COUNT = 6144;
const MAX_NATIVE_BYTES = 4 * 1024 ** 2;
const MAX_INPUT_BYTES = 6 * 1024 ** 2;
export const TIMED_TEXT_CANCEL_INPUT_NAME = "within-test-timed-text-cancellation.mp4";
export const TIMED_TEXT_CANCEL_OUTPUT_NAME = "within-test-timed-text-cancellation.vtt";

const clock = (ms) => new Date(ms).toISOString().slice(11, 23);
const timing = (index) => `${clock(100 + index * 100)} --> ${clock(160 + index * 100)}`;
const cueText = index => `Track two cue ${index + 1} — ${"Résumé & café 基準 😀 ".repeat(9).trimEnd()}`;
const DECOY_TEXT = "Unselected track: never a delivered cue";

function nativeRun(command, args, scratch, input) {
  const result = spawnSync(command, args, { cwd: scratch.directory, env: scratch.env, input,
    encoding: "utf8", windowsHide: true, timeout: 30_000, maxBuffer: MAX_NATIVE_BYTES });
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
export async function createTimedTextCancellationFixture(scratch, seed) {
  const ffmpeg = process.env.WITHIN_FFMPEG_EXECUTABLE ?? "ffmpeg";
  const ffprobe = process.env.WITHIN_FFPROBE_EXECUTABLE ?? "ffprobe";
  const common = ["-hide_banner", "-loglevel", "error"];
  const decoy = path.join(scratch.directory, "timed-text-decoy.srt");
  const input = path.join(scratch.directory, TIMED_TEXT_CANCEL_INPUT_NAME);
  const decoyTiming = "00:00:00.150 --> 00:00:00.450";
  await writeFile(decoy, `1\n${decoyTiming.replaceAll(".", ",")}\n${DECOY_TEXT}\n\n`, { flag: "wx" });
  const srt = Array.from({ length: CUE_COUNT }, (_, i) => `${i + 1}\n${timing(i).replaceAll(".", ",")}\n${cueText(i)}\n\n`).join("");
  assert.ok(Buffer.byteLength(srt) < MAX_NATIVE_BYTES);
  nativeRun(ffmpeg, [...common, "-n", "-i", seed, "-f", "srt", "-i", decoy, "-f", "srt", "-i", "pipe:0",
    "-map", "0:v:0", "-map", "0:a:0", "-map", "1:s:0", "-map", "2:s:0",
    "-map_chapters", "-1", "-map_metadata", "-1", "-c:v", "copy", "-c:a", "copy", "-c:s", "mov_text",
    "-tag:s:0", "tx3g", "-tag:s:1", "tx3g", "-metadata:s:s:0", "language=fra", "-metadata:s:s:1", "language=spa",
    "-movflags", "+faststart", "-fs", String(MAX_INPUT_BYTES), input], scratch, srt);
  const info = await lstat(input);
  assert.ok(info.isFile() && info.size > 1_048_576 && info.size <= MAX_INPUT_BYTES);
  const { streams } = JSON.parse(nativeRun(ffprobe, ["-v", "error", "-show_entries",
    "stream=codec_name,codec_type,codec_tag_string,id,nb_frames:stream_tags=language", "-of", "json", input], scratch));
  assert.deepEqual(streams.map(stream => stream.codec_type), ["video", "audio", "subtitle", "subtitle"]);
  const subtitle = streams.slice(2);
  assert.deepEqual(subtitle.map(stream => [stream.codec_name, stream.codec_tag_string, stream.tags?.language]),
    [["mov_text", "tx3g", "fra"], ["mov_text", "tx3g", "spa"]]);
  const trackIds = subtitle.map(stream => Number(stream.id));
  assert.ok(trackIds.every(id => Number.isSafeInteger(id) && id > 0) && trackIds[0] !== trackIds[1]);
  assert.ok(Number(subtitle[1].nb_frames) >= CUE_COUNT);
  const decode = i => nativeRun(ffmpeg, [...common, "-i", input, "-map", `0:s:${i}`, "-c:s", "srt", "-f", "srt", "pipe:1"], scratch);
  const decoyOracle = decodedCueOracle(decode(0), 1, () => decoyTiming, () => DECOY_TEXT);
  const expected = decodedCueOracle(decode(1), CUE_COUNT, timing, cueText);
  assert.ok(expected.bytes > 1_048_576 && expected.bytes <= MAX_NATIVE_BYTES && expected.sha256 !== decoyOracle.sha256);
  return { input, inputBytes: info.size, trackIds, selectedTrackId: trackIds[1], expected, decoyOracle,
    selectedPacketCount: Number(subtitle[1].nb_frames),
    nativeTool: nativeRun(ffprobe, ["-version"], scratch).split(/\r?\n/)[0] };
}
