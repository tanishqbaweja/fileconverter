import { createHash } from "node:crypto";
import { readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { instrumentH264Allocator } from "../../scripts/lib/h264-allocator-instrumentation.mjs";

const directory = path.dirname(fileURLToPath(import.meta.url));
const root = path.resolve(directory, "../..");
const workRoot = path.join(root, "work");
const output = path.resolve(process.argv[2] ?? "");
if (!output.startsWith(`${workRoot}${path.sep}`) || path.basename(output) !== "within_h264.c") {
  throw new Error("Usage: node make-h264-candidate.mjs <repository/work/.../within_h264.c>");
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
const diagnostic = process.env.WITHIN_H264_ALLOCATOR_DIAGNOSTIC ?? "0";
if (!["0", "1"].includes(diagnostic)) throw new Error("Allocator diagnostic must be 0 or 1");
const kernel = await readFile(path.join(directory, "h264-candidate.c"), "utf8");
const candidate = bridge + (diagnostic === "1" ? instrumentH264Allocator(kernel,
  await readFile(path.join(directory, "h264-allocator-diagnostic.h"), "utf8")) : kernel);
await writeFile(output, candidate, { flag: "wx" });
process.stdout.write(`${createHash("sha256").update(candidate).digest("hex")}  ${output}\n`);
