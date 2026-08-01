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
const fixturePath = path.join(fixtureRoot, "theora-video-source.ogv");

await mkdir(fixtureRoot, { recursive: true });
await execFileAsync(
  "ffmpeg",
  [
    "-hide_banner", "-loglevel", "error", "-nostdin", "-y",
    "-f", "lavfi", "-i", "testsrc2=size=640x360:rate=24:duration=4",
    "-f", "lavfi", "-i", "sine=frequency=660:sample_rate=48000:duration=4",
    "-map", "0:v:0", "-map", "1:a:0",
    "-c:v", "libtheora", "-q:v", "7", "-threads:v", "1",
    "-c:a", "libvorbis", "-q:a", "5",
    "-metadata", "title=Within Theora fixture",
    "-metadata:s:a:0", "language=eng",
    "-fflags", "+bitexact", "-f", "ogg", fixturePath,
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
  !probe.format?.format_name?.split(",").includes("ogg") ||
  codecs[0] !== "theora" ||
  codecs[1] !== "vorbis"
) {
  throw new Error(`Generated fixture is not Theora/Vorbis OGV: ${codecs.join(", ")}.`);
}
await writeFile(
  `${fixturePath}.json`,
  `${JSON.stringify({
    generatedBy: "scripts/generate-ogv-fixture.mjs",
    bytes: fixtureStat.size,
    sha256: hash.digest("hex"),
    probe,
  }, null, 2)}\n`,
  "utf8",
);
process.stdout.write(`${fixturePath}\n`);
