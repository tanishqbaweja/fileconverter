import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { readFile } from "node:fs/promises";
import test from "node:test";
import { runInNewContext } from "node:vm";
import { MP3_CLIPPING_CASES } from "../scripts/lib/mp3-clipping-fixture.mjs";
import { makeMp3QuantizerSearchCandidate, MP3_QUANTIZER_PARENT_SHA256 } from "../media/ffmpeg/mp3-quantizer-search-candidate.mjs";
import { makeMp3InputGainBuildRecipe } from "../media/ffmpeg/mp3-input-gain-build-recipe.mjs";
import { makeMp3QuantizerSearchBuildRecipe } from "../media/ffmpeg/mp3-quantizer-search-build-recipe.mjs";
import { makeMp3InputGainBuildWorkflow } from "../scripts/lib/mp3-input-gain-build-workflow.mjs";
import { makeMp3QuantizerSearchBuildWorkflow } from "../scripts/lib/mp3-quantizer-search-build-workflow.mjs";
import { verifyAudioMetadataCore } from "../scripts/lib/audio-metadata-artifact.mjs";
import { makeAudioOggArtworkCandidate } from "../media/ffmpeg/audio-ogg-artwork-candidate.mjs";
import { makeMp3InputGainCandidate, MP3_GAIN_ARCHIVE_SHA256 } from "../media/ffmpeg/mp3-input-gain-candidate.mjs";
const buildParent = await readFile("tests/fixtures/mp3-metadata-wrapper-parent.c", "utf8"), sha = text => createHash("sha256").update(text).digest("hex");
const helper = await readFile("media/ffmpeg/audio-text-metadata.h", "utf8"), order = await readFile("media/ffmpeg/audio-muxer-metadata-order.h", "utf8"), artwork = await readFile("media/ffmpeg/audio-ogg-artwork.h", "utf8");
const base = makeAudioOggArtworkCandidate(buildParent, helper, order, artwork, { expectedParentSha256: "ff8926c995010617bcc76701f0ea75feb5a2c99dadb136d8b8d1c8703e5d6dcd" });
const parent = base.generated;
test("level2 MP3 search changes exactly one option in the actual authenticated private ten-edit wrapper", () => {
  assert.equal(sha(parent), MP3_QUANTIZER_PARENT_SHA256);
  const result = makeMp3QuantizerSearchCandidate(parent);
  assert.equal(result.sourceEdits, 1); assert.equal(result.priorCompressionLevel, 9); assert.equal(result.compressionLevel, 2);
  assert.equal(result.generated.replace('    av_dict_set(&encoder_options, "compression_level", "2", 0);',
    '    av_dict_set(&encoder_options, "compression_level", "9", 0);'), parent);
  assert.equal(result.bitRateUnchanged, true); assert.equal(result.inputGainUnchanged, true);
  for (const key of ["ioChanged", "memoryLimitsRaised", "clippingAcceptance", "publicAcceptance"]) assert.equal(result[key], false);
});
test("arbitrary wrapper, settings, whitespace or an already changed search level cannot be silently repinned", () => {
  for (const altered of [parent + "\n", parent.replace('"compression_level", "9"', '"compression_level", "5"'), parent.replace("128000", "320000")])
    assert.throws(() => makeMp3QuantizerSearchCandidate(altered));
});
test("quality recipe retains the audited unity-gain/library/heap/IO configuration, adding only the bounded wrapper patch before compilation", async () => {
  const source = await readFile("media/ffmpeg/reproduce-nondocker.sh", "utf8"), base = makeMp3InputGainBuildRecipe(source), result = makeMp3QuantizerSearchBuildRecipe(source);
  assert.equal(result.generated.replace('  node "${SCRIPT_DIR}/make-mp3-quantizer-search-candidate.mjs"\n', ""), base.generated);
  assert.equal(result.bitRateUnchanged, true); assert.equal(result.codecSettingsChanged, true); assert.equal(result.memoryLimitsRaised, false);
  assert.ok(result.generated.indexOf('make-mp3-quantizer-search-candidate.mjs') < result.generated.indexOf('WITHIN_BUILD_CORE_FILTER=within-remux ./build-remux.sh'));
  assert.match(result.generated, /make-mp3-input-gain-candidate.mjs/);
});
test("isolated workflow only changes the private builder and adds exact preimage/policy artifacts, never public build settings", async () => {
  const source = await readFile(".github/workflows/reproduce-ffmpeg-nondocker.yml", "utf8"), base = makeMp3InputGainBuildWorkflow(source), result = makeMp3QuantizerSearchBuildWorkflow(source);
  assert.equal(result.generated.replace('node media/ffmpeg/build-mp3-quantizer-search-candidate.mjs', 'node media/ffmpeg/build-mp3-input-gain-candidate.mjs')
    .replace('            work/ffmpeg-nondocker-output/within_remux.pre-quantizer.c\n', '')
    .replace('            work/ffmpeg-nondocker-output/mp3-quantizer-search-source.json\n', ''), base.generated);
  assert.equal(result.originalSdkDependencyAndCleanupStepsRetained, true); assert.equal(result.publicAcceptance, false);
});
test("artifact policy never accepts eleven edits or a search-policy marker without authenticated unity-gain and exact source derivation", () => {
  const candidate = { codecSettingsChanged: false, ioChanged: false, memoryLimitsRaised: false, browserFixVerified: false, publicAcceptance: false,
    allowedSourceEdits: 11, mp3QuantizerSearchPolicy: makeMp3QuantizerSearchCandidate(parent) };
  assert.throws(() => verifyAudioMetadataCore({ manifest: { engine: "within-remux-private-bounded-audio-metadata", candidate } }), /exact audited unity-gain/);
  const compiled = makeMp3QuantizerSearchCandidate(parent).generated;
  assert.throws(() => makeMp3QuantizerSearchCandidate(compiled));
});
test("complete real-source eleven-edit audit accepts exactly level2 and rejects re-signed bitrate, search, IO, heap and gain-policy mutations", async () => {
  const publicManifest = JSON.parse(await readFile("public/engines/remux/build-manifest.json"));
  const lameParent = await readFile("tests/fixtures/lame4-presets-parent.c", "utf8"), { generated: lameCompiled, ...lameReceipt } = makeMp3InputGainCandidate(lameParent, { sourceArchiveSha256: MP3_GAIN_ARCHIVE_SHA256 });
  const { generated: compiled, ...policy } = makeMp3QuantizerSearchCandidate(parent);
  const memory = [{ imported: true, initialPages: 512, maximumPages: 1536, shared: true }];
  const input = { parent: buildParent, compiled, helper, muxerOrderHelper: order, artworkHelper: artwork, publicManifest,
    lameParent, lameCompiled, lameReceipt, memoryLimits: structuredClone(memory), publicMemoryLimits: structuredClone(memory),
    manifest: { ...structuredClone(publicManifest), engine: "within-remux-private-bounded-audio-metadata",
      modules: [structuredClone(publicManifest.modules.find(core => core.name === "within-remux"))],
      mp3EncoderOptions: { ...publicManifest.mp3EncoderOptions, compressionLevel: 2 },
      mp3InputGainPolicy: "preserve-caller-input-scale-without-preset-attenuation",
      audioArtworkOptions: { ...publicManifest.audioArtworkOptions, supportedOutputs: [...publicManifest.audioArtworkOptions.supportedOutputs, "ogg", "opus"] },
      candidate: { parentSha256: sha(buildParent), compiledSourceSha256: sha(compiled), helperSha256: sha(helper),
        originalMasterSha256: "ae501a2e7b435b246a1056959ae93b7e573f1548b1729171eec5b215e0683068", allowedSourceEdits: 11,
        muxerOrderHelperSha256: sha(order), artworkHelperSha256: sha(artwork), wasmMemoryLimits: structuredClone(memory),
        upstreamCommentPatch: { independentlyAuditedSeparately: true }, upstreamLameGainPatch: lameReceipt, mp3QuantizerSearchPolicy: policy,
        codecSettingsChanged: true, ioChanged: false, memoryLimitsRaised: false, browserFixVerified: false, publicAcceptance: false } } };
  assert.equal(verifyAudioMetadataCore(input).mp3QuantizerSearchPolicy.compressionLevel, 2);
  for (const mutate of [
    row => { row.manifest.mp3EncoderOptions.stereoBitRate = 320000; },
    row => { row.manifest.mp3EncoderOptions.compressionLevel = 5; },
    row => { row.manifest.candidate.mp3QuantizerSearchPolicy.compressionLevel = 5; },
    row => { row.manifest.candidate.mp3QuantizerSearchPolicy.clippingAcceptance = true; },
    row => { row.manifest.candidate.ioChanged = true; },
    row => { row.memoryLimits[0].maximumPages++; row.manifest.candidate.wasmMemoryLimits[0].maximumPages++; },
    row => { row.manifest.mp3InputGainPolicy = "attenuate"; },
    row => { row.compiled += "\nint unrelated;\n"; row.manifest.candidate.compiledSourceSha256 = sha(row.compiled); },
  ]) { const changed = structuredClone(input); mutate(changed); assert.throws(() => verifyAudioMetadataCore(changed)); }
});
test("actual builder truthfully declares changed MP3 search while retaining prior source pins, exact eleven edits and both artifacts", async () => {
  const source = await readFile("media/ffmpeg/build-mp3-quantizer-search-candidate.mjs", "utf8"), audit = await readFile("scripts/lib/audio-metadata-artifact.mjs", "utf8");
  assert.match(source, /allowedSourceEdits: 11/); assert.match(source, /mp3EncoderOptions: \{ \.\.\.original.mp3EncoderOptions, compressionLevel: 2 \}/);
  assert.match(source, /upstreamLameGainPatch: lameReceipt, codecSettingsChanged: true/);
  assert.match(audit, /assert.deepEqual\(candidate.mp3QuantizerSearchPolicy, derived.mp3QuantizerSearchPolicy\)/);
  assert.match(audit, /makeMp3QuantizerSearchCandidate\(\(await readTool\(path.join\(directory, "within_remux.pre-quantizer.c"\)\)\)/);
});
test("new actual-browser gate selects exactly two previously failed full-scale inputs and requires level2 without changing fidelity, peak or memory gates", async () => {
  const source = await readFile("scripts/test-audio-metadata-production-runtime.mjs", "utf8"), start = source.indexOf("const selectedCases = "), end = source.indexOf(";\nconst root =", start);
  const cases = JSON.parse(JSON.stringify(runInNewContext("(" + source.slice(start + "const selectedCases = ".length, end) + ")",
    { mp3GainMatrix: false, mp3Clipping: true, mp3QuantizerClipping: true, MP3_CLIPPING_CASES }, { timeout: 1000 })));
  assert.deepEqual(cases.map(row => [row.channels, row.amplitude]), [[1, 0.999], [2, 0.999]]);
  assert.match(source, /mp3QuantizerSearchPolicy\?\.compressionLevel, 2/);
  assert.match(source, /exact failed full-scale input, never a quieter replacement/);
  assert.match(source, /validateNearFullScalePeaks\(row.source.floatPeaks, row.decodedFloatPeaks\)/);
  assert.match(source, /row.fidelity.minimumPsnrDb, 60/); assert.match(source, /Math.abs\(gain.leastSquaresGain - 1\) <= 0.001/);
  assert.match(source, /active.peak.privateBytes - report.blankBaseline.privateBytes/);
  assert.match(source, /assert.ok\(report.memory.incrementalPrivateMiB <= 250\)/);
});
