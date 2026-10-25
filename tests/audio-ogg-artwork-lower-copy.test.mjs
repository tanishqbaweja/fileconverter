import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";
import { createHash } from "node:crypto";
import { gunzipSync } from "node:zlib";
import { AUDIO_OGG_ARTWORK_BASELINE_SHA256, makeAudioOggArtworkLowerCopyCandidate } from "../media/ffmpeg/audio-ogg-artwork-lower-copy-candidate.mjs";
import { makeAudioOggArtworkCandidate } from "../media/ffmpeg/audio-ogg-artwork-candidate.mjs";
import { makeAudioOggArtworkLowerCopyCore } from "../media/ffmpeg/audio-ogg-artwork-lower-copy-core.mjs";
import { makeAudioOggArtworkBuildRecipe } from "../media/ffmpeg/audio-ogg-artwork-build-recipe.mjs";
import { makeAudioOggArtworkLowerCopyBuildRecipe } from "../media/ffmpeg/audio-ogg-artwork-lower-copy-build-recipe.mjs";
import { makeAudioOggArtworkBuildWorkflow } from "../scripts/lib/audio-ogg-artwork-build-workflow.mjs";
import { makeAudioOggArtworkLowerCopyBuildWorkflow } from "../scripts/lib/audio-ogg-artwork-lower-copy-build-workflow.mjs";
import { verifyAudioMetadataCore } from "../scripts/lib/audio-metadata-artifact.mjs";
const baseline = await readFile("media/ffmpeg/audio-ogg-artwork.h", "utf8");

test("lower-copy private experiment is exactly four reversible edits against the unchanged measured baseline", () => {
  const candidate = makeAudioOggArtworkLowerCopyCandidate(baseline);
  assert.equal(candidate.baselineSha256, AUDIO_OGG_ARTWORK_BASELINE_SHA256); assert.equal(candidate.edits.length, 4);
  let reversed = candidate.generated;
  for (const [before, after] of candidate.edits.toReversed()) reversed = reversed.replace(after, before);
  assert.equal(reversed, baseline); assert.throws(() => makeAudioOggArtworkLowerCopyCandidate(baseline + "\n"));
  for (const key of ["codecSettingsChanged", "ioChanged", "memoryLimitsRaised", "browserSpeedVerified", "browserConversionVerified", "publicAcceptance"])
    assert.equal(candidate[key], false);
});

test("candidate retains bounded header plus three-byte boundary bridge and native base64 without image-sized temporary copy", () => {
  const { generated } = makeAudioOggArtworkLowerCopyCandidate(baseline);
  assert.doesNotMatch(generated, /av_malloc\(block_bytes\)|memcpy\(at, artwork->attached_pic.data/);
  assert.match(generated, /uint8_t header\[32 \+ 10 \+ 4095\]/); assert.match(generated, /uint8_t bridge\[3\]/);
  assert.match(generated, /prefix_bytes = header_bytes - header_bytes % 3/);
  assert.match(generated, /image \+= take; remaining_image_bytes -= take/);
  assert.equal(generated.split("av_malloc(").length - 1, 1);
  for (const contract of ["maximum_image_bytes = 4 * 1024 * 1024", "maximum_description_bytes = 4096", "av_dict_count(*metadata) >= 4096",
    "merge_bounded_audio_text_metadata(&next, *metadata, NULL)", "AV_DICT_DONT_STRDUP_VAL", "av_dict_free(metadata); *metadata = next; next = NULL;"])
    assert.ok(generated.includes(contract));
});

test("matched native probe checks padding residues, tiny images, Unicode, maximum description, exact bytes, allocation failures and alternating order", async () => {
  const source = await readFile("tests/native/audio-ogg-artwork-lower-copy.c", "utf8");
  assert.match(source, /length <= 8/); assert.match(source, /size <= 12/); assert.match(source, /char longest\[4096\]/);
  assert.match(source, /metadata == original/); assert.match(source, /round % 2 \? "BA" : "AB"/);
  assert.match(source, /allocation_bytes\[0\] - allocation_bytes\[1\] == maximum \+ header/);
  assert.doesNotMatch(source, /avformat_open_input|avcodec_send|av_write_frame/);
  const runner = await readFile("scripts/benchmark-audio-ogg-artwork-lower-copy-native.mjs", "utf8");
  assert.match(runner, /windowsHide: true/); assert.match(runner, /await runtime.close\(\)/);
  assert.match(runner, /native-serializer-only-not-browser-speed/);
});

test("new private recipe/workflow add only the lower-copy generator and builder, preserving native build flags and all baseline files", async () => {
  const recipe = await readFile("media/ffmpeg/reproduce-nondocker.sh", "utf8");
  const derived = makeAudioOggArtworkLowerCopyBuildRecipe(recipe);
  assert.equal(derived.generated.replace('  node "${SCRIPT_DIR}/make-audio-ogg-artwork-lower-copy-candidate.mjs"\n', ""), makeAudioOggArtworkBuildRecipe(recipe).generated);
  const workflow = await readFile(".github/workflows/reproduce-ffmpeg-nondocker.yml", "utf8");
  assert.equal(makeAudioOggArtworkLowerCopyBuildWorkflow(workflow).generated.replace("node media/ffmpeg/build-audio-ogg-artwork-lower-copy-candidate.mjs", "node media/ffmpeg/build-audio-ogg-artwork-candidate.mjs"), makeAudioOggArtworkBuildWorkflow(workflow).generated);
  const retained = JSON.parse(gunzipSync(await readFile("outputs/reports/2026-10-25T04-06-15.912Z-audio-metadata-production-runtime.json.gz"), { maxOutputLength: 1048576 }));
  const sources = retained.artifact.buildSourcePins;
  assert.equal(Object.keys(sources).length, 56);
  for (const [file, expected] of Object.entries(sources)) {
    const bytes = await readFile(file), actual = file === ".github/workflows/reproduce-ffmpeg-nondocker.yml"
      ? makeAudioOggArtworkBuildWorkflow(bytes.toString()).generatedSha256 : createHash("sha256").update(bytes).digest("hex");
    assert.equal(actual, expected, "Measured baseline build input must remain unchanged: " + file);
  }
});

test("fourteen-edit core audit derives exact lower-copy source and rejects re-signed unrelated edits or relaxed heap/artwork/codec limits", async () => {
  const parent = await readFile("media/ffmpeg/within_remux.c", "utf8"), helper = await readFile("media/ffmpeg/audio-text-metadata.h", "utf8");
  const order = await readFile("media/ffmpeg/audio-muxer-metadata-order.h", "utf8");
  const core = makeAudioOggArtworkLowerCopyCore(parent, helper, order, baseline);
  const old = makeAudioOggArtworkCandidate(parent, helper, order, baseline);
  assert.equal(core.allowedSourceEdits, 14); assert.equal(core.lowerCopyParentCompiledSha256, old.generatedSha256);
  assert.equal(core.generated.replace(makeAudioOggArtworkLowerCopyCandidate(baseline).generated, baseline), old.generated);
  const publicManifest = JSON.parse(await readFile("public/engines/remux/build-manifest.json"));
  const limits = [{ imported: true, initialPages: 512, maximumPages: 1536, shared: true }];
  const input = { parent, helper, muxerOrderHelper: order, artworkHelper: baseline, compiled: core.generated, publicManifest,
    memoryLimits: limits, publicMemoryLimits: limits, manifest: { ...structuredClone(publicManifest), engine: "within-remux-private-bounded-audio-metadata",
      modules: [structuredClone(publicManifest.modules.find(module => module.name === "within-remux"))],
      audioArtworkOptions: { ...publicManifest.audioArtworkOptions, supportedOutputs: [...publicManifest.audioArtworkOptions.supportedOutputs, "ogg", "opus"] },
      candidate: { ...core, generated: undefined, extraEdits: undefined, originalMasterSha256: core.parentSha256,
        compiledSourceSha256: core.generatedSha256, wasmMemoryLimits: limits, upstreamCommentPatch: { separatelyAudited: true } } } };
  assert.equal(verifyAudioMetadataCore(input).allowedSourceEdits, 14);
  for (const mutate of [x => { x.compiled += "\nint unrelated;\n"; x.manifest.candidate.compiledSourceSha256 = createHash("sha256").update(x.compiled).digest("hex"); },
    x => { x.manifest.candidate.lowerCopyArtworkHelperSha256 = "0".repeat(64); }, x => { x.manifest.candidate.lowerCopyParentCompiledSha256 = "0".repeat(64); },
    x => { x.manifest.audioArtworkOptions.maximumBytes++; }, x => { x.manifest.initialWasmMemoryBytes++; }, x => { x.manifest.modules[0].videoCodecThreads++; }]) {
    const changed = structuredClone(input); mutate(changed); assert.throws(() => verifyAudioMetadataCore(changed));
  }
});

test("retained native measurements prove explicit allocation savings and 220 exact cases, never browser conversion or total-process savings", async () => {
  const report = JSON.parse(await readFile("outputs/reports/2026-10-25T04-21-54.520Z-audio-ogg-lower-copy-native.json"));
  assert.equal(report.status, "passed-differential-allocation-and-native-timing-probe-browser-unverified");
  for (const key of ["publicAcceptance", "browserConversionVerified", "nativeMediaConversionUsed"]) assert.equal(report[key], false);
  assert.equal(report.behavior.exactDifferentialCases, 220); assert.equal(report.behavior.atomicOomBoth, true);
  assert.equal(report.behavior.baselineExplicitAllocationBytes - report.behavior.candidateExplicitAllocationBytes, 4194381);
  assert.equal(report.behavior.baselineAllocationCalls, 2); assert.equal(report.behavior.candidateAllocationCalls, 1);
  assert.equal(report.derivation.maximumHeaderStackBytes + report.derivation.maximumBridgeStackBytes, 4140);
  assert.equal(report.behavior.measurements.length, 24);
  for (const measurement of report.timing) {
    const rows = report.behavior.measurements.filter(row => row.imageBytes === measurement.imageBytes);
    assert.equal(rows.length, 8); assert.equal(rows.filter(row => row.order === "AB").length, 4);
    assert.equal(rows.filter(row => row.order === "BA").length, 4);
    assert.equal(measurement.medianBatchSpeedup, measurement.baselineMedianBatchMs / measurement.candidateMedianBatchMs);
    assert.equal(measurement.candidateFasterBatches, rows.filter(row => row.candidateMs < row.baselineMs).length);
    assert.equal(measurement.scope, "native-serializer-only-not-browser-speed");
  }
  assert.equal(report.ownedCompilerOutputAndScratchRemoved, true);
  for (const [file, expected] of Object.entries(report.sources))
    assert.equal(createHash("sha256").update(await readFile(file)).digest("hex"), expected);
});

test("matched browser scope measures real UI and engine timings without excluding warmup memory, fidelity, privacy or cleanup", async () => {
  const source = await readFile("scripts/test-audio-metadata-production-runtime.mjs", "utf8");
  assert.match(source, /--artwork-serializer-benchmark/);
  assert.match(source, /artworkBenchmark \? Array.from\(\{ length: 7 \}/);
  assert.match(source, /benchmarkWarmup: index === 0/);
  assert.match(source, /warmupExcludedOnlyFromTimingNotCorrectnessOrMemory: true/);
  assert.match(source, /row.engineElapsedMs = state.metrics.elapsedMs/);
  assert.match(source, /Every benchmark job must match the complete accepted output control/);
  assert.match(source, /compareNativeAudioPcm\(input, output/);
  assert.match(source, /active.peak.privateBytes - report.blankBaseline.privateBytes/);
  assert.match(source, /await runtime.close\(\)/);
});
