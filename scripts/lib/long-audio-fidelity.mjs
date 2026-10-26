// Independent full-length decoding/inspection ONLY. No encoding, resampling,
// trimming, alignment, full-file buffers or relaxed small-fixture PSNR policy.
// SDR formula: https://ffmpeg.org/doxygen/8.0/af__asdr_8c_source.html
// The large stereo-noise fixture historically uses channel SDR>=-6.5dB;
// the separate small tone's PSNR>=60dB gate remains unchanged.
import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { execFile, spawn } from "node:child_process";
import { promisify } from "node:util";
import { setImmediate as nextTurn } from "node:timers/promises";
export const LONG_AUDIO_FIDELITY_LIMITS = Object.freeze({ chunkBytes: 262144, channels: 2, frames: 2300 * 48000,
  minimumChannelSdrDb: -6.5, decoderTimeoutMs: 180000 });
const finiteDb = value => Number.isFinite(value) ? value : value > 0 ? "infinity" : "-infinity";
export async function compareLongPcm16(left, right, { channels, expectedFrames, minimumChannelSdrDb = -6.5 } = {}) {
  const limits = LONG_AUDIO_FIDELITY_LIMITS;
  assert.ok(Number.isSafeInteger(channels) && channels >= 1 && channels <= limits.channels);
  assert.ok(Number.isSafeInteger(expectedFrames) && expectedFrames > 0 && expectedFrames <= limits.frames);
  assert.ok(Number.isFinite(minimumChannelSdrDb) && minimumChannelSdrDb >= limits.minimumChannelSdrDb);
  const hashes = [createHash("sha256"), createHash("sha256")], errors = Array(channels).fill(0n), powers = Array(channels).fill(0n);
  async function* aligned(chunks, hash) {
    let carry = null;
    for await (const chunk of chunks) {
      assert.ok(chunk instanceof Uint8Array && chunk.length > 0 && chunk.length <= limits.chunkBytes);
      const bytes = Buffer.from(chunk.buffer, chunk.byteOffset, chunk.byteLength); hash.update(bytes); let at = 0;
      if (carry !== null) { yield Buffer.from([carry, bytes[0]]); at = 1; carry = null; }
      const size = (bytes.length - at) & ~1;
      if (size) yield bytes.subarray(at, at + size);
      if (at + size < bytes.length) carry = bytes[bytes.length - 1];
    }
    assert.equal(carry, null, "Decoded PCM has a partial final sample");
  }
  const iterators = [aligned(left, hashes[0]), aligned(right, hashes[1])], current = [null, null], offsets = [0, 0];
  let samples = 0, maximumAbsoluteError = 0, blocks = 0;
  try {
    for (;;) {
      await Promise.all(iterators.map(async (iterator, index) => {
        if (!current[index] || (!current[index].done && offsets[index] === current[index].value.length)) {
          current[index] = await iterator.next(); offsets[index] = 0;
        }
      }));
      assert.equal(current[0].done, current[1].done, "Complete decoded sample counts differ; never trim or realign");
      if (current[0].done) break;
      const size = Math.min(current[0].value.length - offsets[0], current[1].value.length - offsets[1]);
      assert.ok(size > 0 && size % 2 === 0 && size <= limits.chunkBytes);
      assert.ok(samples + size / 2 <= expectedFrames * channels, "Decoded PCM exceeds the explicitly declared fixture frame count");
      const blockErrors = Array(channels).fill(0), blockPowers = Array(channels).fill(0);
      for (let at = 0; at < size; at += 2) {
        const a = current[0].value.readInt16LE(offsets[0] + at), b = current[1].value.readInt16LE(offsets[1] + at), lane = (samples + at / 2) % channels;
        const difference = a - b; blockErrors[lane] += difference * difference; blockPowers[lane] += a * a;
        maximumAbsoluteError = Math.max(maximumAbsoluteError, Math.abs(difference));
      }
      // Each <=131072-sample block's worst squared sum is <2^53. Accumulate
      // blocks as BigInt so long streams cannot silently lose integer precision.
      for (let lane = 0; lane < channels; lane++) {
        assert.ok(Number.isSafeInteger(blockErrors[lane]) && Number.isSafeInteger(blockPowers[lane]));
        errors[lane] += BigInt(blockErrors[lane]); powers[lane] += BigInt(blockPowers[lane]);
      }
      samples += size / 2; offsets[0] += size; offsets[1] += size; blocks++;
      if (blocks % 16 === 0) await nextTurn();
    }
    assert.equal(samples, expectedFrames * channels, "Full PCM frame count must match the complete fixture, not a sampled segment");
    const squared = errors.reduce((sum, value) => sum + value, 0n);
    const psnr = squared === 0n ? Infinity : 10 * Math.log10(32768 ** 2 * samples / Number(squared));
    const sdr = errors.map((error, lane) => error === 0n ? Infinity : 10 * Math.log10(Number(powers[lane]) / Number(error)));
    const result = { policy: "complete-fixed-large-fixture-existing-channel-SDR-floor", canonicalPcm: "signed16-little-endian; source rate/channels; no resampling/trimming/alignment",
      frames: expectedFrames, channels, samples, exact: squared === 0n, squaredError: String(squared), channelSquaredError: errors.map(String),
      channelSourcePower: powers.map(String), maximumAbsoluteError, psnrDb: finiteDb(psnr),
      psnrIsReportedNotSubstitutedForChannelSdr: true, channelSdrDb: sdr.map(finiteDb), minimumChannelSdrDb,
      sourceSha256: hashes[0].digest("hex"), outputSha256: hashes[1].digest("hex"),
      maximumInputChunkBytes: limits.chunkBytes, maximumOutstandingChunksPerStream: 1, fullOutputBufferAllocated: false };
    if (sdr.some(value => value < minimumChannelSdrDb)) throw Object.assign(new Error("Full-length channel SDR is below the unchanged large-fixture floor"), { fidelity: result });
    return result;
  } finally { await Promise.allSettled(iterators.map(iterator => iterator.return())); }
}
export async function compareNativeLongAudioPcm(source, output, { cwd, env = process.env, ...policy } = {}) {
  const controller = new AbortController(), children = [], timer = setTimeout(() => controller.abort(), LONG_AUDIO_FIDELITY_LIMITS.decoderTimeoutMs);
  let decodedResult;
  const decode = file => {
    const child = spawn("ffmpeg", ["-v", "error", "-xerror", "-nostdin", "-cpuflags", "0", "-i", file,
      "-map", "0:a:0", "-c:a", "pcm_s16le", "-f", "s16le", "pipe:1"],
    { cwd, env, windowsHide: true, signal: controller.signal, stdio: ["ignore", "pipe", "pipe"] });
    let stderr = ""; child.stderr.on("data", chunk => { stderr = (stderr + chunk.toString()).slice(-8192); });
    const closed = new Promise((resolve, reject) => { child.once("error", reject); child.once("close", code => code === 0 ? resolve() : reject(new Error("Independent long audio decode failed: " + stderr))); });
    closed.catch(() => {}); children.push({ child, closed }); return child.stdout;
  };
  try {
    const result = await compareLongPcm16(decode(source), decode(output), policy); await Promise.all(children.map(value => value.closed));
    decodedResult = result;
    // Retain the actual legacy float-ASDR check as well; the stricter complete
    // unaligned integer comparison above does NOT replace or weaken that gate.
    const { stderr } = await promisify(execFile)("ffmpeg", ["-hide_banner", "-nostdin", "-nostats", "-cpuflags", "0", "-i", source, "-i", output,
      "-filter_complex", "[0:a:0]aresample=async=1:first_pts=0,aformat=sample_fmts=fltp[source];[1:a:0]aresample=async=1:first_pts=0,aformat=sample_fmts=fltp[converted];[source][converted]asdr[quality]",
      "-map", "[quality]", "-f", "null", "-"],
    { cwd, env, windowsHide: true, timeout: LONG_AUDIO_FIDELITY_LIMITS.decoderTimeoutMs, maxBuffer: 131072 });
    const values = [...stderr.matchAll(/SDR ch(\d+): ([^\s]+) dB/g)].map(match => ({ channel: Number(match[1]), value: match[2] === "inf" ? Infinity : Number(match[2]) }));
    assert.equal(values.length, policy.channels); values.forEach((value, channel) => {
      assert.equal(value.channel, channel); assert.ok(value.value >= (policy.minimumChannelSdrDb ?? -6.5), "Unchanged legacy float-ASDR gate failed");
    });
    return { ...result, referenceDecoderCpu: "scalar-no-SIMD", legacyFloatAsdr: { channelSdrDb: values.map(value => finiteDb(value.value)),
      minimumChannelSdrDb: policy.minimumChannelSdrDb ?? -6.5, exactHistoricalFilterRetained: true,
      doesNotReplaceStrictUnalignedCompletePcm: true } };
  }
  catch (error) {
    if (decodedResult && !error.fidelity) error.fidelity = { ...decodedResult, legacyFloatAsdr: { passed: false, failure: String(error).slice(0, 512) } };
    if (error.fidelity) { await Promise.all(children.map(value => value.closed)); error.fullIndependentDecodePassed = true; }
    throw error;
  }
  finally {
    clearTimeout(timer); // Only direct owned launch handles, never names/arbitrary PIDs.
    if (children.some(({ child }) => child.exitCode === null && child.signalCode === null)) controller.abort();
    await Promise.allSettled(children.map(value => value.closed));
  }
}
