// Generate only a deterministic INPUT. Browser pipeline alone creates destinations.
import assert from "node:assert/strict";
import { execFile } from "node:child_process";
import { createReadStream } from "node:fs";
import { lstat, realpath } from "node:fs/promises";
import { createHash } from "node:crypto";
import path from "node:path";
import { promisify } from "node:util";
const execute = promisify(execFile);
export const VORBIS_LARGE_FIXTURE = Object.freeze({ bytes: 147964541, sha256: "ec870c32bae0e5c41eb449f3d24fbc470636dfa804431e20a9eb7aef6ad9ff58",
  durationSeconds: 2300, sampleRate: 48000, channels: 2, frames: 110400000, minimumChannelSdrDb: -6.5 });
export async function createVorbisLargeFixture(directory, env) {
  const root = path.resolve(import.meta.dirname, "../.."), relative = path.relative(path.join(root, "work"), directory);
  assert.ok(relative && !relative.startsWith("..") && !path.isAbsolute(relative)); assert.equal(await realpath(directory), directory);
  const info = await lstat(directory); assert.ok(info.isDirectory() && !info.isSymbolicLink());
  const file = path.join(directory, "source-large-stereo.opus"); await assert.rejects(lstat(file), { code: "ENOENT" });
  await execute("ffmpeg", ["-hide_banner", "-loglevel", "error", "-nostdin", "-n",
    "-f", "lavfi", "-i", "anoisesrc=color=white:amplitude=0.25:sample_rate=48000:seed=424242",
    "-f", "lavfi", "-i", "anoisesrc=color=white:amplitude=0.25:sample_rate=48000:seed=242424",
    "-filter_complex", "[0:a][1:a]amerge=inputs=2[a]", "-map", "[a]", "-t", "2300",
    "-c:a", "libopus", "-b:a", "512k", "-vbr", "off", "-application", "audio",
    "-metadata", "title=Within deterministic FLAC input stress fixture", "-metadata:s:a:0", "language=eng", "-fflags", "+bitexact", "-flags:a", "+bitexact", file],
  { cwd: root, env, windowsHide: true, timeout: 180000, maxBuffer: 131072 });
  const before = await lstat(file, { bigint: true }); assert.ok(before.isFile() && !before.isSymbolicLink()); assert.equal(Number(before.size), VORBIS_LARGE_FIXTURE.bytes);
  const hash = createHash("sha256"); for await (const chunk of createReadStream(file, { highWaterMark: 1048576 })) hash.update(chunk);
  const sha256 = hash.digest("hex"); assert.equal(sha256, VORBIS_LARGE_FIXTURE.sha256, "Use the exact historical full-size fixture, not a smaller/substitute input");
  const after = await lstat(file, { bigint: true }); for (const key of ["dev", "ino", "size", "mtimeNs"]) assert.equal(after[key], before[key]);
  return { file, ...VORBIS_LARGE_FIXTURE, expectedTags: { encoder: "Lavc libopus", language: "eng", title: "Within deterministic FLAC input stress fixture" },
    recipe: "same deterministic stereo-noise512k Opus input as retained2026-08-13 stress; native generator not converter",
    qualityPolicy: "existing large-input channel SDR floor-6.5dB; separate small-tone PSNR60dB unchanged; full PCM compared without resampling/alignment" };
}
