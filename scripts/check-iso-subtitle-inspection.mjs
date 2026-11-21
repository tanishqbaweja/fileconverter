// Native tools create and independently probe tiny test inputs. They never
// implement a user conversion or serve as production-browser qualification.
import "./lib/hidden-unit-subprocesses.mjs";
import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { createHash } from "node:crypto";
import { lstat, readFile } from "node:fs/promises";
import path from "node:path";
import { conversionProfiles } from "../lib/capability-registry.ts";
import { inspectMediaSource } from "../lib/media-source-inspection.ts";
import { planMediaConversion } from "../lib/media-conversion-plan.ts";
import { createOwnedRuntimeScratch } from "./lib/owned-runtime-scratch.mjs";

const root = path.resolve(import.meta.dirname, "..");
const runtime = await createOwnedRuntimeScratch("iso-subtitle-inspection-");
const ffmpeg = process.env.WITHIN_FFMPEG_EXECUTABLE ?? "ffmpeg";
const ffprobe = process.env.WITHIN_FFPROBE_EXECUTABLE ?? "ffprobe";
const source = path.join(root, "fixtures/media/quicktime-source.mov");
const sha = bytes => createHash("sha256").update(bytes).digest("hex");
const results = [];
const run = (exe, args, input) => {
  const cmd = spawnSync(exe, args, { cwd: root, env: runtime.env, input, windowsHide: true,
    encoding: "utf8", timeout: 15_000, maxBuffer: 262_144 });
  if (cmd.error) throw cmd.error;
  assert.equal(cmd.status, 0, cmd.stderr);
  return cmd.stdout;
};
const profile = id => {
  const match = conversionProfiles.find(profile => profile.id === id);
  assert.ok(match, id);
  return match;
};
let nativeVersion;
try {
  nativeVersion = run(ffprobe, ["-version"]).split(/\r?\n/)[0];
  for (const [format, suffix] of [["mp4", ".mp4"], ["mov", ".mov"], ["3gp", ".3gp"]]) {
    const file = path.join(runtime.directory, "synthetic-language-tracks" + suffix);
    run(ffmpeg, ["-hide_banner", "-loglevel", "error", "-n", "-i", source, "-f", "srt", "-i", "pipe:0",
      "-map", "0:v:0", "-map", "0:a:0", "-map", "1:s:0", "-map", "1:s:0",
      "-map_metadata", "-1", "-map_chapters", "-1", "-c:v", "copy", "-c:a", "copy", "-c:s", "mov_text",
      "-tag:s:0", "tx3g", "-tag:s:1", "tx3g", "-metadata:s:s:0", "language=fra", "-metadata:s:s:1", "language=spa",
      "-t", "0.800", "-movflags", "+faststart", file], "1\n00:00:00,100 --> 00:00:00,600\nKnown text cue\n\n");
    const desc = JSON.parse(run(ffprobe, ["-v", "error", "-show_entries",
      "stream=index,codec_name,codec_type,codec_tag_string:stream_tags=language", "-of", "json", file]));
    const expected = desc.streams.filter(stream => stream.codec_type === "subtitle");
    assert.equal(expected.length, 2);
    assert.ok(expected.every(stream => stream.codec_name === "mov_text" && stream.codec_tag_string === "tx3g"));
    assert.deepEqual(expected.map(track => track.tags?.language), ["fra", "spa"]);
    const payload = run(ffprobe, ["-v", "error", "-select_streams", "s", "-show_packets", "-show_entries",
      "packet=stream_index,pts_time,size", "-of", "json", file]);
    const subtitlePackets = JSON.parse(payload).packets;
    assert.ok(expected.every(track => subtitlePackets.some(packet => packet.stream_index === track.index && +packet.size > 2)));

    const stat = await lstat(file);
    assert.ok(stat.isFile() && stat.size <= 524_288);
    const bytes = await readFile(file);
    const input = new Blob([bytes]), reads = [];
    const inspection = await inspectMediaSource({ size: input.size, slice(start, end) {
      reads.push([start, end]); return input.slice(start, end);
    } }, format);
    assert.deepEqual(inspection.streams.map(stream => stream.mediaType), ["video", "audio", "subtitle", "subtitle"]);
    const subtitles = inspection.streams.filter(stream => stream.mediaType === "subtitle");
    // FFprobe normalizes legacy QuickTime codes to ISO 639-2. The source
    // inspector spells the same legacy values as BCP 47 two-letter tags.
    assert.deepEqual(subtitles.map(track => track.languageTag), format === "mov" ? ["fr", "es"] : ["fra", "spa"]);
    assert.ok(subtitles.every(track => track.isoSubtitleSampleEntry === "tx3g"));
    assert.equal(inspection.inspectedBytes, reads.reduce((sum, [start, end]) => sum + end - start, 0));
    assert.ok(inspection.inspectedBytes < 4096);
    const plans = {};
    for (const output of ["mkv", "mpeg-ts", "flv"]) {
      const plan = planMediaConversion(profile(format + "-to-" + output), inspection);
      const subtitleAction = output === "mkv" ? "reject" : "exclude";
      assert.deepEqual(plan.streams.map(stream => stream.action), ["copy", "copy", subtitleAction, subtitleAction]);
      assert.equal(plan.blockingReasons.length, output === "mkv" ? 2 : 0);
      plans[output] = plan.streams.map(stream => stream.action);
    }
    results.push({ format, bytes: bytes.length, sha256: sha(bytes), inspectedBytes: inspection.inspectedBytes,
      nativeStreams: desc.streams, nonemptySubtitlePackets: subtitlePackets.filter(packet => +packet.size > 2).length,
      subtitleLanguages: subtitles.map(track => track.languageTag), plans });
  }
} finally { await runtime.close(); }
await assert.rejects(lstat(runtime.directory), { code: "ENOENT" });
console.log(JSON.stringify({ nativeVersion, results, browserLaunched: false,
  nativeToolsUsedForFixtureGenerationAndProbeOnly: true, ownedScratchRemoved: true }, null, 2));
