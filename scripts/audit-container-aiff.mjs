import { execFile } from "node:child_process";
import { rm, stat } from "node:fs/promises";
import path from "node:path";
import { promisify } from "node:util";
import { fileURLToPath } from "node:url";

const execFileAsync = promisify(execFile);
const projectRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const workRoot = path.join(projectRoot, "work");
const generatedMp4 = path.join(workRoot, "container-aiff-audit-source.mp4");
const generatedWebm = path.join(workRoot, "container-aiff-audit-source.webm");
const cases = [
  ["mkv", path.join(projectRoot, "fixtures", "media", "remux-source.mkv")],
  ["mp4", generatedMp4],
  ["mov", path.join(projectRoot, "fixtures", "media", "quicktime-source.mov")],
  ["3gp", path.join(projectRoot, "fixtures", "media", "mobile-video-source.3gp")],
  ["mpeg-ts", path.join(projectRoot, "fixtures", "media", "transport-source.mpegts")],
  ["flv", path.join(projectRoot, "fixtures", "media", "flash-video-source.flv")],
  ["avi", path.join(projectRoot, "fixtures", "media", "legacy-video-source.avi")],
  ["ogv", path.join(projectRoot, "fixtures", "media", "theora-video-source.ogv")],
  ["webm", generatedWebm],
];
const outputPaths = cases.map(([input]) =>
  path.join(workRoot, `container-aiff-audit-${input}.aiff`),
);
const generatedPaths = [generatedMp4, generatedWebm, ...outputPaths];

for (const target of generatedPaths) assertInside(workRoot, target);

try {
  await runFfmpeg([
    "-i", cases[0][1], "-map", "0:v:0", "-map", "0:a:0", "-c", "copy",
    "-f", "mp4", generatedMp4,
  ]);
  await runFfmpeg([
    "-i", path.join(projectRoot, "fixtures", "media", "av1-opus-source.mkv"),
    "-map", "0:v:0", "-map", "0:a:0", "-c", "copy", "-f", "webm",
    generatedWebm,
  ]);

  const results = [];
  for (let index = 0; index < cases.length; index += 1) {
    const [input, inputPath] = cases[index];
    const outputPath = outputPaths[index];
    const startedAt = performance.now();
    await runFfmpeg([
      "-i", inputPath, "-map", "0:a:0", "-vn", "-c:a", "pcm_s16be",
      "-fflags", "+bitexact", "-flags:a", "+bitexact", "-f", "aiff", outputPath,
    ]);
    await execFileAsync(
      "ffmpeg",
      ["-hide_banner", "-loglevel", "error", "-xerror", "-nostdin", "-i", outputPath, "-map", "0:a:0", "-f", "null", "NUL"],
      { cwd: projectRoot, windowsHide: true, maxBuffer: 8 * 1024 * 1024 },
    );
    const { stdout } = await execFileAsync(
      "ffprobe",
      ["-v", "error", "-select_streams", "a:0", "-show_entries", "stream=codec_name,sample_rate,channels", "-show_entries", "format=format_name", "-of", "json", outputPath],
      { cwd: projectRoot, windowsHide: true, maxBuffer: 8 * 1024 * 1024 },
    );
    const probe = JSON.parse(stdout);
    const audio = probe.streams?.[0];
    if (
      audio?.codec_name !== "pcm_s16be" ||
      !Number.isInteger(Number(audio?.sample_rate)) ||
      Number(audio?.sample_rate) <= 0 ||
      !Number.isInteger(Number(audio?.channels)) ||
      Number(audio?.channels) < 1 ||
      Number(audio?.channels) > 2 ||
      !String(probe.format?.format_name).split(",").includes("aiff")
    ) {
      throw new Error(`Unexpected AIFF probe for ${input}: ${stdout}`);
    }
    results.push({
      input,
      seconds: Number(((performance.now() - startedAt) / 1000).toFixed(2)),
      bytes: (await stat(outputPath)).size,
      codec: audio.codec_name,
      sampleRate: Number(audio.sample_rate),
      channels: Number(audio.channels),
    });
  }
  process.stdout.write(`${JSON.stringify(results, null, 2)}\n`);
} finally {
  await Promise.all(generatedPaths.map((target) => rm(target, { force: true })));
}

async function runFfmpeg(arguments_) {
  await execFileAsync(
    "ffmpeg",
    ["-hide_banner", "-loglevel", "error", "-nostdin", "-y", ...arguments_],
    { cwd: projectRoot, windowsHide: true, maxBuffer: 8 * 1024 * 1024 },
  );
}

function assertInside(root, target) {
  const relative = path.relative(path.resolve(root), path.resolve(target));
  if (!relative || relative.startsWith("..") || path.isAbsolute(relative)) {
    throw new Error(`Refusing a non-project audit path: ${target}`);
  }
}
