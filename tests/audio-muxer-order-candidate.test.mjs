import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";
import { makeAudioCommentWrapperCandidate } from "../media/ffmpeg/audio-comment-wrapper-candidate.mjs";
import { makeAudioMuxerOrderCandidate } from "../media/ffmpeg/audio-muxer-order-candidate.mjs";
import { makeAudioRepeatedCommentBuildRecipe } from "../media/ffmpeg/audio-repeated-comment-build-recipe.mjs";
import { verifyAudioMetadataCore } from "../scripts/lib/audio-metadata-artifact.mjs";
const parent = await readFile("media/ffmpeg/within_remux.c", "utf8"), helper = await readFile("media/ffmpeg/audio-text-metadata.h", "utf8");
const orderHelper = await readFile("media/ffmpeg/audio-muxer-metadata-order.h", "utf8"), result = makeAudioMuxerOrderCandidate(parent, helper, orderHelper);
test("muxer-order candidate contains exactly the four previous edits plus helper and FLAC-only pre-header call, all reversible", () => {
  const base = makeAudioCommentWrapperCandidate(parent, helper); assert.equal(result.allowedSourceEdits, 6); assert.equal(result.fourEditSourceSha256, base.generatedSha256);
  let reversed = result.generated; for (const [before, after] of result.extraEdits.toReversed()) reversed = reversed.replace(after, before);
  assert.equal(reversed, base.generated); assert.match(result.extraEdits[1][1], /if \(flac_output\)/);
  assert.match(result.extraEdits[1][1], /if \(result < 0\) \{[\s\S]*goto cleanup/);
  assert.equal(result.codecSettingsChanged, false); assert.equal(result.memoryLimitsRaised, false); assert.equal(result.browserFixVerified, false);
});
test("private compile orders three wrapper generators before linking and retains old defaults for other recipe callers", async () => {
  const recipe = await readFile("media/ffmpeg/reproduce-nondocker.sh", "utf8");
  const r = makeAudioRepeatedCommentBuildRecipe(recipe, { preserveStreamComments: true, preserveMuxerOrder: true });
  const markers = ["make-audio-text-metadata-candidate.mjs", "make-audio-comment-wrapper-candidate.mjs", "make-audio-muxer-order-candidate.mjs", 'cp -- "${BUILD_ROOT}/within_remux.metadata.c" "${BUILD_ROOT}/within_remux.c"', "WITHIN_BUILD_CORE_FILTER=within-remux ./build-remux.sh"];
  const positions = markers.map(marker => r.generated.indexOf(marker)); assert.ok(positions.every(p => p > 0));
  assert.deepEqual(positions, positions.toSorted((a, b) => a - b));
  assert.doesNotMatch(makeAudioRepeatedCommentBuildRecipe(recipe).generated, /make-audio-muxer-order-candidate/);
  assert.throws(() => makeAudioRepeatedCommentBuildRecipe(recipe, { preserveMuxerOrder: true }));
});
test("six-edit audit authenticates helper and full compiled source, not just metadata flags or self-signed claims", async () => {
  const publicManifest = JSON.parse(await readFile("public/engines/remux/build-manifest.json"));
  const limits = [{ imported: true, initialPages: 512, maximumPages: 1536, shared: true }];
  const f = { parent, helper, muxerOrderHelper: orderHelper, compiled: result.generated, publicManifest, memoryLimits: limits, publicMemoryLimits: limits,
    manifest: { ...structuredClone(publicManifest), engine: "within-remux-private-bounded-audio-metadata",
      modules: [structuredClone(publicManifest.modules.find(m => m.name === "within-remux"))], candidate: {
        allowedSourceEdits: 6, originalMasterSha256: result.parentSha256, parentSha256: result.parentSha256,
        compiledSourceSha256: result.generatedSha256, helperSha256: result.helperSha256, muxerOrderHelperSha256: result.muxerOrderHelperSha256,
        wasmMemoryLimits: limits, upstreamCommentPatch: { separatelyAudited: true }, codecSettingsChanged: false, ioChanged: false,
        memoryLimitsRaised: false, browserFixVerified: false, publicAcceptance: false } } };
  assert.equal(verifyAudioMetadataCore(f).allowedSourceEdits, 6);
  for (const mutate of [g => { g.manifest.candidate.muxerOrderHelperSha256 = "0".repeat(64); },
    g => { g.muxerOrderHelper += "\nint unrelated;\n"; }, g => { g.manifest.candidate.allowedSourceEdits = 5; }]) {
    const next = structuredClone(f); mutate(next); assert.throws(() => verifyAudioMetadataCore(next));
  }
});
