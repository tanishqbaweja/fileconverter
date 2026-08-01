import { createHash } from "node:crypto";
import { execFile } from "node:child_process";
import { createReadStream } from "node:fs";
import { mkdir, rm, stat, writeFile } from "node:fs/promises";
import path from "node:path";
import { promisify } from "node:util";
import { fileURLToPath } from "node:url";

const execFileAsync = promisify(execFile);
const projectRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const fixtureRoot = path.join(projectRoot, "fixtures", "media");
const sourcePath = path.join(fixtureRoot, "remux-source.mkv");
const fixturePath = path.join(fixtureRoot, "transport-source.mpegts");
const legacyFixturePath = path.join(fixtureRoot, "transport-source.ts");

await mkdir(fixtureRoot, { recursive: true });
await rm(legacyFixturePath, { force: true });
await rm(`${legacyFixturePath}.json`, { force: true });
await rm(path.join(fixtureRoot, "transport-source.m2ts"), { force: true });
await rm(path.join(fixtureRoot, "transport-source.m2ts.json"), { force: true });
await execFileAsync(
  "ffmpeg",
  [
    "-hide_banner", "-loglevel", "error", "-nostdin", "-y",
    "-i", sourcePath,
    "-map", "0:v:0", "-map", "0:a:0",
    "-c", "copy", "-map_metadata", "0",
    "-mpegts_m2ts_mode", "0",
    "-mpegts_flags", "+resend_headers",
    "-fflags", "+bitexact", "-f", "mpegts", fixturePath,
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
  ["-v", "error", "-show_format", "-show_streams", "-show_programs", "-of", "json", fixturePath],
  { cwd: projectRoot, windowsHide: true, maxBuffer: 8 * 1024 * 1024 },
);
const probe = JSON.parse(stdout);
if (!probe.format?.format_name?.split(",").includes("mpegts")) {
  throw new Error("Generated fixture is not an MPEG transport stream.");
}
await writeFile(
  `${fixturePath}.json`,
  `${JSON.stringify({
    generatedBy: "scripts/generate-mpeg-ts-fixture.mjs",
    bytes: fixtureStat.size,
    sha256: hash.digest("hex"),
    probe,
  }, null, 2)}\n`,
  "utf8",
);
process.stdout.write(`${fixturePath}\n`);
