import { createHash } from "node:crypto";
import { execFile } from "node:child_process";
import { createReadStream } from "node:fs";
import { mkdir, stat, writeFile } from "node:fs/promises";
import path from "node:path";
import { promisify } from "node:util";
import { fileURLToPath } from "node:url";

const execFileAsync = promisify(execFile);
const projectRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const targetGiB = Number.parseInt(process.argv[2] ?? "", 10);
if (![6, 10].includes(targetGiB)) {
  throw new Error("Pass a deterministic target size of 6 or 10 GiB.");
}
const targetBytes = targetGiB * 1024 * 1024 * 1024;
const sourcePath = path.join(projectRoot, "test.mkv");
const fixtureRoot = path.join(projectRoot, "fixtures", "stress", "media");
const fixturePath = path.join(fixtureRoot, `remux-${targetGiB}g.mkv`);
await mkdir(fixtureRoot, { recursive: true });

await execFileAsync(
  "ffmpeg",
  [
    "-hide_banner",
    "-loglevel",
    "error",
    "-nostdin",
    "-y",
    "-stream_loop",
    "-1",
    "-i",
    sourcePath,
    "-map",
    "0:v:0",
    "-map",
    "0:a:0",
    "-c",
    "copy",
    "-map_metadata",
    "0",
    "-fflags",
    "+bitexact",
    "-fs",
    String(targetBytes),
    "-f",
    "matroska",
    fixturePath,
  ],
  { cwd: projectRoot, windowsHide: true, maxBuffer: 16 * 1024 * 1024 },
);

const fixtureStat = await stat(fixturePath);
const hash = createHash("sha256");
for await (const chunk of createReadStream(fixturePath, {
  highWaterMark: 4 * 1024 * 1024,
})) {
  hash.update(chunk);
}
const { stdout } = await execFileAsync(
  "ffprobe",
  [
    "-v",
    "error",
    "-show_format",
    "-show_streams",
    "-show_chapters",
    "-of",
    "json",
    fixturePath,
  ],
  { cwd: projectRoot, windowsHide: true, maxBuffer: 16 * 1024 * 1024 },
);
await writeFile(
  `${fixturePath}.json`,
  `${JSON.stringify(
    {
      generatedBy: "scripts/generate-media-stress-fixture.mjs",
      targetGiB,
      targetBytes,
      bytes: fixtureStat.size,
      sha256: hash.digest("hex"),
      source: "test.mkv",
      probe: JSON.parse(stdout),
    },
    null,
    2,
  )}\n`,
  "utf8",
);
process.stdout.write(`${fixturePath}\n`);
