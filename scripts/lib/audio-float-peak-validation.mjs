// Independent decode/inspection ONLY. Float output reveals overshoot that an
// s16 decode can hide by saturating. Never resample, trim, clamp or normalize.
import assert from "node:assert/strict";
import { spawn } from "node:child_process";
import { createHash } from "node:crypto";
import { lstat } from "node:fs/promises";
export const FLOAT_PEAK_LIMITS = Object.freeze({ chunkBytes: 65536, samples: 1048576, channels: 2 });
export async function inspectFloat32Peaks(chunks, { channels, expectedFrames } = {}) {
  assert.ok(Number.isSafeInteger(channels) && channels >= 1 && channels <= FLOAT_PEAK_LIMITS.channels);
  assert.ok(Number.isSafeInteger(expectedFrames) && expectedFrames > 0 && expectedFrames * channels <= FLOAT_PEAK_LIMITS.samples);
  const expectedSamples = expectedFrames * channels, carry = Buffer.alloc(4), hash = createHash("sha256");
  const perChannel = Array.from({ length: channels }, () => ({ samples: 0, minimum: Infinity, maximum: -Infinity,
    peakAbsolute: 0, atFullScale: 0, beyondFullScale: 0 }));
  let used = 0, samples = 0, maximumInputChunkBytes = 0;
  const sample = value => {
    assert.ok(Number.isFinite(value), "Non-finite decoded float sample"); assert.ok(samples < expectedSamples, "Decoded sample count exceeds declared exact scope");
    const channel = perChannel[samples++ % channels], absolute = Math.abs(value);
    channel.samples++; channel.minimum = Math.min(channel.minimum, value); channel.maximum = Math.max(channel.maximum, value);
    channel.peakAbsolute = Math.max(channel.peakAbsolute, absolute);
    if (absolute === 1) channel.atFullScale++; if (absolute > 1) channel.beyondFullScale++;
  };
  for await (const bytes of chunks) {
    assert.ok(bytes instanceof Uint8Array && bytes.length <= FLOAT_PEAK_LIMITS.chunkBytes);
    maximumInputChunkBytes = Math.max(maximumInputChunkBytes, bytes.length); hash.update(bytes);
    const view = Buffer.from(bytes.buffer, bytes.byteOffset, bytes.byteLength); let at = 0;
    if (used) { while (used < 4 && at < view.length) carry[used++] = view[at++];
      if (used === 4) { sample(carry.readFloatLE(0)); used = 0; } }
    while (at + 4 <= view.length) { sample(view.readFloatLE(at)); at += 4; }
    while (at < view.length) carry[used++] = view[at++];
  }
  assert.equal(used, 0, "Decoded float ended with partial sample"); assert.equal(samples, expectedSamples, "Decoded sample count mismatch; no truncation/trimming allowed");
  return { canonicalPcm: "f32le, original rate/channels, no gain/resampling/trimming/clamping", samples, frames: expectedFrames, channels,
    perChannel, peakAbsolute: Math.max(...perChannel.map(value => value.peakAbsolute)),
    atFullScale: perChannel.reduce((total, value) => total + value.atFullScale, 0),
    beyondFullScale: perChannel.reduce((total, value) => total + value.beyondFullScale, 0),
    sha256: hash.digest("hex"), maximumInputChunkBytes, maximumHeldChunks: 1, carryBufferBytes: 4,
    fullDecodedBufferAllocated: false, allSamplesInspected: true };
}
export async function decodeNativeFloatPeaks(file, { cwd, env = process.env, channels, expectedFrames } = {}) {
  const before = await lstat(file, { bigint: true }); assert.ok(before.isFile() && !before.isSymbolicLink());
  const controller = new AbortController(), timer = setTimeout(() => controller.abort(), 30000);
  const child = spawn("ffmpeg", ["-v", "error", "-xerror", "-nostdin", "-cpuflags", "0", "-i", file,
    "-map", "0:a:0", "-c:a", "pcm_f32le", "-f", "f32le", "pipe:1"],
  { cwd, env, windowsHide: true, signal: controller.signal, stdio: ["ignore", "pipe", "pipe"] });
  let stderr = ""; child.stderr.on("data", bytes => { stderr = (stderr + bytes.toString()).slice(-8192); });
  const closed = new Promise((resolve, reject) => { child.once("error", reject); child.once("close", code =>
    code === 0 ? resolve() : reject(new Error("Independent float decoder failed: " + stderr))); }); closed.catch(() => {});
  try {
    const result = await inspectFloat32Peaks(child.stdout, { channels, expectedFrames }); await closed;
    const after = await lstat(file, { bigint: true }); for (const key of ["dev", "ino", "size", "mtimeNs"]) assert.equal(after[key], before[key]);
    return { ...result, referenceDecoderCpu: "scalar-no-SIMD", independentDecodeOnly: true, nativeConversionUsed: false };
  } finally { clearTimeout(timer); if (child.exitCode === null && child.signalCode === null) controller.abort(); await Promise.allSettled([closed]); }
}
export function validateNearFullScalePeaks(source, output) {
  for (const result of [source, output]) {
    assert.ok(result?.allSamplesInspected); assert.ok(Number.isSafeInteger(result.channels) && result.channels >= 1 && result.channels <= 2);
    assert.ok(Number.isSafeInteger(result.frames) && result.frames > 0 && result.samples === result.frames * result.channels);
    assert.ok(Array.isArray(result.perChannel) && result.perChannel.length === result.channels);
    for (const channel of result.perChannel) {
      assert.equal(channel.samples, result.frames); assert.ok(Number.isFinite(channel.minimum) && Number.isFinite(channel.maximum));
      assert.ok(channel.minimum <= channel.maximum); assert.equal(channel.peakAbsolute, Math.max(Math.abs(channel.minimum), Math.abs(channel.maximum)));
      assert.ok(Number.isSafeInteger(channel.atFullScale) && channel.atFullScale >= 0 && Number.isSafeInteger(channel.beyondFullScale) && channel.beyondFullScale >= 0);
    }
  }
  assert.equal(output.channels, source.channels); assert.equal(output.samples, source.samples); assert.equal(output.frames, source.frames);
  const sourceNearFullScaleAndNotClipped = source.perChannel.every(value => value.peakAbsolute >= 0.98 && value.peakAbsolute < 1 && value.atFullScale === 0 && value.beyondFullScale === 0);
  const noDecodedOutputSaturationOrOvershoot = output.perChannel.every(value => value.peakAbsolute < 1 && value.atFullScale === 0 && value.beyondFullScale === 0);
  return { status: sourceNearFullScaleAndNotClipped && noDecodedOutputSaturationOrOvershoot ? "passed" : "failed",
    sourceNearFullScaleAndNotClipped, noDecodedOutputSaturationOrOvershoot, thresholdAbsolute: 1,
    toleranceAdded: false, audioNormalized: false, sampleTrimmingUsed: false,
    scope: "these finite near-full-scale fixtures only, not every waveform or stress acceptance", publicAcceptance: false };
}
