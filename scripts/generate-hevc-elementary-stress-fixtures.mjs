import { createHash } from "node:crypto";
import { execFile } from "node:child_process";
import { createReadStream } from "node:fs";
import { mkdir, readFile, rm, stat, writeFile } from "node:fs/promises";
import path from "node:path";
import { promisify } from "node:util";
import { fileURLToPath } from "node:url";

const execFileAsync = promisify(execFile);
const startedAt = performance.now();
const projectRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const fixtureRoot = path.join(projectRoot, "fixtures", "stress", "media");
const sourcePath = path.join(fixtureRoot, "quicktime-128m.mov");
const outputs = [
  {
    path: path.join(fixtureRoot, "hevc-video-128m.mkv"),
    format: "matroska,webm",
    arguments: ["-map", "0:v:0", "-map", "0:a:0", "-c", "copy", "-map_metadata", "0", "-f", "matroska"],
  },
  {
    path: path.join(fixtureRoot, "hevc-video-128m.mp4"),
    format: "mov,mp4,m4a,3gp,3g2,mj2",
    arguments: ["-map", "0:v:0", "-map", "0:a:0", "-c", "copy", "-map_metadata", "0", "-f", "mp4"],
  },
  {
    path: path.join(fixtureRoot, "hevc-video-128m.mpegts"),
    format: "mpegts",
    arguments: ["-map", "0:v:0", "-map", "0:a:0", "-c", "copy", "-map_metadata", "0", "-f", "mpegts"],
  },
];
const retainedManifests = new Map();

await mkdir(fixtureRoot, { recursive: true });
try {
  await execFileAsync(process.execPath, ["scripts/generate-mov-stress-fixture.mjs"], {
    cwd: projectRoot,
    windowsHide: true,
    maxBuffer: 16 * 1024 * 1024,
  });
  const sourceManifest = JSON.parse(await readFile(`${sourcePath}.json`, "utf8"));
  for (const output of outputs) {
    const manifestPath = `${output.path}.json`;
    retainedManifests.set(
      manifestPath,
      await readFile(manifestPath, "utf8").catch((error) => {
        if (error?.code === "ENOENT") return null;
        throw error;
      }),
    );
  }
  await Promise.all(
    outputs.map((output) =>
      execFileAsync(
        "ffmpeg",
        [
          "-hide_banner", "-loglevel", "error", "-nostdin", "-y",
          "-i", sourcePath, ...output.arguments, "-fflags", "+bitexact", output.path,
        ],
        { cwd: projectRoot, windowsHide: true, maxBuffer: 16 * 1024 * 1024 },
      ),
    ),
  );
  const minimumBytes = 128 * 1024 * 1024;
  const manifests = await Promise.all(
    outputs.map(async (output) => {
      const [fileStat, probe, sha256] = await Promise.all([
        stat(output.path),
        probeFile(output.path),
        hashFile(output.path),
      ]);
      if (fileStat.size < minimumBytes) {
        throw new Error(`${path.basename(output.path)} is ${fileStat.size} bytes; expected at least ${minimumBytes}.`);
      }
      const video = probe.streams.find((stream) => stream.codec_type === "video");
      const actualFormats = probe.format?.format_name?.split(",") ?? [];
      if (
        !actualFormats.some((name) => output.format.split(",").includes(name)) ||
        video?.codec_name !== "hevc" ||
        video?.width !== 1920 ||
        video?.height !== 804
      ) {
        throw new Error(`${path.basename(output.path)} is not the expected 1920x804 HEVC fixture.`);
      }
      const decodedVideoFrames = Number(video.nb_read_frames);
      if (!Number.isFinite(decodedVideoFrames) || decodedVideoFrames <= 0) {
        throw new Error(`${path.basename(output.path)} has no countable HEVC frames.`);
      }
      return {
        output,
        manifest: {
          generatedBy: "scripts/generate-hevc-elementary-stress-fixtures.mjs",
          source: "fixtures/stress/media/quicktime-128m.mov",
          sourceSha256: sourceManifest.sha256,
          durationSeconds: Number(probe.format?.duration ?? sourceManifest.durationSeconds),
          decodedVideoFrames,
          bytes: fileStat.size,
          sha256,
          generationSeconds: Number(((performance.now() - startedAt) / 1000).toFixed(2)),
          probe,
        },
      };
    }),
  );
  await Promise.all(
    manifests.map(({ output, manifest }) =>
      writeFile(`${output.path}.json`, `${JSON.stringify(manifest, null, 2)}\n`, "utf8"),
    ),
  );
  for (const { output } of manifests) process.stdout.write(`${output.path}\n`);
  process.stdout.write(
    `Generated four HEVC extraction sources in ${((performance.now() - startedAt) / 1000).toFixed(2)} seconds.\n`,
  );
} catch (error) {
  for (const output of outputs) {
    await rm(output.path, { force: true });
    const manifestPath = `${output.path}.json`;
    const retained = retainedManifests.get(manifestPath);
    if (retained == null) await rm(manifestPath, { force: true });
    else await writeFile(manifestPath, retained, "utf8");
  }
  throw error;
}

async function probeFile(filePath) {
  const { stdout } = await execFileAsync(
    "ffprobe",
    ["-v", "error", "-count_frames", "-count_packets", "-show_format", "-show_streams", "-show_chapters", "-of", "json", filePath],
    { cwd: projectRoot, windowsHide: true, maxBuffer: 16 * 1024 * 1024 },
  );
  return JSON.parse(stdout);
}

async function hashFile(filePath) {
  const hash = createHash("sha256");
  for await (const chunk of createReadStream(filePath, { highWaterMark: 4 * 1024 * 1024 })) {
    hash.update(chunk);
  }
  return hash.digest("hex");
}
