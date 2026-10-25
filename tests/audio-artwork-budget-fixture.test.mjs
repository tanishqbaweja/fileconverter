import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";
import { validateAudioArtworkPacket, validateBudgetedAudioArtworkPacket } from "../scripts/lib/audio-artwork-validation.mjs";
const expected = { codec: "png", width: 1023, height: 1023, bytes: 4194304, sha256: "a".repeat(64), pictureRole: "Cover (front)", description: "café 音楽" };
const probe = { streams: [{ index: 0, codec_type: "audio" }, { index: 1, codec_type: "video", codec_name: "png", width: 1023, height: 1023,
  disposition: { attached_pic: 1 }, tags: { comment: expected.pictureRole, title: expected.description } }] };
const packets = { packets: [{ stream_index: 1, size: "4194304", data_hash: "SHA256:" + expected.sha256 }] };
test("only the explicit budget validator accepts4MiB/1023x1023; old small-image policy and all hard maximums remain strict", () => {
  assert.equal(validateBudgetedAudioArtworkPacket(probe, packets, expected).status, "passed-exact-cover-packet");
  assert.throws(() => validateAudioArtworkPacket(probe, packets, expected));
  for (const changed of [{ ...expected, bytes: 4194305 }, { ...expected, width: 4097 }, { ...expected, height: 0 }, { ...expected, codec: "gif" }])
    assert.throws(() => validateBudgetedAudioArtworkPacket(probe, packets, changed));
});
test("maximum-artwork input recipe is deterministic, hash-pinned, scoped to owned work and never overwrites", async () => {
  const source = await readFile("scripts/lib/audio-artwork-budget-fixture.mjs", "utf8");
  assert.match(source, /path.relative\(path.join\(root, "work"\), directory\)/);
  assert.match(source, /sourceInfo.size === 37086/); assert.match(source, /bceca191b7b40164857884b4c95ac5b2b78e0c4969f3fad391b7c421adcc36bc/);
  assert.match(source, /maximumBytes = 4194304/); assert.match(source, /width = 1023, height = 1023/);
  assert.match(source, /state = 0x6d2b79f5/); assert.match(source, /paddingBytes < 65536/);
  assert.match(source, /82018fd4354618bc019a1ca8ab9b4195b56ed477f976f6337b6d7e53cbcaf37f/);
  assert.match(source, /4355f9c1980ad3aaf1f077d06e2b06e4d2c70f3d22143d6ed8e210203c7495ba/);
  assert.equal(source.match(/flag: "wx"/g).length, 2); assert.doesNotMatch(source, /test\.mkv|\brm\(|\bspawn\(/);
});
test("one new browser byte-boundary gate retains full pipeline and validates decoded pixels plus streaming picture bytes", async () => {
  const source = await readFile("scripts/test-audio-metadata-production-runtime.mjs", "utf8");
  assert.match(source, /--artwork-byte-budget/); assert.match(source, /artworkBudget \? \[\{ source: "flac", destination: "opus", repeated: true, artwork: "png-budget" \}\]/);
  assert.match(source, /artworkBudget \? 8 \* 1048576 : 1048576/);
  assert.match(source, /file.slice\(offset, offset \+ count\).arrayBuffer\(\)/); assert.doesNotMatch(source, /file.arrayBuffer\(\)/);
  assert.match(source, /"-pix_fmt", "rgba", "-threads", "1", "-f", "hash"/);
  assert.match(source, /artworkBudget \? await readOggPictureComments\(output, conversion.destination\)/);
  assert.match(source, /assert.equal\(comments.pictures\[0\].sha256, expected.sha256\)/);
  assert.match(source, /active.peak.privateBytes - report.blankBaseline.privateBytes/); assert.match(source, /await runtime.close\(\)/);
});
