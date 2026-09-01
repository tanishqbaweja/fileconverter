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
const fixturePath = path.join(fixtureRoot, "audio-artwork-128m.mp4");
const manifestPath = `${fixturePath}.json`;
const artworkSourcePath = path.join(
  projectRoot,
  "fixtures",
  "media",
  "audio-source-artwork.m4a",
);
const workRoot = path.join(projectRoot, "work", "audio-artwork-stress-fixture");
const extractedArtworkPath = path.join(workRoot, "cover.png");
const minimumBytes = 128 * 1024 * 1024;
const durationSeconds = 60;
const reservedMoovBytes = 132_000_000;
const previousManifest = await readFile(manifestPath, "utf8").catch((error) => {
  if (error?.code === "ENOENT") return null;
  throw error;
});

await mkdir(fixtureRoot, { recursive: true });
await rm(workRoot, { recursive: true, force: true });
await mkdir(workRoot, { recursive: true });

try {
  await execFileAsync(
    "ffmpeg",
    [
      "-hide_banner", "-loglevel", "error", "-nostdin", "-y",
      "-f", "lavfi", "-i",
      `sine=frequency=997:sample_rate=48000:duration=${durationSeconds}`,
      "-f", "lavfi", "-i",
      `sine=frequency=659:sample_rate=48000:duration=${durationSeconds}`,
      "-i", artworkSourcePath,
      "-map", "0:a:0", "-map", "1:a:0", "-map", "2:v:0",
      "-map_metadata", "-1",
      "-c:a:0", "aac", "-b:a:0", "128k",
      "-c:a:1", "libmp3lame", "-b:a:1", "192k",
      "-c:v:0", "copy",
      "-disposition:a:0", "default", "-disposition:a:1", "0",
      "-disposition:v:0", "attached_pic",
      "-metadata", "title=Within artwork stress title",
      "-metadata", "artist=Within stress artist",
      "-metadata", "album=Within stress album",
      "-metadata", "genre=Test genre",
      "-metadata", "date=2026",
      "-metadata", "track=4/9",
      "-metadata", "comment=Within stress comment",
      "-metadata:s:a:0", "language=eng",
      "-metadata:s:a:1", "language=fra",
      "-metadata:s:v:0", "title=Front cover",
      "-moov_size", String(reservedMoovBytes),
      "-fflags", "+bitexact",
      "-flags:a:0", "+bitexact", "-flags:a:1", "+bitexact",
      fixturePath,
    ],
    { cwd: projectRoot, windowsHide: true, maxBuffer: 16 * 1024 * 1024 },
  );

  await execFileAsync(
    "ffmpeg",
    [
      "-hide_banner", "-loglevel", "error", "-y", "-i", fixturePath,
      "-map", "0:v:0", "-c", "copy", extractedArtworkPath,
    ],
    { cwd: projectRoot, windowsHide: true, maxBuffer: 8 * 1024 * 1024 },
  );

  const [fixtureStat, probe, sha256, mp3PacketSha256, artworkBytes] =
    await Promise.all([
      stat(fixturePath),
      probeFile(fixturePath),
      hashFile(fixturePath),
      packetHash(fixturePath, "0:a:1"),
      readFile(extractedArtworkPath),
    ]);
  const audio = probe.streams.filter((stream) => stream.codec_type === "audio");
  const artwork = probe.streams.find(
    (stream) => stream.disposition?.attached_pic === 1,
  );
  if (
    fixtureStat.size < minimumBytes ||
    audio[0]?.codec_name !== "aac" ||
    audio[1]?.codec_name !== "mp3" ||
    artwork?.codec_name !== "png" ||
    artwork.width !== 64 ||
    artwork.height !== 64
  ) {
    throw new Error("Audio artwork stress fixture failed structural validation.");
  }

  await writeFile(
    manifestPath,
    `${JSON.stringify(
      {
        generatedBy: "scripts/generate-audio-artwork-stress-fixture.mjs",
        durationSeconds,
        reservedMoovBytes,
        paddingStrategy: "FFmpeg reserved moov/free region with streamed audio payload",
        bytes: fixtureStat.size,
        sha256,
        mp3PacketSha256,
        decodedAudioDurationSeconds: durationSeconds,
        minimumDecodedAudioPsnrDb: 60,
        artwork: {
          codec: "png",
          width: 64,
          height: 64,
          bytes: artworkBytes.byteLength,
          sha256: createHash("sha256").update(artworkBytes).digest("hex"),
        },
        expectedTags: {
          title: "Within artwork stress title",
          artist: "Within stress artist",
          album: "Within stress album",
          genre: "Test genre",
          date: "2026",
          track: "4/9",
          comment: "Within stress comment",
        },
        generationSeconds: Number(
          ((performance.now() - startedAt) / 1000).toFixed(2),
        ),
        probe,
      },
      null,
      2,
    )}\n`,
    "utf8",
  );
  process.stdout.write(
    `${fixturePath}\nGenerated ${fixtureStat.size} bytes in ${((performance.now() - startedAt) / 1000).toFixed(2)} seconds.\n`,
  );
} catch (error) {
  await rm(fixturePath, { force: true });
  if (previousManifest === null) {
    await rm(manifestPath, { force: true });
  } else {
    await writeFile(manifestPath, previousManifest, "utf8");
  }
  throw error;
} finally {
  await rm(workRoot, { recursive: true, force: true });
}

async function probeFile(filePath) {
  const { stdout } = await execFileAsync(
    "ffprobe",
    ["-v", "error", "-show_format", "-show_streams", "-of", "json", filePath],
    { cwd: projectRoot, windowsHide: true, maxBuffer: 16 * 1024 * 1024 },
  );
  return JSON.parse(stdout);
}

async function packetHash(filePath, stream) {
  const { stdout } = await execFileAsync(
    "ffmpeg",
    [
      "-v", "error", "-i", filePath, "-map", stream, "-c", "copy",
      "-f", "hash", "-hash", "sha256", "-",
    ],
    { cwd: projectRoot, windowsHide: true, maxBuffer: 8 * 1024 * 1024 },
  );
  const value = stdout.trim().match(/^SHA256=([0-9a-f]{64})$/i)?.[1];
  if (!value) throw new Error("MP3 packet hash is unavailable.");
  return value.toLowerCase();
}

async function hashFile(filePath) {
  const hash = createHash("sha256");
  for await (const chunk of createReadStream(filePath, {
    highWaterMark: 4 * 1024 * 1024,
  })) {
    hash.update(chunk);
  }
  return hash.digest("hex");
}
