// Deterministic INPUT for interruption coverage only. Not a replacement for the
// full147.96MB repeat fixture and never native conversion of a browser output.
import assert from "node:assert/strict";
import { execFile } from "node:child_process";
import { createReadStream } from "node:fs";
import { createHash } from "node:crypto";
import { lstat, realpath } from "node:fs/promises";
import path from "node:path";
import { promisify } from "node:util";
import { AUDIO_METADATA_TAGS } from "./audio-metadata-fidelity-fixture.mjs";
export const VORBIS_IO_FIXTURE_POLICY = Object.freeze({ durationSeconds: 180, sampleRate: 48000, channels: 2,
  frames: 8640000, minimumBytesExclusive: 8 * 1048576, maximumBytes: 16 * 1048576 });
export async function createVorbisIoFixture(directory, env) {
  const root = path.resolve(import.meta.dirname, "../.."), relative = path.relative(path.join(root, "work"), directory);
  assert.ok(relative && !relative.startsWith("..") && !path.isAbsolute(relative)); assert.equal(await realpath(directory), directory);
  const info = await lstat(directory); assert.ok(info.isDirectory() && !info.isSymbolicLink());
  const file = path.join(directory, "source-cancel.opus"); await assert.rejects(lstat(file), { code: "ENOENT" });
  await promisify(execFile)("ffmpeg", ["-hide_banner", "-loglevel", "error", "-nostdin", "-n",
    "-f", "lavfi", "-i", "anoisesrc=color=white:amplitude=0.25:sample_rate=48000:seed=424242",
    "-f", "lavfi", "-i", "anoisesrc=color=white:amplitude=0.25:sample_rate=48000:seed=242424",
    "-filter_complex", "[0:a][1:a]amerge=inputs=2[a]", "-map", "[a]", "-t", "180",
    "-c:a", "libopus", "-b:a", "512k", "-vbr", "off", "-application", "audio",
    ...Object.entries(AUDIO_METADATA_TAGS).flatMap(([key, value]) => ["-metadata", key + "=" + value]),
    "-fflags", "+bitexact", "-flags:a", "+bitexact", file],
  { cwd: root, env, windowsHide: true, timeout: 30000, maxBuffer: 131072 });
  const before = await lstat(file, { bigint: true }); assert.ok(before.isFile() && !before.isSymbolicLink());
  assert.ok(Number(before.size) > VORBIS_IO_FIXTURE_POLICY.minimumBytesExclusive && Number(before.size) <= VORBIS_IO_FIXTURE_POLICY.maximumBytes);
  const hash = createHash("sha256"); for await (const chunk of createReadStream(file, { highWaterMark: 1048576 })) hash.update(chunk);
  const after = await lstat(file, { bigint: true }); for (const key of ["dev", "ino", "size", "mtimeNs"]) assert.equal(after[key], before[key]);
  return { file, bytes: Number(before.size), sha256: hash.digest("hex"), durationSeconds: 180, frames: 8640000, channels: 2,
    inputOnly: true, qualificationScope: "new midstream cancellation input crossing8MiB BYOB threshold; not full-size stress acceptance" };
}
