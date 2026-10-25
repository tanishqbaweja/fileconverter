import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";
import { audioQualityCode, automaticVorbisQualityNotice, OPUS_VORBIS_AUTOMATIC_QUALITY_NOTICE,
  resolveAudioQualityArgument } from "../lib/media-conversion-options.ts";
import { mediaNativeArguments } from "../lib/media-native-arguments.ts";
import { conversionProfiles, publicProfilesFor } from "../lib/capability-registry.ts";

test("only automatic Opus-to-Vorbis native33 uses the previously verified q7 code through the actual ABI", () => {
  assert.deepEqual(resolveAudioQualityArgument("opus-to-ogg", 33, "automatic"),
    { requested: "automatic", nativeCode: 3, automaticPolicy: "opus-to-vorbis-q7" });
  const argument = resolveAudioQualityArgument("opus-to-ogg", 33, "automatic");
  const args = mediaNativeArguments(33, [0, 0, 0], [0, 0, argument.nativeCode], [0, 0, 0, 0, 0], "general-12");
  assert.equal(args.length, 12); assert.equal(args[6], 3); assert.deepEqual(args.slice(0, 6), [33, 0, 0, 0, 0, 0]);
});
test("all explicit qualities, other route/native combinations, and unrelated codec parameters remain unchanged", () => {
  for (const profile of ["opus-to-ogg", "flac-to-ogg", "wav-to-ogg", "ogg-to-opus", "opus-to-flac", "mkv-to-webm", "unknown"]) {
    for (let native = 1; native <= 40; native++) {
      for (const quality of ["automatic", "smaller", "balanced", "higher"]) {
        const actual = resolveAudioQualityArgument(profile, native, quality), changed = profile === "opus-to-ogg" && native === 33 && quality === "automatic";
        assert.equal(actual.nativeCode, changed ? 3 : audioQualityCode(quality));
        assert.equal(actual.automaticPolicy, changed ? "opus-to-vorbis-q7" : null); assert.equal(actual.requested, quality);
      }
    }
  }
});
test("UI discloses the targeted automatic policy and possible size/speed cost without claiming restored source fidelity", async () => {
  assert.equal(automaticVorbisQualityNotice("opus-to-ogg", "automatic"), OPUS_VORBIS_AUTOMATIC_QUALITY_NOTICE);
  assert.match(OPUS_VORBIS_AUTOMATIC_QUALITY_NOTICE, /quality 7/); assert.match(OPUS_VORBIS_AUTOMATIC_QUALITY_NOTICE, /slower.*larger/);
  assert.match(OPUS_VORBIS_AUTOMATIC_QUALITY_NOTICE, /cannot restore source losses/);
  for (const quality of ["smaller", "balanced", "higher"]) assert.equal(automaticVorbisQualityNotice("opus-to-ogg", quality), null);
  assert.equal(automaticVorbisQualityNotice("flac-to-ogg", "automatic"), null);
  const ui = await readFile("app/converter/ConverterApp.tsx", "utf8"), worker = await readFile("workers/media-remux.ts", "utf8");
  assert.match(ui, /data-testid="audio-automatic-quality-notice"/); assert.match(ui, /Automatic \(Vorbis quality 7\)/);
  assert.match(worker, /resolveAudioQualityArgument\(profileId, remuxProfile, audioOptions\?\.quality \?\? "automatic"\)/);
  assert.match(worker, /audioCompressionCode\(audioOptions\?\.compression \?\? "automatic"\), qualityArgument.nativeCode/);
  assert.match(worker, /metrics.audioQualityArgument = qualityArgument/);
  const native = await readFile("media/ffmpeg/within_remux.c", "utf8");
  assert.match(native, /requested_quality == 1 \? 1 : requested_quality == 3 \? 7 : 4/);
});
test("changed automatic route cannot inherit the former q4 public qualification or tested-size claim", () => {
  const profile = conversionProfiles.find(value => value.id === "opus-to-ogg"); assert.ok(profile);
  assert.equal(profile.public, false); assert.equal(profile.automatedTestStatus, "pending"); assert.equal(profile.maxTestedBytes, null);
  assert.equal(publicProfilesFor("opus").some(value => value.id === "opus-to-ogg"), false);
  assert.ok(profile.metadataLimitations.some(value => value.includes("quality 7") && value.includes("pending")));
  assert.equal(conversionProfiles.find(value => value.id === "flac-to-ogg").public, true);
});
test("browser gate requests genuine AUTOMATIC jobs and proves actual call argument, visible disclosure and full control hash", async () => {
  const source = await readFile("scripts/test-audio-metadata-production-runtime.mjs", "utf8");
  assert.match(source, /--vorbis-automatic-quality-repair/);
  assert.match(source, /AUDIO_OGG_ARTWORK_CASES.filter\(value => value.source === "opus"\).map\(value => \(\{ \.\.\.value, quality: "automatic" \}\)\)/);
  assert.match(source, /assert.equal\(state.audioOptions.quality, "automatic"\)/);
  assert.match(source, /assert.deepEqual\(state.metrics.audioQualityArgument, \{ requested: "automatic", nativeCode: 3, automaticPolicy: "opus-to-vorbis-q7" \}\)/);
  assert.match(source, /row.automaticQualityNoticeVisible = true/); assert.match(source, /compareNativeAudioPcm\(input, output/);
  assert.ok(source.includes("4db863292dcd76fbcf364a4986120ac9bc39d155a774d730376128058565f4db"));
});
