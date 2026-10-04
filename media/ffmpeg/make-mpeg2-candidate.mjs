import { createHash } from "node:crypto";
import { readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

const directory = path.dirname(fileURLToPath(import.meta.url));
const root = path.resolve(directory, "../..");
const workRoot = path.join(root, "work");
const output = path.resolve(process.argv[2] ?? "");
if (!output.startsWith(`${workRoot}${path.sep}`) || path.basename(output) !== "within_mpeg2.c") {
  throw new Error("Usage: node make-mpeg2-candidate.mjs <repository/work/.../within_mpeg2.c>");
}
const source = await readFile(path.join(directory, "within_remux.c"), "utf8");
const digest = createHash("sha256").update(source).digest("hex");
if (digest !== "ae501a2e7b435b246a1056959ae93b7e573f1548b1729171eec5b215e0683068") {
  throw new Error(`Audited AVIO source changed: ${digest}`);
}
const marker = "static int supported_audio_artwork_codec(enum AVCodecID codec_id);";
if (source.split(marker).length !== 2) throw new Error("Expected AVIO boundary exactly once.");
const bridge = source.slice(0, source.indexOf(marker))
  .replace("#include <libswresample/swresample.h>\n", "");
// Reuse the exact audited header-only JPEG/PNG reader. No artwork decoder,
// expanded pixels, unbounded probing or additional file reads are needed.
const artworkStart = "static uint16_t artwork_read_be16(";
const artworkEnd = "static int bounded_audio_artwork_stream(const AVStream *stream) {";
if (source.split(artworkStart).length !== 2 || source.split(artworkEnd).length !== 2 ||
    source.indexOf(artworkEnd) <= source.indexOf(artworkStart)) {
  throw new Error("Expected audited artwork reader boundaries exactly once.");
}
const artwork = source.slice(source.indexOf(artworkStart), source.indexOf(artworkEnd));
const kernel = await readFile(path.join(directory, "mpeg2-candidate.c"), "utf8");
const candidate = bridge + artwork + kernel;
await writeFile(output, candidate, { flag: "wx" });
process.stdout.write(`${createHash("sha256").update(candidate).digest("hex")}  ${output}\n`);
