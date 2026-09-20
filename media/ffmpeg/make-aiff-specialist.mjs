import { createHash } from "node:crypto";
import { readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

const projectRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../..");
const workRoot = path.join(projectRoot, "work");
const publishedSource = path.join(projectRoot, "media", "ffmpeg", "within_remux.c");
const expectedSourceSha256 = "ae501a2e7b435b246a1056959ae93b7e573f1548b1729171eec5b215e0683068";
const [sourceArgument, outputArgument] = process.argv.slice(2);
if (!sourceArgument || !outputArgument) {
  throw new Error("Usage: node make-aiff-specialist.mjs <within_remux.c> <work/.../within_aiff.c>");
}
const sourcePath = path.resolve(sourceArgument);
const outputPath = path.resolve(outputArgument);
if (
  (sourcePath !== publishedSource && !sourcePath.startsWith(`${workRoot}${path.sep}`)) ||
  !outputPath.startsWith(`${workRoot}${path.sep}`) ||
  path.basename(sourcePath) !== "within_remux.c" ||
  path.basename(outputPath) !== "within_aiff.c"
) {
  throw new Error("AIFF specialist source paths must be the pinned wrapper and repository-local work output.");
}

const source = await readFile(sourcePath, "utf8");
const sourceSha256 = createHash("sha256").update(source).digest("hex");
if (sourceSha256 !== expectedSourceSha256) {
  throw new Error(`The audited general wrapper changed: ${sourceSha256}`);
}
const entryMarker = "EMSCRIPTEN_KEEPALIVE\nint within_remux(";
if (source.split(entryMarker).length !== 2) {
  throw new Error("The general wrapper entrypoint was not found exactly once.");
}
const specialist = `${source.replace(entryMarker, "static\nint within_remux(")}

// Only the AIFF/PCM transcode path remains reachable from this entrypoint.
// The original implementation and source hash above remain unmodified.
EMSCRIPTEN_KEEPALIVE
int within_aiff(int profile, int audio_bit_rate, int audio_sample_rate,
                int audio_channels, int audio_codec,
                int audio_compression, int audio_quality, int video_codec,
                int video_max_width, int video_bit_rate,
                int video_frame_rate, int video_quality) {
  if (profile != 28 || video_codec != 0 || video_max_width != 0 ||
      video_bit_rate != 0 || video_frame_rate != 0 || video_quality != 0) {
    within_message(2, "The AIFF specialist accepts only profile 28 and audio options.");
    return AVERROR(EINVAL);
  }
  return within_audio_transcode(28, audio_bit_rate, audio_sample_rate,
                                audio_channels, audio_codec,
                                audio_compression, audio_quality);
}
`;
await writeFile(outputPath, specialist, { flag: "wx" });
process.stdout.write(`${createHash("sha256").update(specialist).digest("hex")}  ${outputPath}\n`);
