// Independent SMALL AAC-LC fixture validator. Exact PCM, packet bytes, clocks
// and declared trim are all required; no offset search or tolerance on content.
import assert from "node:assert/strict";
import { execFile, spawn } from "node:child_process";
import { lstat, realpath } from "node:fs/promises";
import path from "node:path";
import { promisify } from "node:util";
import { createPcmPrefixDiagnostic } from "./pcm-prefix-diagnostic.mjs";
import { validateCopiedAudioTiming } from "./copied-audio-timing.mjs";
const root = path.resolve(import.meta.dirname, "../.."), MAX_FILE = 2 * 1024 ** 2;
const integer = (value, label, max) => { assert.ok(Number.isSafeInteger(value) && value >= 0 && value <= max, label + " unavailable/outside fixture bounds"); return value; };
function skipEntry(packet, rate) {
  const entries = (packet.side_data_list ?? []).filter(row => row.side_data_type === "Skip Samples");
  assert.ok(entries.length <= 1, "Duplicate trim metadata");
  if (!entries.length) return null;
  return { skip: integer(entries[0].skip_samples, "skip_samples", rate), tail: integer(entries[0].discard_padding, "discard_padding", rate) };
}
export function readSmallAacTrim(probe, role) {
  assert.ok(role === "source" || role === "output");
  assert.equal(probe.format.format_name, role === "source" ? "matroska,webm" : "mov,mp4,m4a,3gp,3g2,mj2");
  assert.equal(probe.streams.length, 1); const stream = probe.streams[0], packets = probe.packets;
  assert.equal(stream.codec_name, "aac"); assert.equal(stream.profile, "LC");
  const rate = Number(stream.sample_rate); assert.ok(Number.isSafeInteger(rate) && rate >= 8000 && rate <= 192000);
  assert.ok(Number.isSafeInteger(stream.channels) && stream.channels >= 1 && stream.channels <= 8);
  assert.ok(Array.isArray(packets) && packets.length >= 2 && packets.length <= 512);
  const header = integer(stream.initial_padding, "initial_padding", rate), first = skipEntry(packets[0], rate);
  const firstPts = Number(packets[0].pts_time); assert.ok(typeof packets[0].pts_time === "string" && Number.isFinite(firstPts));
  let leading = first?.skip ?? 0, headerFallbackUsed = false;
  if (first && header > 0) assert.equal(first.skip, header, "Conflicting header/packet priming");
  if (!first && header > 0) {
    // Older FFprobe exposes Matroska CodecDelay as initial_padding but does not
    // attach Skip Samples to packet1. Its negative preroll must corroborate it.
    assert.equal(role, "source", "No inferred trim for output MP4");
    assert.ok(Math.abs(firstPts + header / rate) <= 0.001, "Header priming is not corroborated by source preroll");
    leading = header; headerFallbackUsed = true;
  }
  if (leading > 0) assert.ok(Math.abs(firstPts + leading / rate) <= 0.001, "Only known zero-origin AAC priming fixtures are covered");
  for (let i = 1; i < packets.length; i++) {
    const entry = skipEntry(packets[i], rate); assert.equal(entry?.skip ?? 0, 0, "Interior decoder trim/discontinuity unsupported by this fixture validator");
    if (i !== packets.length - 1) assert.equal(entry?.tail ?? 0, 0, "Interior discard metadata");
  }
  assert.equal(first?.tail ?? 0, 0, "First packet cannot discard tail in this multi-packet fixture");
  const trailing = skipEntry(packets.at(-1), rate)?.tail ?? 0;
  const semanticPackets = packets.map((packet, index) => {
    assert.equal(packet.stream_index, stream.index);
    assert.match(packet.data_hash, /^SHA256:[a-f0-9]{64}$/);
    return headerFallbackUsed && index === 0 ? { ...packet, side_data_list: [...(packet.side_data_list ?? []),
      { side_data_type: "Skip Samples", skip_samples: leading, discard_padding: 0 }] } : packet;
  });
  return { rate, channels: stream.channels, streamIndex: stream.index, leading, trailing, headerPadding: header,
    observedPacketSkip: first?.skip ?? null, headerFallbackUsed, semanticPackets,
    trimProvenance: headerFallbackUsed ? "explicit-Matroska-initial_padding-plus-negative-preroll" : "observed-packet-Skip-Samples" };
}
export function validateSmallAacEvidence(source, output, sourcePcm, outputPcm) {
  assert.equal(output.rate, source.rate); assert.equal(output.channels, source.channels);
  assert.equal(output.leading, source.leading, "Leading trim changed"); assert.equal(output.trailing, source.trailing, "Trailing trim changed");
  const clocks = validateCopiedAudioTiming(source.semanticPackets, output.semanticPackets, [source.streamIndex], [output.streamIndex]);
  assert.deepEqual(output.semanticPackets.map(packet => packet.data_hash), source.semanticPackets.map(packet => packet.data_hash), "Encoded AAC packet content changed");
  for (const [metadata, pcm] of [[source, sourcePcm], [output, outputPcm]]) {
    assert.equal(pcm.channels, metadata.channels); assert.equal(pcm.bytesPerSample, 2);
    // These fixtures explicitly use AAC-LC's1024-sample frames. This also
    // detects a decoder/frontend silently applying trim despite manual mode.
    assert.equal(pcm.decodedSamplesPerChannel, metadata.semanticPackets.length * 1024, "Manual raw PCM must contain every complete fixture AAC frame");
    assert.equal(pcm.declaredLeadingSamples, metadata.leading);
    assert.ok(pcm.decodedSamplesPerChannel > metadata.leading + metadata.trailing);
    assert.match(pcm.rawSha256, /^[a-f0-9]{64}$/); assert.match(pcm.afterDeclaredPrefixSha256, /^[a-f0-9]{64}$/);
  }
  assert.equal(outputPcm.decodedSamplesPerChannel, sourcePcm.decodedSamplesPerChannel, "Raw decoded sample count changed");
  assert.equal(outputPcm.rawSha256, sourcePcm.rawSha256, "Complete raw decoded PCM changed");
  assert.equal(outputPcm.afterDeclaredPrefixSha256, sourcePcm.afterDeclaredPrefixSha256, "Exact declared-trim PCM changed");
  return { status: "passed-small-AAC-LC-fixture", clocks, leadingSamples: source.leading, trailingSamples: source.trailing,
    rawDecodedSamplesPerChannel: sourcePcm.decodedSamplesPerChannel,
    audibleSamplesPerChannel: sourcePcm.decodedSamplesPerChannel - source.leading - source.trailing,
    completeRawPcmSha256: sourcePcm.rawSha256,
    audiblePcmSha256: source.trailing === 0 ? sourcePcm.afterDeclaredPrefixSha256 : null,
    sourceTrimProvenance: source.trimProvenance, outputTrimProvenance: output.trimProvenance,
    noContentToleranceOrOffsetSearch: true, largeFileAcceptance: false };
}
async function checkedFile(file) {
  const resolved = await realpath(file), work = await realpath(path.join(root, "work")), relative = path.relative(work, resolved);
  assert.ok(relative && !relative.startsWith("..") && !path.isAbsolute(relative));
  const info = await lstat(resolved); assert.ok(info.isFile() && !info.isSymbolicLink() && info.size > 0 && info.size <= MAX_FILE);
  return resolved;
}
async function manualPcm(file, metadata, output, env, audioOrdinal) {
  const digest = createPcmPrefixDiagnostic({ channels: metadata.channels, declaredLeadingSamples: metadata.leading });
  const controller = new AbortController(); let stderr = "";
  // Read the actual edit-list metadata separately below. Disable its implicit
  // decoder trim ONLY for this raw-sample read, then apply that exact declared
  // trim explicitly. This avoids platform-dependent double/absent trimming.
  const child = spawn("ffmpeg", ["-v", "error", ...(output ? ["-ignore_editlist", "1"] : []), "-flags2", "+skip_manual",
    "-i", file, "-map", "0:a:" + audioOrdinal, "-c:a", "pcm_s16le", "-f", "s16le", "pipe:1"],
  { cwd: root, env, windowsHide: true, signal: controller.signal, stdio: ["ignore", "pipe", "pipe"] });
  const exit = new Promise((resolve, reject) => { child.once("error", reject); child.once("close", code => resolve(code)); });
  exit.catch(() => {});
  child.stderr.on("data", bytes => { stderr = (stderr + bytes.toString()).slice(-8192); });
  const timer = setTimeout(() => controller.abort(), 30000);
  try {
    for await (const chunk of child.stdout) digest.update(chunk);
    assert.equal(await exit, 0, stderr); return digest.finish();
  } finally { clearTimeout(timer); if (child.exitCode === null && child.signalCode === null) controller.abort(); await exit.catch(() => {}); }
}
export async function validateSmallCopiedAac(sourceFile, outputFile, { env = process.env, audioOrdinal = 0 } = {}) {
  integer(audioOrdinal, "audioOrdinal", 7);
  const source = await checkedFile(sourceFile), output = await checkedFile(outputFile);
  const probe = async file => JSON.parse((await promisify(execFile)("ffprobe", ["-v", "error", "-select_streams", "a:" + audioOrdinal,
    "-show_streams", "-show_packets", "-show_format", "-show_data_hash", "sha256", "-of", "json", file],
  { cwd: root, env, windowsHide: true, timeout: 30000, maxBuffer: 512 * 1024 })).stdout);
  const before = readSmallAacTrim(await probe(source), "source"), after = readSmallAacTrim(await probe(output), "output");
  const beforePcm = await manualPcm(source, before, false, env, audioOrdinal), afterPcm = await manualPcm(output, after, true, env, audioOrdinal);
  return { ...validateSmallAacEvidence(before, after, beforePcm, afterPcm), audioOrdinal, sourcePcm: beforePcm, outputPcm: afterPcm,
    sourceTrim: { ...before, semanticPackets: undefined }, outputTrim: { ...after, semanticPackets: undefined } };
}
