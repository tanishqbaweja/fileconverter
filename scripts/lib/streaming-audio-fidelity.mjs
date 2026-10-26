// Independent decoding/validation only. Never encode a browser destination.
import assert from "node:assert/strict";
import { spawn } from "node:child_process";
import { createHash } from "node:crypto";
import { setImmediate as nextTurn } from "node:timers/promises";
export async function comparePcm16(left, right, { lossless = false, minimumPsnrDb = 60, maximumSamples = 1048576, diagnoseGain = false } = {}) {
  assert.equal(typeof diagnoseGain, "boolean");
  assert.ok(Number.isFinite(minimumPsnrDb) && minimumPsnrDb >= 60); assert.ok(Number.isSafeInteger(maximumSamples) && maximumSamples > 0 && maximumSamples <= 1048576);
  const hashes = [createHash("sha256"), createHash("sha256")];
  async function* samples(chunks, hash) {
    let carry = null;
    for await (const bytes of chunks) {
      assert.ok(bytes instanceof Uint8Array && bytes.length <= 262144); hash.update(bytes); let at = 0;
      if (carry !== null && bytes.length) { yield (carry | bytes[0] << 8) << 16 >> 16; carry = null; at = 1; }
      for (; at + 1 < bytes.length; at += 2) yield (bytes[at] | bytes[at + 1] << 8) << 16 >> 16;
      if (at < bytes.length) carry = bytes[at];
    }
    assert.equal(carry, null, "PCM ended with a partial sample");
  }
  const a = samples(left, hashes[0]), b = samples(right, hashes[1]); let count = 0, squaredError = 0, maximumAbsoluteError = 0;
  let sourcePower = 0, outputPower = 0, crossProduct = 0;
  try {
    for (;;) {
      const [x, y] = await Promise.all([a.next(), b.next()]); assert.equal(x.done, y.done, "Decoded sample counts differ; do not trim either side");
      if (x.done) break; assert.ok(++count <= maximumSamples, "Small fidelity diagnostic sample bound exceeded");
      const difference = x.value - y.value; squaredError += difference * difference; maximumAbsoluteError = Math.max(maximumAbsoluteError, Math.abs(difference));
      if (diagnoseGain) { sourcePower += x.value * x.value; outputPower += y.value * y.value; crossProduct += x.value * y.value; }
      if (count % 8192 === 0) await nextTurn();
    }
    assert.ok(count > 0, "Empty audio is not fidelity evidence");
    const psnr = squaredError === 0 ? Infinity : 10 * Math.log10(32768 ** 2 * count / squaredError);
    const result = { canonicalPcm: "signed16-little-endian, source rate/channels, no resampling/alignment/trimming", samples: count,
      exact: squaredError === 0, maximumAbsoluteError, squaredError, psnrDb: Number.isFinite(psnr) ? psnr : "infinity",
      sourceSha256: hashes[0].digest("hex"), outputSha256: hashes[1].digest("hex"), minimumPsnrDb, losslessRequired: lossless,
      maximumInputChunkBytes: 262144, maximumOutstandingChunksPerStream: 1 };
    if (diagnoseGain) {
      // Fixed <=1,048,576 signed16 samples keep every integer sum below2^53.
      for (const sum of [sourcePower, outputPower, crossProduct, squaredError]) assert.ok(Number.isSafeInteger(sum));
      assert.equal(sourcePower + outputPower - 2 * crossProduct, squaredError);
      const gain = sourcePower > 0 ? crossProduct / sourcePower : null;
      result.amplitudeDiagnostic = { sourcePower, outputPower, crossProduct, rawSquaredError: squaredError,
        leastSquaresGain: gain, gainDb: gain !== null && gain !== 0 ? 20 * Math.log10(Math.abs(gain)) : null,
        rmsRatio: sourcePower > 0 ? Math.sqrt(outputPower / sourcePower) : null,
        correlation: sourcePower > 0 && outputPower > 0 ? crossProduct / Math.sqrt(sourcePower * outputPower) : null,
        leastSquaresResidualSquaredError: gain !== null ? Math.max(0, outputPower - gain * crossProduct) : null,
        gainComponentSquaredError: gain !== null ? (gain - 1) ** 2 * sourcePower : null,
        acceptanceUsesUnmodifiedSamples: true, audioNormalized: false, alignmentApplied: false,
        thresholdChanged: false, diagnosticOnly: true };
    }
    if (psnr < minimumPsnrDb) throw Object.assign(new Error(`Audio PSNR${psnr}dB below${minimumPsnrDb}dB`), { fidelity: result });
    if (lossless && !result.exact) throw Object.assign(new Error("Lossless destination changed canonical PCM samples"), { fidelity: result });
    return result;
  } finally { await Promise.allSettled([a.return(), b.return()]); }
}
export async function compareNativeAudioPcm(source, output, options = {}) {
  const { cwd, env = process.env, ...policy } = options, children = [], controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), 30000);
  const decode = file => {
    // Match the scalar FFmpeg decoder/resampler arithmetic used by this Wasm
    // build. The recorded native reference probe proves exact retained FLAC PCM
    // hashes; do not relax equality to hide platform SIMD rounding differences.
    const child = spawn("ffmpeg", ["-v", "error", "-xerror", "-nostdin", "-cpuflags", "0", "-i", file, "-map", "0:a:0", "-c:a", "pcm_s16le", "-f", "s16le", "pipe:1"],
      { cwd, env, windowsHide: true, signal: controller.signal, stdio: ["ignore", "pipe", "pipe"] });
    let stderr = ""; child.stderr.on("data", b => { stderr = (stderr + b.toString()).slice(-8192); });
    const closed = new Promise((resolve, reject) => { child.once("error", reject); child.once("close", code => code === 0 ? resolve() : reject(new Error("Independent audio decoder failed: " + stderr))); });
    closed.catch(() => {}); children.push({ child, closed }); return child.stdout;
  };
  try { const result = await comparePcm16(decode(source), decode(output), policy); await Promise.all(children.map(c => c.closed)); return { ...result, referenceDecoderCpu: "scalar-no-SIMD" }; }
  catch (error) { if (error.fidelity) { await Promise.all(children.map(c => c.closed)); error.fullIndependentDecodePassed = true; error.fidelity.referenceDecoderCpu = "scalar-no-SIMD"; } throw error; }
  finally { clearTimeout(timer); for (const { child } of children) if (child.exitCode === null && child.signalCode === null) controller.abort(); await Promise.allSettled(children.map(c => c.closed)); }
}
