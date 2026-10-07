// Tiny deterministic native fixture/independent-validator controls ONLY.
// No browser engine, protected source, production build, or actual converted output.
import assert from "node:assert/strict";
import { execFile } from "node:child_process";
import { createHash } from "node:crypto";
import { createReadStream } from "node:fs";
import { access, readFile, stat, statfs, writeFile } from "node:fs/promises";
import path from "node:path";
import { promisify } from "node:util";
import { createOwnedRuntimeScratch } from "./lib/owned-runtime-scratch.mjs";
import { validateScopedAudioTags } from "./lib/scoped-audio-tag-validation.mjs";

const root = path.resolve(import.meta.dirname, ".."), execute = promisify(execFile);
const reportPath = path.join(root, "evidence/scoped-audio-tag-controls-2026-10-07.json");
await assert.rejects(access(reportPath), { code: "ENOENT" });
const disk = await statfs(root); assert.ok(disk.bavail * disk.bsize >= 8 * 1024 ** 2);
const runtime = await createOwnedRuntimeScratch("scoped-audio-tags-");
const executable = "C:/ffmpeg/bin/ffmpeg.exe", probeExecutable = "C:/ffmpeg/bin/ffprobe.exe";
const commonTags = { title: "Titre café — 音楽", artist: "Émile / कलाकार", album: "Album naïf",
  genre: "Essai", date: "2026", track: "3/9", comment: "αβγ & <texte>" };
const aiffTags = { title: commonTags.title, author: "Auteur Émile",
  comment: commonTags.comment, copyright: "Copyright © 2026" };
const fixtures = [
  { id: "wav", codec: "pcm_s16le", scope: "format", tags: commonTags },
  { id: "flac", codec: "flac", scope: "format", tags: commonTags },
  { id: "opus", codec: "libopus", expectedCodec: "opus", scope: "audio-stream", tags: commonTags },
  { id: "ogg", codec: "libvorbis", expectedCodec: "vorbis", scope: "audio-stream", tags: commonTags },
  { id: "aiff", codec: "pcm_s16be", scope: "format", tags: aiffTags },
];
const native = (file, args) => execute(file, args, { cwd: root, env: runtime.env,
  windowsHide: true, timeout: 30000, maxBuffer: 65536 });
const shaFile = async file => {
  const hash = createHash("sha256");
  for await (const bytes of createReadStream(file, { highWaterMark: 65536 })) hash.update(bytes);
  return hash.digest("hex");
};
const cases = []; let cleanupRemoved = false, ffmpegVersion = null, ffprobeVersion = null;
try {
  ffmpegVersion = (await native(executable, ["-version"])).stdout.split(/\r?\n/)[0];
  ffprobeVersion = (await native(probeExecutable, ["-version"])).stdout.split(/\r?\n/)[0];
  for (const fixture of fixtures) {
    const file = path.join(runtime.directory, `fixture.${fixture.id}`);
    await native(executable, ["-v", "error", "-f", "lavfi", "-i",
      "sine=frequency=997:sample_rate=48000:duration=0.1", "-c:a", fixture.codec, "-threads", "1",
      ...Object.entries(fixture.tags).flatMap(([key, value]) => ["-metadata", `${key}=${value}`]),
      "-fflags", "+bitexact", "-flags:a", "+bitexact", file]);
    const bytes = (await stat(file)).size; assert.ok(bytes > 0 && bytes < 65536);
    const { stdout } = await native(probeExecutable, ["-v", "error", "-show_entries",
      "stream=index,codec_type,codec_name:stream_tags:format=format_name:format_tags", "-of", "json", file]);
    const probe = JSON.parse(stdout);
    assert.equal(probe.streams.length, 1);
    assert.equal(probe.streams[0].codec_name, fixture.expectedCodec ?? fixture.codec);
    const positive = validateScopedAudioTags(probe, fixture.tags, { scope: fixture.scope });
    assert.equal(positive.status, "passed", JSON.stringify(positive));
    const changed = validateScopedAudioTags(probe, { title: "Changed title" }, { scope: fixture.scope });
    assert.equal(changed.status, "failed"); assert.equal(changed.fields[0].status, "changed");
    let wrongScope = null;
    if (fixture.scope === "audio-stream") {
      wrongScope = validateScopedAudioTags(probe, fixture.tags, { scope: "format" });
      assert.equal(wrongScope.status, "failed");
      assert.ok(wrongScope.fields.every(field => field.status === "missing"));
    }
    cases.push({ id: fixture.id, bytes, sha256: await shaFile(file), probe, positive, changed, wrongScope });
  }
} finally {
  await runtime.close(); await assert.rejects(access(runtime.directory), { code: "ENOENT" }); cleanupRemoved = true;
}
const sourcePins = {};
for (const file of ["scripts/check-scoped-audio-tags.mjs", "scripts/lib/scoped-audio-tag-validation.mjs",
  "tests/scoped-audio-tag-validation.test.mjs"])
  sourcePins[file] = createHash("sha256").update(await readFile(path.join(root, file))).digest("hex");
const proof = { recordedAt: new Date().toISOString(), status: "passed-native-validator-controls",
  scope: "Five 0.1-second synthetic native fixtures establish exact FFprobe tag scopes and negative controls, NOT browser conversions",
  ffmpegVersion, ffprobeVersion, cases, sourcePins, runtimeDirectory: runtime.directory,
  ownedScratchAndFixturesRemoved: cleanupRemoved, browserConversionsPerformed: 0,
  protectedSourceRead: false, completeChromiumMemoryAcceptance: false, publicAcceptance: false,
  limitations: ["No audio-engine metadata mapping was changed or certified.",
    "No alias policy, artwork, PCM quality, browser preservation, original-size, speed, or memory acceptance.",
    "Existing nine-route historical browser suite and evidence remain unchanged."] };
const json = JSON.stringify(proof, null, 2) + "\n"; assert.ok(Buffer.byteLength(json) < 65536);
await writeFile(reportPath, json, { flag: "wx" }); console.log(reportPath);
