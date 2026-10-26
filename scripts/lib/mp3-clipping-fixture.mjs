// Genuine high-amplitude INPUT generation only. Owned caller removes all files.
import assert from "node:assert/strict";
import { execFile } from "node:child_process";
import { createHash } from "node:crypto";
import { lstat, readFile, realpath, writeFile } from "node:fs/promises";
import path from "node:path";
import { promisify } from "node:util";
import { AUDIO_METADATA_TAGS } from "./audio-metadata-fidelity-fixture.mjs";
import { appendFlacArtworkFixture, audioArtworkFixturePicture } from "./audio-artwork-validation.mjs";
export const MP3_CLIPPING_CASES = Object.freeze([1, 2].flatMap(channels => [0.99, 0.999].map(amplitude => Object.freeze({
  source: "flac", destination: "mp3", artwork: "png", gainRepair: true, channels, amplitude,
  highAmplitude: (channels === 1 ? "mono" : "stereo") + "-" + String(amplitude).replace(".", ""),
}))));
export async function createMp3ClippingFixtures(directory, env, png) {
  const root = path.resolve(import.meta.dirname, "../.."), relative = path.relative(path.join(root, "work"), directory);
  assert.ok(relative && !relative.startsWith("..") && !path.isAbsolute(relative)); assert.equal(await realpath(directory), directory);
  const info = await lstat(directory); assert.ok(info.isDirectory() && !info.isSymbolicLink());
  assert.ok(Buffer.isBuffer(png) && png.length > 8 && png.length <= 65536);
  const picture = audioArtworkFixturePicture(png, "png", { pictureType: 3, description: "表紙 — Front cover" }), fixtures = {};
  for (const policy of MP3_CLIPPING_CASES) {
    const baseFile = path.join(directory, "source-fullscale-base-" + policy.highAmplitude + ".flac");
    const file = path.join(directory, "source-fullscale-" + policy.highAmplitude + ".flac");
    await assert.rejects(lstat(baseFile), { code: "ENOENT" }); await assert.rejects(lstat(file), { code: "ENOENT" });
    const signal = `${policy.amplitude}*sin(2*PI*997*t)` + (policy.channels === 2 ? `|${policy.amplitude}*sin(2*PI*1433*t)` : "");
    await promisify(execFile)("ffmpeg", ["-v", "error", "-nostdin", "-n", "-f", "lavfi", "-i", `aevalsrc=${signal}:s=48000:d=2`,
      "-c:a", "flac", "-sample_fmt", "s16", "-threads", "1", ...Object.entries(AUDIO_METADATA_TAGS).flatMap(([key, value]) => ["-metadata", key + "=" + value]),
      "-fflags", "+bitexact", "-flags:a", "+bitexact", baseFile], { cwd: root, env, windowsHide: true, timeout: 30000, maxBuffer: 131072 });
    const baseInfo = await lstat(baseFile); assert.ok(baseInfo.isFile() && !baseInfo.isSymbolicLink() && baseInfo.size > 0 && baseInfo.size < 1048576);
    const generated = appendFlacArtworkFixture(await readFile(baseFile), picture); await writeFile(file, generated, { flag: "wx" });
    fixtures[policy.highAmplitude] = { file, baseFile, bytes: generated.length, sha256: createHash("sha256").update(generated).digest("hex"),
      channels: policy.channels, amplitude: policy.amplitude, frames: 96000, durationSeconds: 2, sampleRate: 48000, inputOnly: true };
  }
  return fixtures;
}
