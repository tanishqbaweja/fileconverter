import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";
import { makeMp3InputGainCandidate, MP3_GAIN_PARENT_SHA256, MP3_GAIN_ARCHIVE_SHA256 } from "../media/ffmpeg/mp3-input-gain-candidate.mjs";
import { makeMp3InputGainBuildRecipe } from "../media/ffmpeg/mp3-input-gain-build-recipe.mjs";
import { makeAudioOggArtworkBuildRecipe } from "../media/ffmpeg/audio-ogg-artwork-build-recipe.mjs";
import { makeMp3InputGainBuildWorkflow } from "../scripts/lib/mp3-input-gain-build-workflow.mjs";
import { makeAudioOggArtworkBuildWorkflow } from "../scripts/lib/audio-ogg-artwork-build-workflow.mjs";
import { verifyAudioMetadataCore } from "../scripts/lib/audio-metadata-artifact.mjs";
test("private input-gain policy only permits exact checksum-audited LAME4.0 source, never arbitrary parent or dependency versions", async () => {
  const prior = JSON.parse(await readFile("evidence/2026-10-26T02-06-26.597Z-lame-scale-source-audit.json"));
  assert.equal(MP3_GAIN_ARCHIVE_SHA256, prior.archive.sha256);
  assert.equal(MP3_GAIN_PARENT_SHA256, prior.files.find(file => file.file === "libmp3lame/presets.c").sha256);
  assert.throws(() => makeMp3InputGainCandidate("fake", { sourceArchiveSha256: MP3_GAIN_ARCHIVE_SHA256 }));
  assert.throws(() => makeMp3InputGainCandidate("fake", { sourceArchiveSha256: "0".repeat(64) }));
  const source = await readFile("media/ffmpeg/mp3-input-gain-candidate.mjs", "utf8");
  assert.match(source, /lame_set_scale\(gfp, lame_get_scale\(gfp\) \* abr_switch_map\[r\].scale\)/);
  assert.match(source, /generated.replace\(after, before\), source/); assert.match(source, /sourceEdits: 1/);
  assert.match(source, /codecSettingsChanged: true/); assert.match(source, /clippingAcceptance: false/);
});
test("private recipe adds only authenticated LAME prebuild patch; original SDK/codec flags, bounded I/O/heap and metadata wrapper remain exact", async () => {
  const source = await readFile("media/ffmpeg/reproduce-nondocker.sh", "utf8"), base = makeAudioOggArtworkBuildRecipe(source), recipe = makeMp3InputGainBuildRecipe(source);
  const insert = 'node "${SCRIPT_DIR}/make-mp3-input-gain-candidate.mjs" "${BUILD_ROOT}/lame/libmp3lame/presets.c" "${OUTPUT_ROOT}"\n';
  assert.equal(recipe.generated.split(insert).length, 2); assert.equal(recipe.generated.replace(insert, ""), base.generated);
  assert.equal(recipe.codecSettingsChanged, true); assert.equal(recipe.bitRateAndQualityUnchanged, true);
  assert.equal(recipe.memoryLimitsRaised, false); assert.equal(recipe.publicAcceptance, false);
});
test("isolated workflow changes only private builder and retains all three authenticated LAME source artifacts for independent audit", async () => {
  const original = await readFile(".github/workflows/reproduce-ffmpeg-nondocker.yml", "utf8"), base = makeAudioOggArtworkBuildWorkflow(original), workflow = makeMp3InputGainBuildWorkflow(original);
  let reversed = workflow.generated.replace("node media/ffmpeg/build-mp3-input-gain-candidate.mjs", "node media/ffmpeg/build-audio-ogg-artwork-candidate.mjs");
  for (const name of ["lame-presets.parent.c", "lame-presets.input-gain.c", "mp3-input-gain-source.json"])
    reversed = reversed.replace("            work/ffmpeg-nondocker-output/" + name + "\n", "");
  assert.equal(reversed, base.generated); assert.equal(workflow.publicAcceptance, false);
  assert.match(workflow.generated, /retention-days: 1/); assert.match(workflow.generated, /Remove repository-local build data/);
});
test("artifact auditor cannot accept codec-policy changes without exact independent LAME proof, and legacy candidates still require false", () => {
  const candidate = { codecSettingsChanged: true, ioChanged: false, memoryLimitsRaised: false, browserFixVerified: false, publicAcceptance: false };
  assert.throws(() => verifyAudioMetadataCore({ manifest: { engine: "within-remux-private-bounded-audio-metadata", candidate } }), /independently authenticated/);
  assert.throws(() => verifyAudioMetadataCore({ manifest: { engine: "within-remux-private-bounded-audio-metadata",
    lameSourceSha256: MP3_GAIN_ARCHIVE_SHA256, mp3InputGainPolicy: "preserve-caller-input-scale-without-preset-attenuation",
    candidate: { ...candidate, allowedSourceEdits: 10, upstreamLameGainPatch: {} } }, lameParent: "fake", lameCompiled: "fake", lameReceipt: {} }));
});
