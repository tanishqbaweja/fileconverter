import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { readFile } from "node:fs/promises";
import test from "node:test";
import { makeAudioOggArtworkCandidate } from "../media/ffmpeg/audio-ogg-artwork-candidate.mjs";
import { makeAudioMuxerOrderCandidate } from "../media/ffmpeg/audio-muxer-order-candidate.mjs";
import { makeAudioOggArtworkBuildRecipe } from "../media/ffmpeg/audio-ogg-artwork-build-recipe.mjs";
import { makeAudioRepeatedCommentBuildRecipe } from "../media/ffmpeg/audio-repeated-comment-build-recipe.mjs";
import { makeAudioOggArtworkBuildWorkflow } from "../scripts/lib/audio-ogg-artwork-build-workflow.mjs";
import { makeAudioRepeatedCommentBuildWorkflow } from "../scripts/lib/audio-repeated-comment-build-workflow.mjs";
import { verifyAudioMetadataCore } from "../scripts/lib/audio-metadata-artifact.mjs";
const parent = await readFile("media/ffmpeg/within_remux.c", "utf8"), helper = await readFile("media/ffmpeg/audio-text-metadata.h", "utf8");
const order = await readFile("media/ffmpeg/audio-muxer-metadata-order.h", "utf8"), artwork = await readFile("media/ffmpeg/audio-ogg-artwork.h", "utf8");
const result = makeAudioOggArtworkCandidate(parent, helper, order, artwork);
test("private Ogg cover candidate composes exactly four reversible edits on the closed six-edit metadata parent", () => {
  const base = makeAudioMuxerOrderCandidate(parent, helper, order);
  assert.equal(result.allowedSourceEdits, 10); assert.equal(result.sixEditSourceSha256, base.generatedSha256);
  let reversed = result.generated;
  for (const [before, after] of result.extraEdits.toReversed()) reversed = reversed.replace(after, before);
  assert.equal(reversed, base.generated);
  for (const field of ["codecSettingsChanged", "ioChanged", "memoryLimitsRaised", "browserFixVerified", "publicAcceptance"]) assert.equal(result[field], false);
  assert.match(result.generated, /artwork_stream_index >= 0 && \(opus_output \|\| vorbis_output\)/);
  assert.match(result.generated, /artwork_stream_index >= 0 && !opus_output && !vorbis_output/);
  assert.match(result.generated, /add_bounded_ogg_audio_artwork\(&output_stream->metadata/);
  assert.match(result.generated, /Bounded Ogg cover serialization failed[\s\S]*?goto cleanup/);
});
test("new serializer keeps image/text/description/field limits and replaces metadata only after checked success", () => {
  assert.match(artwork, /maximum_image_bytes = 4 \* 1024 \* 1024/);
  assert.match(artwork, /width > 4096 \|\| height > 4096/);
  assert.match(artwork, /maximum_description_bytes = 4096/); assert.match(artwork, /av_dict_count\(\*metadata\) >= 4096/);
  assert.match(artwork, /merge_bounded_audio_text_metadata\(&next, \*metadata, NULL\)/);
  assert.match(artwork, /AV_DICT_DONT_STRDUP_VAL/);
  assert.ok(artwork.indexOf("av_dict_free(metadata)") > artwork.indexOf("if (result < 0) goto cleanup"));
  assert.match(artwork, /av_free\(block\); av_free\(encoded\); av_dict_free\(&next\)/);
});
test("new private build adds only the fourth wrapper generator and changes no native recipe, SDK, codec or cleanup commands", async () => {
  const recipe = await readFile("media/ffmpeg/reproduce-nondocker.sh", "utf8");
  const base = makeAudioRepeatedCommentBuildRecipe(recipe, { preserveStreamComments: true, preserveMuxerOrder: true });
  const generated = makeAudioOggArtworkBuildRecipe(recipe);
  assert.equal(generated.generated.replace('  node "${SCRIPT_DIR}/make-audio-ogg-artwork-candidate.mjs"\n', ""), base.generated);
  assert.ok(generated.generated.indexOf("make-audio-muxer-order-candidate.mjs") < generated.generated.indexOf("make-audio-ogg-artwork-candidate.mjs"));
  assert.ok(generated.generated.indexOf("make-audio-ogg-artwork-candidate.mjs") < generated.generated.indexOf('cp -- "${BUILD_ROOT}/within_remux.metadata.c"'));
  const workflow = await readFile(".github/workflows/reproduce-ffmpeg-nondocker.yml", "utf8");
  assert.equal(makeAudioOggArtworkBuildWorkflow(workflow).generated.replace("node media/ffmpeg/build-audio-ogg-artwork-candidate.mjs", "node media/ffmpeg/build-audio-repeated-metadata-candidate.mjs"), makeAudioRepeatedCommentBuildWorkflow(workflow).generated);
  const builder = await readFile("media/ffmpeg/build-audio-repeated-metadata-candidate.mjs", "utf8");
  const inherited = JSON.parse(builder.match(/const sourceFiles = (\[[\s\S]*?\]);/)[1].replaceAll(/\s+/g, " "));
  assert.ok(inherited.length >= 20); assert.ok(inherited.includes(".github/workflows/reproduce-ffmpeg-nondocker.yml"));
});
test("artifact audit derives the complete ten-edit source and allows only the two new artwork destinations", async () => {
  const publicManifest = JSON.parse(await readFile("public/engines/remux/build-manifest.json"));
  const limits = [{ imported: true, initialPages: 512, maximumPages: 1536, shared: true }];
  const f = { parent, helper, muxerOrderHelper: order, artworkHelper: artwork, compiled: result.generated, publicManifest,
    memoryLimits: limits, publicMemoryLimits: limits, manifest: { ...structuredClone(publicManifest), engine: "within-remux-private-bounded-audio-metadata",
      modules: [structuredClone(publicManifest.modules.find(m => m.name === "within-remux"))],
      audioArtworkOptions: { ...publicManifest.audioArtworkOptions, supportedOutputs: [...publicManifest.audioArtworkOptions.supportedOutputs, "ogg", "opus"] },
      candidate: { allowedSourceEdits: 10, originalMasterSha256: result.parentSha256, parentSha256: result.parentSha256,
        compiledSourceSha256: result.generatedSha256, helperSha256: result.helperSha256, muxerOrderHelperSha256: result.muxerOrderHelperSha256,
        artworkHelperSha256: result.artworkHelperSha256, wasmMemoryLimits: limits, upstreamCommentPatch: { separatelyAudited: true },
        codecSettingsChanged: false, ioChanged: false, memoryLimitsRaised: false, browserFixVerified: false, publicAcceptance: false } } };
  assert.equal(verifyAudioMetadataCore(f).allowedSourceEdits, 10);
  for (const change of [g => { g.manifest.candidate.artworkHelperSha256 = "0".repeat(64); },
    g => { g.artworkHelper += "\nint unrelated;\n"; }, g => { g.manifest.audioArtworkOptions.maximumBytes++; },
    g => { g.manifest.audioArtworkOptions.supportedOutputs.push("m4a"); }, g => { g.manifest.candidate.allowedSourceEdits = 9; }]) {
    const changed = structuredClone(f); change(changed); assert.throws(() => verifyAudioMetadataCore(changed));
  }
});
test("actual native serializer proof is source-pinned, cleans its owned output and cannot imply browser acceptance", async () => {
  const report = JSON.parse(await readFile("outputs/reports/2026-10-25T03-05-03.192Z-audio-ogg-artwork-native.json"));
  assert.equal(report.status, "passed"); assert.equal(report.publicAcceptance, false); assert.equal(report.behavior.browserConversionVerified, false);
  for (const key of ["exactImageBytes", "roleAndUnicodeDescription", "orderedTextDuplicates", "atomicAllocatorFailures", "imageAndDimensionAndEntryBounds"])
    assert.equal(report.behavior[key], true);
  assert.equal(report.behavior.exactMaximumImageBytes, 4194304); assert.equal(report.ownedCompilerOutputAndScratchRemoved, true);
  for (const [file, expected] of Object.entries(report.sources))
    assert.equal(createHash("sha256").update(await readFile(file)).digest("hex"), expected);
});
