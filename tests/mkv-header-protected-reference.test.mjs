import assert from "node:assert/strict";
import test from "node:test";
import { readFile } from "node:fs/promises";
import { headerCoreH264References, readHeaderCoreH264Regressions, readPriorCompleteProtectedVideo, canInheritCompleteProtectedVideo,
  headerProtectedReference, readHeaderProtectedReference } from "../scripts/lib/mkv-header-protected-reference.mjs";
import { protectedCompleteVideoReference } from "../scripts/lib/mkv-startup-core-reference.mjs";
import { assertFreshProtectedVideoBytes } from "../scripts/lib/mkv-full-video-decode.mjs";

test("current-core original gate requires all three genuine current-native H264 regressions and refuses changed evidence or native identity", async () => {
  const buffers = await Promise.all(headerCoreH264References.map(r => readFile(r.file)));
  const tools = JSON.parse(buffers[0]).candidateBuild;
  const rows = readHeaderCoreH264Regressions(buffers, tools); assert.equal(rows.length, 3);
  assert.ok(rows.every(r => r.exactCurrentNativeBuildVerified && r.noConversionReplay));
  assert.throws(() => readHeaderCoreH264Regressions(buffers.slice(1), tools));
  assert.throws(() => readHeaderCoreH264Regressions([buffers[1], buffers[0], buffers[2]], tools));
  const changed = structuredClone(tools); changed.build.artifacts["within-direct.wasm"].sha256 = "a".repeat(64);
  assert.throws(() => readHeaderCoreH264Regressions(buffers, changed));
});

test("prior complete-video proof is authenticated but unlike current output bytes must force a fresh decode", async () => {
  const prior = readPriorCompleteProtectedVideo(await readFile(protectedCompleteVideoReference.file));
  assert.equal(prior.fullDecodedVideoFrames, 296160); assert.equal(prior.nativeBuildEqualityClaimed, false);
  assert.equal(canInheritCompleteProtectedVideo(prior, prior.outputBytes, prior.outputSha256), true);
  assert.equal(canInheritCompleteProtectedVideo(prior, prior.outputBytes, "a".repeat(64)), false);
  assert.equal(canInheritCompleteProtectedVideo(prior, prior.outputBytes + 1, prior.outputSha256), false);
  assert.throws(() => readPriorCompleteProtectedVideo(Buffer.from("changed prior video evidence")));
  assert.throws(() => canInheritCompleteProtectedVideo(prior, NaN, prior.outputSha256));
});

test("fresh full decode uses a separate realistic extent while preserving the original exact-byte legacy decoder and fixed frame/deadline guards", async () => {
  for (const size of [2900000000, 2962151594, 3100000000]) assert.doesNotThrow(() => assertFreshProtectedVideoBytes(size));
  for (const size of [0, 210 * 1048576, 2899999999, 3100000001, NaN, Infinity, 2962151594.5]) assert.throws(() => assertFreshProtectedVideoBytes(size));
  const decoder = await readFile("scripts/lib/mkv-full-video-decode.mjs", "utf8");
  assert.match(decoder, /decodeFinishedProtectedVideo\(file, \{ cwd, env, onProgress \}, 2962151594n\)/);
  assert.match(decoder, /before.size === expectedOutputBytes/);
  assert.match(decoder, /createFullVideoDecodeProgress\(296160, 12340\)/);
  assert.match(decoder, /decodedFileCreated: false/); assert.match(decoder, /nativeToolUsedForConversion: false/);
  const qualifier = await readFile("scripts/qualify-mkv-direct-reuse.mjs", "utf8");
  assert.match(qualifier, /--hevc-header-parser-protected/);
  assert.match(qualifier, /readHeaderCoreH264Regressions\(/);
  assert.match(qualifier, /canInheritCompleteProtectedVideo\(prior, bytes, validation.outputSha256\)/);
  assert.match(qualifier, /decodeFreshProtectedVideo\(output, \{ cwd: root, env, expectedOutputBytes: bytes/);
  assert.match(qualifier, /Codec initialization bytes changed/);
  assert.match(qualifier, /protectedFullDecode \|\| headerProtected \? 20000/);
});

test("repeat gate binds EVERY new output byte to exact-current-native fresh original packet/PCM/complete-video proof; never replays native validation", async () => {
  const bytes = await readFile(headerProtectedReference.file), r = JSON.parse(bytes);
  const ref = readHeaderProtectedReference(bytes, r.candidateBuild);
  assert.equal(ref.outputBytes, 2962151594);
  assert.equal(ref.outputSha256, "64f8a3c3fc8812857ec0c0fd2ec446622100e389e8377911d6d1e0b976fc7b36");
  assert.equal(ref.fullDecodedVideoFrames, 296160); assert.equal(ref.exactCurrentNativeBuildVerified, true);
  assert.equal(ref.noValidationReplay, true);
  assert.throws(() => readHeaderProtectedReference(Buffer.from("changed first-output proof"), r.candidateBuild));
  const changed = structuredClone(r.candidateBuild); changed.runId = "1";
  assert.throws(() => readHeaderProtectedReference(bytes, changed));
  const source = await readFile("scripts/qualify-mkv-direct-reuse.mjs", "utf8");
  assert.match(source, /--hevc-header-parser-protected-repeats/);
  const repeatGate = source.slice(source.indexOf("  if (headerProtectedRepeats) {", source.indexOf("async function validateProtectedOutput")), source.indexOf("  if (headerProtected) {", source.indexOf("async function validateProtectedOutput")));
  assert.match(repeatGate, /Current-core repeat changed independently validated complete output/);
  assert.match(repeatGate, /fullVideoDecode = false/); assert.match(repeatGate, /fullVideoDecodeInheritedThroughWholeOutputIdentity = true/);
  assert.doesNotMatch(repeatGate, /decodedPcm\(|compareMkvGapAwareVideoPackets\(|decodeFreshProtectedVideo\(/);
});
