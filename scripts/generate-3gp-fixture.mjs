import { createHash } from "node:crypto";
import { execFile } from "node:child_process";
import { createReadStream } from "node:fs";
import { mkdir, stat, writeFile } from "node:fs/promises";
import path from "node:path";
import { promisify } from "node:util";
import { fileURLToPath } from "node:url";

const execFileAsync = promisify(execFile);
const projectRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const fixtureRoot = path.join(projectRoot, "fixtures", "media");
const sourcePath = path.join(fixtureRoot, "remux-source.mkv");
const fixturePath = path.join(fixtureRoot, "mobile-video-source.3gp");

await mkdir(fixtureRoot, { recursive: true });
await execFileAsync(
  "ffmpeg",
  [
    "-hide_banner", "-loglevel", "error", "-nostdin", "-y",
    "-i", sourcePath,
    "-map", "0:v:0", "-map", "0:a:0",
    "-c", "copy", "-map_metadata", "0",
    "-metadata", "title=Within 3GPP fixture",
    "-metadata:s:a:0", "language=eng",
    "-fflags", "+bitexact", "-f", "3gp", fixturePath,
  ],
  { cwd: projectRoot, windowsHide: true, maxBuffer: 8 * 1024 * 1024 },
);

const fixtureStat = await stat(fixturePath);
const hash = createHash("sha256");
for await (const chunk of createReadStream(fixturePath, {
  highWaterMark: 1024 * 1024,
})) {
  hash.update(chunk);
}
const { stdout } = await execFileAsync(
  "ffprobe",
  ["-v", "error", "-show_format", "-show_streams", "-show_chapters", "-of", "json", fixturePath],
  { cwd: projectRoot, windowsHide: true, maxBuffer: 8 * 1024 * 1024 },
);
const probe = JSON.parse(stdout);
const codecs = probe.streams.map((stream) => stream.codec_name);
if (
  !probe.format?.tags?.major_brand?.trim().startsWith("3gp") ||
  codecs[0] !== "h264" ||
  codecs[1] !== "aac"
) {
  throw new Error(`Generated fixture is not H.264/AAC 3GP: ${codecs.join(", ")}.`);
}
await writeFile(
  `${fixturePath}.json`,
  `${JSON.stringify({
    generatedBy: "scripts/generate-3gp-fixture.mjs",
    bytes: fixtureStat.size,
    sha256: hash.digest("hex"),
    probe,
  }, null, 2)}\n`,
  "utf8",
);
process.stdout.write(`${fixturePath}\n`);
