// Isolated derivative; published assets never call or import this builder.
import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { h264ProbeWrapperSha256 } from "./mkv-h264-probe-decoder-candidate.mjs";

export const h264StartupBuildRef = "codex/mkv-h264-startup-native-20261115";
export const h264StartupWrapperSha256 = "1c6b184978eecb8ce966a6db55cc3b8f3aa2d216e102a81e11aa9cc80d83db1f";
export const h264StartupHeaderSha256 = "c818a5337b0ee7d9d6644fe9db46777ae150008a37e34173bbda6fc06fe3a712";
export const h264StartupPrefixSha256 = "e77569b73fdec3653e51ccfdd17eb862e5a093c97ffceebeccfb23317267e758";
const sha = bytes => createHash("sha256").update(bytes).digest("hex");
export function makeH264StartupCandidate(bytes, header, prefix) {
  assert.equal(sha(bytes), h264ProbeWrapperSha256, "Exact previously tested probe core required");
  assert.ok(header.length > 0 && header.length <= 16384 && prefix.length > 0 && prefix.length <= 16384);
  assert.equal(sha(header), h264StartupHeaderSha256); assert.equal(sha(prefix), h264StartupPrefixSha256);
  const original = bytes.toString("utf8");
  const entry = original.indexOf("int within_remux(int profile) {"); assert.ok(entry > 0);
  const exportAnchor = "EMSCRIPTEN_KEEPALIVE\nint within_remux(int profile) {";
  const ioAnchor = "  output_buffer = av_malloc(WITHIN_AVIO_OUTPUT_BUFFER_SIZE);";
  const body = original.slice(entry); assert.equal(body.split(ioAnchor).length, 2);
  assert.equal(original.split(exportAnchor).length, 2);
  const helper = header.toString("utf8") + "\n";
  const bridge = prefix.toString("utf8") + "\n";
  let generated = original.slice(0, entry) + body.replace(ioAnchor, () => bridge + ioAnchor);
  generated = generated.replace(exportAnchor, () => helper + exportAnchor);
  assert.equal(generated.replace(helper + exportAnchor, () => exportAnchor)
    .replace(bridge + ioAnchor, () => ioAnchor), original, "Exact reversal required");
  assert.equal(sha(generated), h264StartupWrapperSha256);
  return { generated, proof: { parentWrapperSha256: h264ProbeWrapperSha256, candidateWrapperSha256: sha(generated),
    startupHeaderSha256: sha(header), startupPrefixSha256: sha(prefix), h264StartupDts: true,
    onlyMissingStartupDtsGenerated: true, existingPtsAndKnownDtsUnchanged: true,
    nominalFrameRateUsedForStartup: false, startupMaximumPayloadBytes: 2097152,
    startupMaximumInspectedPackets: 4096, startupMaximumVideoPackets: 33, startupMaximumSpanMicroseconds: 2000000,
    startupMaximumReorderDepth: 16, packetClocksRewritten: true, knownPacketClocksRewritten: false,
    extraPacketBuffering: true, extraPacketBufferingScope: "existing bounded FFmpeg stream-info queue plus separate fixed 2 MiB/4096-packet startup prefix",
    exactReversal: true, probeBoundsChanged: false, wasmBoundsChanged: false, hevcTimingPolicyUnchanged: true,
    finalPacketsReencoded: false, publicAcceptance: false } };
}
