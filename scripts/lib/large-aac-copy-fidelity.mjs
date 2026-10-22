// Bounded independent AAC-LC validator for long generated fixtures. Native
// tools inspect/validate ONLY; conversions still run in the production browser.
import assert from "node:assert/strict";
import { execFile, spawn } from "node:child_process";
import { realpath, lstat } from "node:fs/promises";
import path from "node:path";
import { promisify } from "node:util";
import { boundedNativeLines, parseCompactAacPacket } from "./bounded-native-lines.mjs";
import { createStreamingPcmTrimDigest } from "./streaming-pcm-trim-digest.mjs";
import { readLargeMp4FirstSample } from "./large-mp4-first-sample-duration.mjs";
const root = path.resolve(import.meta.dirname, "../.."), tolerance = 0.001 + 1e-12;
function leading(packet, stream, role) {
  const rate = Number(stream.sample_rate), header = stream.initial_padding;
  assert.ok(Number.isSafeInteger(header) && header >= 0 && header <= rate);
  assert.ok(packet.skip <= rate && packet.tail === 0);
  if (packet.explicitTrim && header > 0) assert.equal(packet.skip, header);
  if (!packet.explicitTrim && header > 0) {
    assert.equal(role, "source", "Output trim must be explicitly observed, not inferred");
    assert.ok(packet.pts === 0 || Math.abs(packet.pts + header / rate) <= tolerance);
    return header;
  }
  return packet.skip;
}
export async function compareStreamingAacPackets(beforeIterable, afterIterable, { beforeStream, afterStream, firstDuration }) {
  const before = beforeIterable[Symbol.asyncIterator](), after = afterIterable[Symbol.asyncIterator]();
  const rate = Number(beforeStream.sample_rate); assert.equal(Number(afterStream.sample_rate), rate);
  assert.equal(beforeStream.channels, afterStream.channels); let count = 0, firstBefore, firstAfter, lastBefore, lastAfter;
  let maxPts = 0, maxDts = 0, maxDuration = 0, currentBefore, currentAfter;
  try {
    for (;;) {
      const [a, b] = await Promise.all([before.next(), after.next()]); assert.equal(a.done, b.done, "AAC packet count changed"); if (a.done) break;
      const x = a.value, y = b.value; currentBefore = x; currentAfter = y;
      assert.ok(++count <= 10000000); assert.equal(x.streamIndex, beforeStream.index); assert.equal(y.streamIndex, afterStream.index);
      assert.equal(y.hash, x.hash, "AAC packet bytes/order changed");
      if (count === 1) { firstBefore = x; firstAfter = y;
        if (y.duration === null) { assert.equal(firstDuration.rawPacketHash, y.hash); y.duration = firstDuration.seconds; }
      } else { assert.equal(x.skip, 0); assert.equal(y.skip, 0); assert.equal(lastBefore.tail, 0); assert.equal(lastAfter.tail, 0); }
      assert.ok(Number.isFinite(x.duration) && x.duration > 0 && Number.isFinite(y.duration) && y.duration > 0, "Packet duration unavailable");
      const pts = Math.abs(y.pts - x.pts), dts = Math.abs(y.dts - x.dts), duration = Math.abs(y.duration - x.duration);
      assert.ok(pts <= tolerance && dts <= tolerance && duration <= tolerance, "AAC packet clock changed");
      maxPts = Math.max(maxPts, pts); maxDts = Math.max(maxDts, dts); maxDuration = Math.max(maxDuration, duration);
      lastBefore = x; lastAfter = y;
    }
  } catch (error) {
    Object.defineProperty(error, "aacPacketEdges", { value: { comparedPackets: count, firstBefore, firstAfter, lastBefore, lastAfter, currentBefore, currentAfter } }); throw error;
  } finally { await Promise.allSettled([before.return?.(), after.return?.()]); }
  assert.ok(count >= 2); const start = leading(firstBefore, beforeStream, "source"), outputStart = leading(firstAfter, afterStream, "output");
  assert.equal(outputStart, start); assert.equal(lastBefore.tail, lastAfter.tail); assert.ok(lastBefore.tail <= rate);
  assert.ok(Math.abs(firstBefore.pts + start / rate - firstAfter.pts - outputStart / rate) <= tolerance);
  return { packetCount: count, leadingSamples: start, trailingSamples: lastBefore.tail,
    maximumPtsErrorSeconds: maxPts, maximumDtsErrorSeconds: maxDts, maximumDurationErrorSeconds: maxDuration,
    packetBytesIdentical: true, maximumRetainedPackets: 8, rate, channels: beforeStream.channels };
}
async function checked(file) {
  const resolved = await realpath(file), work = await realpath(path.join(root, "work")), relative = path.relative(work, resolved);
  assert.ok(relative && !relative.startsWith("..") && !path.isAbsolute(relative)); const info = await lstat(resolved);
  assert.ok(info.isFile() && !info.isSymbolicLink() && info.size > 0 && info.size <= 64 * 1024 ** 3); return resolved;
}
function packets(file, raw, env) {
  const lines = boundedNativeLines("ffprobe", ["-v", "error", ...(raw ? ["-ignore_editlist", "1"] : []), "-select_streams", "a:0",
    "-show_packets", "-show_entries", "packet=stream_index,pts_time,dts_time,dts,duration_time,data_hash:packet_side_data=side_data_type,skip_samples,discard_padding",
    "-show_data_hash", "sha256", "-of", "compact", file], { cwd: root, env });
  return (async function* () { for await (const line of lines) yield parseCompactAacPacket(line); })();
}
async function pcm(file, raw, metadata, env) {
  const digest = createStreamingPcmTrimDigest({ channels: metadata.channels, expectedSamples: metadata.packetCount * 1024,
    leadingSamples: metadata.leadingSamples, trailingSamples: metadata.trailingSamples });
  const controller = new AbortController(); let stderr = "";
  const child = spawn("ffmpeg", ["-v", "error", ...(raw ? ["-ignore_editlist", "1"] : []), "-flags2", "+skip_manual", "-i", file,
    "-map", "0:a:0", "-c:a", "pcm_s16le", "-f", "s16le", "pipe:1"], { cwd: root, env, windowsHide: true, signal: controller.signal, stdio: ["ignore", "pipe", "pipe"] });
  const exit = new Promise((resolve, reject) => { child.once("error", reject); child.once("close", resolve); }); exit.catch(() => {});
  child.stderr.on("data", bytes => { stderr = (stderr + bytes.toString()).slice(-8192); }); const timer = setTimeout(() => controller.abort(), 600000);
  try { for await (const chunk of child.stdout) digest.update(chunk); assert.equal(await exit, 0, stderr); return digest.finish(); }
  finally { clearTimeout(timer); if (child.exitCode === null && child.signalCode === null) controller.abort(); await exit.catch(() => {}); }
}
export async function validateLargeCopiedAac(sourceFile, outputFile, { env = process.env } = {}) {
  const source = await checked(sourceFile), output = await checked(outputFile);
  const probe = async file => JSON.parse((await promisify(execFile)("ffprobe", ["-v", "error", "-select_streams", "a:0", "-show_streams", "-show_format", "-of", "json", file],
    { cwd: root, env, windowsHide: true, timeout: 30000, maxBuffer: 65536 })).stdout);
  const [a, b] = await Promise.all([probe(source), probe(output)]);
  assert.equal(a.format.format_name, "matroska,webm"); assert.equal(b.format.format_name, "mov,mp4,m4a,3gp,3g2,mj2");
  for (const info of [a, b]) { assert.equal(info.streams.length, 1); assert.equal(info.streams[0].codec_name, "aac"); assert.equal(info.streams[0].profile, "LC"); }
  const rate = Number(b.streams[0].sample_rate); assert.ok(Number.isSafeInteger(rate) && rate >= 8000 && rate <= 192000);
  assert.equal(b.streams[0].time_base, "1/" + rate); assert.match(b.streams[0].id, /^0x[0-9a-f]+$/i);
  let rawFirst; for await (const packet of packets(output, true, env)) { rawFirst = packet; break; } assert.ok(rawFirst);
  const serialized = await readLargeMp4FirstSample(output, { trackId: Number(b.streams[0].id), timeScale: rate, firstDtsTicks: rawFirst.dtsTicks });
  assert.equal(serialized.sampleDurationTicks, 1024, "Actual serialized AAC-LC frame duration differs");
  const comparison = await compareStreamingAacPackets(packets(source, false, env), packets(output, false, env), {
    beforeStream: a.streams[0], afterStream: b.streams[0], firstDuration: { seconds: serialized.sampleDurationTicks / rate, rawPacketHash: rawFirst.hash } });
  const beforePcm = await pcm(source, false, comparison, env), afterPcm = await pcm(output, true, comparison, env);
  const { maximumChunkBytes: beforeChunk, ...beforeContent } = beforePcm;
  const { maximumChunkBytes: afterChunk, ...afterContent } = afterPcm;
  assert.deepEqual(afterContent, beforeContent, "Raw/audible PCM content or lengths changed");
  return { status: "passed-bounded-stream-AAC-LC", ...comparison, rawSamplesPerChannel: beforePcm.rawSamplesPerChannel,
    audibleSamplesPerChannel: beforePcm.audibleSamplesPerChannel, rawPcmSha256: beforePcm.rawSha256, audiblePcmSha256: beforePcm.audibleSha256,
    retainedPcmBytes: 0, noOffsetSearchOrContentTolerance: true, serializedFirstDuration: serialized, maximumPcmChunkBytes: Math.max(beforeChunk, afterChunk) };
}
