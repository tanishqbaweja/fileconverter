import { mkdir, rm, rmdir, stat } from "node:fs/promises";
import { spawnSync } from "node:child_process";
import { dirname, join, relative, resolve, sep } from "node:path";
import { fileURLToPath } from "node:url";

const repositoryRoot = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const temporaryDirectory = resolve(repositoryRoot, "work", "ogv-copy-feasibility");
const relativeTemporaryDirectory = relative(repositoryRoot, temporaryDirectory);

if (
  !relativeTemporaryDirectory ||
  relativeTemporaryDirectory.startsWith(`..${sep}`) ||
  relativeTemporaryDirectory === ".."
) {
  throw new Error(`Unsafe temporary directory: ${temporaryDirectory}`);
}

const sourcePath = join(repositoryRoot, "fixtures", "media", "theora-video-source.ogv");
const matroskaPath = join(temporaryDirectory, "theora-vorbis.mkv");
const outputPath = join(temporaryDirectory, "roundtrip.ogv");

function run(binary, arguments_, { capture = false } = {}) {
  const result = spawnSync(binary, arguments_, {
    cwd: repositoryRoot,
    encoding: "utf8",
    stdio: capture ? ["ignore", "pipe", "pipe"] : "inherit",
    windowsHide: true,
  });
  if (result.error) throw result.error;
  if (result.status !== 0) {
    throw new Error(
      `${binary} exited with ${result.status}${result.stderr ? `: ${result.stderr.trim()}` : ""}`,
    );
  }
  return capture ? result.stdout.trim() : "";
}

function packetHash(path, selector) {
  return run(
    "ffmpeg",
    [
      "-hide_banner",
      "-loglevel",
      "error",
      "-i",
      path,
      "-map",
      selector,
      "-c",
      "copy",
      "-f",
      "streamhash",
      "-hash",
      "sha256",
      "-",
    ],
    { capture: true },
  );
}

await mkdir(temporaryDirectory, { recursive: true });
try {
  run("ffmpeg", [
    "-hide_banner",
    "-loglevel",
    "error",
    "-y",
    "-i",
    sourcePath,
    "-map",
    "0:v:0",
    "-map",
    "0:a:0",
    "-c",
    "copy",
    matroskaPath,
  ]);

  const startedAt = performance.now();
  run("ffmpeg", [
    "-hide_banner",
    "-loglevel",
    "error",
    "-y",
    "-i",
    matroskaPath,
    "-map",
    "0:v:0",
    "-map",
    "0:a:0",
    "-c",
    "copy",
    outputPath,
  ]);
  const conversionMilliseconds = performance.now() - startedAt;

  const sourceVideoHash = packetHash(sourcePath, "0:v:0");
  const outputVideoHash = packetHash(outputPath, "0:v:0");
  const sourceAudioHash = packetHash(sourcePath, "0:a:0");
  const outputAudioHash = packetHash(outputPath, "0:a:0");
  if (sourceVideoHash !== outputVideoHash) {
    throw new Error("The Theora compressed-packet hash changed during the round trip.");
  }
  if (sourceAudioHash !== outputAudioHash) {
    throw new Error("The Vorbis compressed-packet hash changed during the round trip.");
  }

  run("ffmpeg", [
    "-hide_banner",
    "-loglevel",
    "error",
    "-i",
    outputPath,
    "-map",
    "0:v:0",
    "-map",
    "0:a:0",
    "-f",
    "null",
    process.platform === "win32" ? "NUL" : "/dev/null",
  ]);

  const probe = JSON.parse(
    run(
      "ffprobe",
      [
        "-v",
        "error",
        "-show_entries",
        "format=format_name,size,duration:stream=index,codec_name,codec_type",
        "-of",
        "json",
        outputPath,
      ],
      { capture: true },
    ),
  );
  const source = await stat(sourcePath);
  const matroska = await stat(matroskaPath);
  const output = await stat(outputPath);
  console.log(
    JSON.stringify(
      {
        sourceBytes: source.size,
        matroskaBytes: matroska.size,
        outputBytes: output.size,
        conversionMilliseconds: Number(conversionMilliseconds.toFixed(3)),
        sourceVideoHash,
        sourceAudioHash,
        probe,
      },
      null,
      2,
    ),
  );
} finally {
  await rm(outputPath, { force: true });
  await rm(matroskaPath, { force: true });
  await rmdir(temporaryDirectory).catch((error) => {
    if (error?.code !== "ENOENT") throw error;
  });
}
