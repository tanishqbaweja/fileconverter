// Audit static native tool bytes, never user media or a substitute converter.
import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { lstat, readFile, realpath } from "node:fs/promises";
import path from "node:path";
import { makeAudioTextMetadataCandidate, AUDIO_METADATA_PARENT_SHA256 } from "../../media/ffmpeg/audio-text-metadata-candidate.mjs";
import { makeAudioMetadataBuildWorkflow } from "./audio-metadata-build-workflow.mjs";
import { makeAudioRepeatedCommentBuildWorkflow } from "./audio-repeated-comment-build-workflow.mjs";
import { makeAudioRepeatedCommentCandidate } from "../../media/ffmpeg/audio-repeated-comment-candidate.mjs";
import { makeAudioCommentWrapperCandidate } from "../../media/ffmpeg/audio-comment-wrapper-candidate.mjs";
import { makeAudioMuxerOrderCandidate } from "../../media/ffmpeg/audio-muxer-order-candidate.mjs";
import { makeAudioOggArtworkCandidate } from "../../media/ffmpeg/audio-ogg-artwork-candidate.mjs";
import { makeAudioOggArtworkBuildWorkflow } from "./audio-ogg-artwork-build-workflow.mjs";
import { makeAudioOggArtworkLowerCopyCore } from "../../media/ffmpeg/audio-ogg-artwork-lower-copy-core.mjs";
import { makeAudioOggArtworkLowerCopyBuildWorkflow } from "./audio-ogg-artwork-lower-copy-build-workflow.mjs";
import { readWasmMemoryLimits } from "./wasm-memory-limits.mjs";
import { makeMp3InputGainCandidate, MP3_GAIN_ARCHIVE_SHA256 } from "../../media/ffmpeg/mp3-input-gain-candidate.mjs";
import { makeMp3InputGainBuildWorkflow } from "./mp3-input-gain-build-workflow.mjs";
import { makeMp3QuantizerSearchCore, makeMp3QuantizerSearchCandidate } from "../../media/ffmpeg/mp3-quantizer-search-candidate.mjs";
import { makeMp3QuantizerSearchBuildWorkflow } from "./mp3-quantizer-search-build-workflow.mjs";
const sha = bytes => createHash("sha256").update(bytes).digest("hex");
const root = path.resolve(import.meta.dirname, "../..");
export function validateAudioMetadataArtifactName(file) {
  assert.match(file, /^(?:[A-Za-z0-9_-][A-Za-z0-9_.-]*\.(?:mjs|wasm|c|h|json|symbols)|LICENSE\.[A-Za-z0-9_.-]+)$/);
}
const readTool = async file => {
  const info = await lstat(file); assert.ok(info.isFile() && !info.isSymbolicLink() && info.size <= 32 * 1024 * 1024);
  return readFile(file);
};

export function verifyAudioMetadataCore({ manifest, parent, compiled, helper, muxerOrderHelper, artworkHelper, memoryLimits, publicMemoryLimits, publicManifest,
  lameParent, lameCompiled, lameReceipt }) {
  assert.equal(manifest.engine, "within-remux-private-bounded-audio-metadata");
  const candidate = manifest.candidate;
  for (const flag of ["ioChanged", "memoryLimitsRaised", "browserFixVerified", "publicAcceptance"]) assert.equal(candidate[flag], false, flag);
  const gainPatch = Object.hasOwn(candidate, "upstreamLameGainPatch");
  const quantizerSearch = Object.hasOwn(candidate, "mp3QuantizerSearchPolicy");
  if (quantizerSearch) assert.equal(gainPatch, true, "Quantizer candidate also requires the exact audited unity-gain source");
  assert.equal(candidate.codecSettingsChanged, gainPatch, "Only an independently authenticated exact LAME input-gain patch may change codec policy");
  if (gainPatch) {
    assert.equal(candidate.allowedSourceEdits, quantizerSearch ? 11 : 10); assert.equal(manifest.lameSourceSha256, MP3_GAIN_ARCHIVE_SHA256);
    assert.equal(manifest.mp3InputGainPolicy, "preserve-caller-input-scale-without-preset-attenuation");
    const gainDerived = makeMp3InputGainCandidate(lameParent, { sourceArchiveSha256: manifest.lameSourceSha256 });
    assert.equal(lameCompiled, gainDerived.generated); const { generated: ignored, ...expected } = gainDerived; assert.ok(ignored);
    assert.deepEqual(lameReceipt, expected); assert.deepEqual(candidate.upstreamLameGainPatch, expected);
  }
  assert.ok([3, 4, 6, 10, 11, 14].includes(candidate.allowedSourceEdits)); assert.equal(candidate.originalMasterSha256, AUDIO_METADATA_PARENT_SHA256);
  if (candidate.allowedSourceEdits === 11) assert.equal(quantizerSearch, true);
  if (candidate.allowedSourceEdits >= 4) assert.ok(candidate.upstreamCommentPatch, "Wrapper variants also require audited parser preservation");
  assert.equal(candidate.parentSha256, sha(parent)); assert.equal(candidate.compiledSourceSha256, sha(compiled)); assert.equal(candidate.helperSha256, sha(helper));
  const derive = candidate.allowedSourceEdits === 4 ? makeAudioCommentWrapperCandidate : makeAudioTextMetadataCandidate;
  const derived = candidate.allowedSourceEdits === 11
    ? makeMp3QuantizerSearchCore(parent, helper, muxerOrderHelper, artworkHelper, { expectedParentSha256: candidate.parentSha256 })
    : candidate.allowedSourceEdits === 14
    ? makeAudioOggArtworkLowerCopyCore(parent, helper, muxerOrderHelper, artworkHelper, { expectedParentSha256: candidate.parentSha256 })
    : candidate.allowedSourceEdits === 10
    ? makeAudioOggArtworkCandidate(parent, helper, muxerOrderHelper, artworkHelper, { expectedParentSha256: candidate.parentSha256 })
    : candidate.allowedSourceEdits === 6
    ? makeAudioMuxerOrderCandidate(parent, helper, muxerOrderHelper, { expectedParentSha256: candidate.parentSha256 })
    : derive(parent, helper, { expectedParentSha256: candidate.parentSha256 });
  if (candidate.allowedSourceEdits >= 6) assert.equal(candidate.muxerOrderHelperSha256, sha(muxerOrderHelper));
  if (candidate.allowedSourceEdits >= 10) assert.equal(candidate.artworkHelperSha256, sha(artworkHelper));
  if (candidate.allowedSourceEdits === 14) {
    assert.equal(candidate.lowerCopyArtworkHelperSha256, derived.lowerCopyArtworkHelperSha256);
    assert.equal(candidate.lowerCopyParentCompiledSha256, derived.lowerCopyParentCompiledSha256);
  }
  if (quantizerSearch) assert.deepEqual(candidate.mp3QuantizerSearchPolicy, derived.mp3QuantizerSearchPolicy);
  assert.equal(compiled, derived.generated, "Actual compiled source must contain only the declared metadata edits");
  assert.deepEqual(memoryLimits, publicMemoryLimits); assert.deepEqual(candidate.wasmMemoryLimits, memoryLimits);
  assert.equal(manifest.modules.length, 1); assert.equal(manifest.modules[0].name, "within-remux");
  const publicCore = publicManifest.modules.find(core => core.name === "within-remux");
  assert.equal(manifest.modules[0].wasmPthreadPoolSize, publicCore.wasmPthreadPoolSize);
  assert.equal(manifest.modules[0].videoCodecThreads, publicCore.videoCodecThreads);
  for (const key of ["ffmpegVersion", "ffmpegSourceSha256", "initialWasmMemoryBytes", "maximumWasmMemoryBytes",
    "avioInputBufferBytes", "avioOutputBufferBytes", "outstandingWrites", "audioFifoMaximumQueuedSamples",
    "audioEncoderOptions", "aacEncoderOptions", "opusEncoderOptions", "vorbisEncoderOptions"])
    assert.deepEqual(manifest[key], publicManifest[key], key);
  assert.deepEqual(manifest.mp3EncoderOptions, quantizerSearch
    ? { ...publicManifest.mp3EncoderOptions, compressionLevel: 2 } : publicManifest.mp3EncoderOptions,
  "Only the exactly derived level2 MP3 search setting may change");
  assert.deepEqual(manifest.audioArtworkOptions, candidate.allowedSourceEdits >= 10
    ? { ...publicManifest.audioArtworkOptions, supportedOutputs: [...publicManifest.audioArtworkOptions.supportedOutputs, "ogg", "opus"] }
    : publicManifest.audioArtworkOptions, "No other artwork budget/codec options may change");
  return { parentSha256: candidate.parentSha256, compiledSourceSha256: candidate.compiledSourceSha256,
    helperSha256: candidate.helperSha256, memoryLimits, allowedSourceEdits: candidate.allowedSourceEdits, publicAcceptance: false,
    ...(gainPatch ? { upstreamLameGainPatch: lameReceipt, codecSettingsChanged: true } : {}),
    ...(quantizerSearch ? { mp3QuantizerSearchPolicy: derived.mp3QuantizerSearchPolicy } : {}) };
}

export function verifyAudioRepeatedCommentSource({ parent, compiled, receipt, manifestReceipt, archiveSha256 }) {
  const derived = makeAudioRepeatedCommentCandidate(parent, { sourceArchiveSha256: archiveSha256 });
  assert.equal(compiled, derived.generated, "Only the declared upstream comment-parser edit may be compiled");
  const { generated: ignoredGenerated, edits, ...expected } = derived;
  assert.ok(ignoredGenerated); assert.deepEqual(receipt, { ...expected, sourceEdits: edits.length });
  assert.deepEqual(manifestReceipt, receipt);
  return { originalSha256: derived.originalSha256, compiledSha256: derived.generatedSha256, sourceEdits: 1, publicAcceptance: false };
}

export async function auditAudioMetadataArtifact(candidateDirectory) {
  const directory = path.resolve(candidateDirectory), work = await realpath(path.join(root, "work"));
  const canonical = text => process.platform === "win32" ? text.toLowerCase() : text;
  const relative = path.relative(work, await realpath(directory));
  assert.ok(relative && !relative.startsWith("..") && !path.isAbsolute(relative));
  assert.equal(canonical(await realpath(directory)), canonical(directory));
  const manifestBytes = await readTool(path.join(directory, "build-manifest.json")); assert.ok(manifestBytes.length <= 2 * 1024 * 1024);
  const manifest = JSON.parse(manifestBytes);
  assert.ok(Object.keys(manifest.sources).length > 10 && Object.keys(manifest.sources).length <= 128);
  assert.ok(Object.keys(manifest.artifacts).length > 3 && Object.keys(manifest.artifacts).length <= 64);
  for (const file of ["within-remux.mjs", "within-remux.wasm", "within_remux.parent.c", "within_remux.metadata.c"])
    assert.match(manifest.artifacts[file], /^[a-f0-9]{64}$/, file);
  for (const [file, expected] of Object.entries(manifest.artifacts)) {
    validateAudioMetadataArtifactName(file);
    assert.match(expected, /^[a-f0-9]{64}$/); assert.equal(sha(await readTool(path.join(directory, file))), expected, file);
  }
  for (const [file, expected] of Object.entries(manifest.sources)) {
    assert.match(file, /^(?:media|scripts|\.github)\/[A-Za-z0-9_./-]+$/); assert.ok(!file.split("/").includes(".."));
    const actual = await readTool(path.join(root, file));
    const workflow = manifest.candidate.mp3QuantizerSearchPolicy ? makeMp3QuantizerSearchBuildWorkflow : manifest.candidate.upstreamLameGainPatch ? makeMp3InputGainBuildWorkflow : manifest.candidate.allowedSourceEdits === 14 ? makeAudioOggArtworkLowerCopyBuildWorkflow
      : manifest.candidate.allowedSourceEdits === 10 ? makeAudioOggArtworkBuildWorkflow
      : manifest.candidate.upstreamCommentPatch ? makeAudioRepeatedCommentBuildWorkflow : makeAudioMetadataBuildWorkflow;
    const actualHash = file === ".github/workflows/reproduce-ffmpeg-nondocker.yml"
      ? workflow(actual.toString()).generatedSha256 : sha(actual);
    assert.equal(actualHash, expected, "Executed build source changed: " + file);
  }
  const [parent, compiled, helper, wasm, publicWasm, publicManifest] = await Promise.all([
    readTool(path.join(directory, "within_remux.parent.c")), readTool(path.join(directory, "within_remux.metadata.c")),
    readTool(path.join(root, "media/ffmpeg/audio-text-metadata.h")), readTool(path.join(directory, "within-remux.wasm")),
    readTool(path.join(root, "public/engines/remux/within-remux.wasm")), readTool(path.join(root, "public/engines/remux/build-manifest.json")),
  ]);
  const core = verifyAudioMetadataCore({ manifest, parent: parent.toString(), compiled: compiled.toString(), helper: helper.toString(),
    muxerOrderHelper: manifest.candidate.allowedSourceEdits >= 6 ? (await readTool(path.join(root, "media/ffmpeg/audio-muxer-metadata-order.h"))).toString() : undefined,
    artworkHelper: manifest.candidate.allowedSourceEdits >= 10 ? (await readTool(path.join(root, "media/ffmpeg/audio-ogg-artwork.h"))).toString() : undefined,
    memoryLimits: readWasmMemoryLimits(wasm), publicMemoryLimits: readWasmMemoryLimits(publicWasm), publicManifest: JSON.parse(publicManifest),
    ...(manifest.candidate.upstreamLameGainPatch ? {
      lameParent: (await readTool(path.join(directory, "lame-presets.parent.c"))).toString(),
      lameCompiled: (await readTool(path.join(directory, "lame-presets.input-gain.c"))).toString(),
      lameReceipt: JSON.parse(await readTool(path.join(directory, "mp3-input-gain-source.json"))),
    } : {}) });
  if (manifest.candidate.upstreamLameGainPatch) for (const file of ["lame-presets.parent.c", "lame-presets.input-gain.c", "mp3-input-gain-source.json"])
    assert.match(manifest.artifacts[file], /^[a-f0-9]{64}$/, "Missing exact LAME patch artifact binding: " + file);
  if (manifest.candidate.mp3QuantizerSearchPolicy) {
    for (const file of ["within_remux.pre-quantizer.c", "mp3-quantizer-search-source.json"])
      assert.match(manifest.artifacts[file], /^[a-f0-9]{64}$/, "Missing exact quantizer patch artifact binding: " + file);
    const { generated, ...policy } = makeMp3QuantizerSearchCandidate((await readTool(path.join(directory, "within_remux.pre-quantizer.c"))).toString());
    assert.equal(generated, compiled.toString()); assert.deepEqual(policy, core.mp3QuantizerSearchPolicy);
    assert.deepEqual(JSON.parse(await readTool(path.join(directory, "mp3-quantizer-search-source.json"))), policy);
  }
  if (manifest.candidate.upstreamCommentPatch) {
    for (const file of ["oggparsevorbis.parent.c", "oggparsevorbis.repeated.c", "audio-repeated-comment-source.json"])
      assert.match(manifest.artifacts[file], /^[a-f0-9]{64}$/, file);
    core.upstreamCommentPatch = verifyAudioRepeatedCommentSource({
      parent: (await readTool(path.join(directory, "oggparsevorbis.parent.c"))).toString(),
      compiled: (await readTool(path.join(directory, "oggparsevorbis.repeated.c"))).toString(),
      receipt: JSON.parse(await readTool(path.join(directory, "audio-repeated-comment-source.json"))),
      manifestReceipt: manifest.candidate.upstreamCommentPatch, archiveSha256: manifest.ffmpegSourceSha256 });
  }
  const baseline = JSON.parse(await readFile(path.join(root, "evidence/2026-10-21-audio-metadata-candidate-cycle.json"), "utf8"));
  const fixtures = {};
  for (const item of baseline.baseline.cases) {
    const source = item.profileId.split("-to-")[0];
    if (fixtures[source]) assert.equal(fixtures[source].sha256, item.source.sha256);
    fixtures[source] = { sha256: item.source.sha256, bytes: item.source.bytes };
  }
  return { scope: "audited-private-native-metadata-candidate-not-promotion", directory, manifestSha256: sha(manifestBytes), core,
    deliveredArtifacts: { "within-remux.mjs": manifest.artifacts["within-remux.mjs"], "within-remux.wasm": manifest.artifacts["within-remux.wasm"] },
    fixtures, buildSourcePins: manifest.sources, artifactPins: manifest.artifacts, publicAcceptance: false };
}
