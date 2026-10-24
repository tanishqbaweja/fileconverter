import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";
import { makeAudioRepeatedCommentCandidate, AUDIO_COMMENT_FFMPEG_ARCHIVE_SHA256 } from "../media/ffmpeg/audio-repeated-comment-candidate.mjs";
import { makeAudioRepeatedCommentBuildRecipe } from "../media/ffmpeg/audio-repeated-comment-build-recipe.mjs";
import { makeAudioRepeatedCommentBuildWorkflow } from "../scripts/lib/audio-repeated-comment-build-workflow.mjs";
import { verifyAudioRepeatedCommentSource } from "../scripts/lib/audio-metadata-artifact.mjs";
const original = `static int vorbis_parse_single_comment(void) {
    } else if (!ogm_chapter(as, t, v)) {
        (*updates)++;
        if (av_dict_get(*m, t, NULL, 0))
            av_dict_set(m, t, ";", AV_DICT_APPEND);
        av_dict_set(m, t, v, AV_DICT_APPEND);
    }
end:
    t[tl] = '=';
    v[vl] = backup;
    return 0;
}
int ff_vorbis_comment(void) { return 0; }
`;
test("single upstream metadata patch is reversible, preserves distinct repeated values and restores input on allocation failure", () => {
  const r = makeAudioRepeatedCommentCandidate(original, { sourceArchiveSha256: AUDIO_COMMENT_FFMPEG_ARCHIVE_SHA256 });
  assert.equal(r.edits.length, 1); assert.equal(r.generated.replace(r.edits[0][1], r.edits[0][0]), original);
  assert.match(r.generated, /av_dict_set\(m, t, v, AV_DICT_MULTIKEY\)/); assert.doesNotMatch(r.generated, /AV_DICT_APPEND/);
  assert.match(r.generated, /if \(result < 0\) \{\s*t\[tl\] = '=';\s*v\[vl\] = backup;\s*return result;/);
  assert.equal(r.codecSettingsChanged, false); assert.equal(r.ioChanged, false); assert.equal(r.browserFixVerified, false);
  assert.throws(() => makeAudioRepeatedCommentCandidate(original));
  assert.throws(() => makeAudioRepeatedCommentCandidate(original.replace("AV_DICT_APPEND", "different"), { sourceArchiveSha256: AUDIO_COMMENT_FFMPEG_ARCHIVE_SHA256 }));
});
test("private derivative patches authenticated dependency source BEFORE compilation without changing old recipe or codec/heap flags", async () => {
  const source = await readFile(new URL("../media/ffmpeg/reproduce-nondocker.sh", import.meta.url), "utf8"), r = makeAudioRepeatedCommentBuildRecipe(source);
  assert.equal(r.extraEdits.length, 1); assert.equal(r.compiledBeforeLibraryBuild, true); assert.equal(r.codecSettingsChanged, false);
  const patchAt = r.generated.indexOf('make-audio-repeated-comment-candidate.mjs');
  assert.ok(patchAt > r.generated.indexOf('patch --directory="${BUILD_ROOT}/ffmpeg" --strip=1 < amr-bounded-packets.patch'));
  assert.ok(patchAt < r.generated.indexOf('\n./build-libraries.sh\n'));
  assert.equal(r.publicAcceptance, false);
});
test("isolated workflow selects changed builder and retains exact upstream preimage, compiled source and receipt", async () => {
  const source = await readFile(new URL("../.github/workflows/reproduce-ffmpeg-nondocker.yml", import.meta.url), "utf8");
  const result = makeAudioRepeatedCommentBuildWorkflow(source);
  assert.match(result.generated, /node media\/ffmpeg\/build-audio-repeated-metadata-candidate.mjs/);
  for (const name of ["oggparsevorbis.parent.c", "oggparsevorbis.repeated.c", "audio-repeated-comment-source.json"])
    assert.ok(result.generated.includes("work/ffmpeg-nondocker-output/" + name));
  assert.equal(result.originalSdkDependencyAndCleanupStepsRetained, true); assert.equal(result.publicAcceptance, false);
});
test("upstream audit derives exact patch and rejects re-signed unrelated edits, missing or changed receipts and unpinned archives", () => {
  const derived = makeAudioRepeatedCommentCandidate(original, { sourceArchiveSha256: AUDIO_COMMENT_FFMPEG_ARCHIVE_SHA256 });
  const { generated, edits, ...fields } = derived, receipt = { ...fields, sourceEdits: edits.length };
  const fixture = { parent: original, compiled: generated, receipt, manifestReceipt: structuredClone(receipt), archiveSha256: AUDIO_COMMENT_FFMPEG_ARCHIVE_SHA256 };
  assert.equal(verifyAudioRepeatedCommentSource(fixture).sourceEdits, 1);
  for (const change of [f => { f.compiled += "\nint unrelated;\n"; }, f => { f.receipt.sourceEdits++; },
    f => { f.manifestReceipt.publicAcceptance = true; }, f => { f.archiveSha256 = "0".repeat(64); }]) {
    const f = structuredClone(fixture); change(f); assert.throws(() => verifyAudioRepeatedCommentSource(f));
  }
});
