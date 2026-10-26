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
const parent = await readFile("tests/fixtures/mp3-metadata-wrapper-parent.c", "utf8"), sha = text => createHash("sha256").update(text).digest("hex");
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
