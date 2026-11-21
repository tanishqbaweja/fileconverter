// Actual source extraction in Node, with FFmpeg only generating and validating fixtures.
import "./lib/hidden-unit-subprocesses.mjs";
import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { createHash } from "node:crypto";
import { lstat, open, writeFile } from "node:fs/promises";
import path from "node:path";
import { createOwnedRuntimeScratch } from "./lib/owned-runtime-scratch.mjs";
import { runIsoTimedTextToWebVtt } from "../workers/iso-timed-text-webvtt.ts";

const ffmpeg = process.env.WITHIN_FFMPEG_EXECUTABLE ?? "ffmpeg";
const ffprobe = process.env.WITHIN_FFPROBE_EXECUTABLE ?? "ffprobe";
const repo = path.resolve(import.meta.dirname, "..");
const source = path.join(repo, "fixtures/media/quicktime-source.mov");
const scratch = await createOwnedRuntimeScratch("timed-text-vtt-preflight-");
const sha = bytes => createHash("sha256").update(bytes).digest("hex");
const cueText = "1\n00:00:00,100 --> 00:00:00,500\nPremière ligne 世界\nSecond line 😀\n\n2\n00:00:00,900 --> 00:00:01,300\nNext & cue\n\n";
const run = (cmd, args, input) => {
  const child = spawnSync(cmd, args, { cwd: repo, env: scratch.env, input, encoding: "utf8",
    windowsHide: true, timeout: 20_000, maxBuffer: 65_536 });
  if (child.error) throw child.error;
  assert.equal(child.status, 0, child.stderr);
  return child.stdout;
};
const parseNativeSrt = text => text.trim().split(/\r?\n\r?\n/).map(block => {
  const [id, timing, ...payload] = block.split(/\r?\n/);
  assert.match(id, /^\d+$/);
  assert.match(timing, /^\d\d:\d\d:\d\d,\d{3} --> \d\d:\d\d:\d\d,\d{3}$/);
  return { timing: timing.replaceAll(",", "."), text: payload.join("\n") };
});
const parseVtt = bytes => {
  const text = new TextDecoder("utf-8", { fatal: true }).decode(bytes);
  assert.ok(text.startsWith("WEBVTT\n\n") && text.endsWith("\n\n"));
  return text.slice(8, -2).split("\n\n").map(block => {
    const [timing, ...payload] = block.split("\n");
    assert.match(timing, /^\d\d:\d\d:\d\d\.\d{3} --> \d\d:\d\d:\d\d\.\d{3}$/);
    return { timing, text: payload.join("\n").replaceAll("&lt;", "<").replaceAll("&gt;", ">").replaceAll("&amp;", "&") };
  });
};
const cases = [];
let version;
try {
  version = run(ffprobe, ["-version"]).split(/\r?\n/)[0];
  const decoy = path.join(scratch.directory, "first-track-only.srt");
  await writeFile(decoy, "1\n00:00:00,150 --> 00:00:00,450\nUnselected first track\n\n", { flag: "wx" });
  for (const format of ["mp4", "mov", "3gp"]) {
    const input = path.join(scratch.directory, "static-generated." + format);
    run(ffmpeg, ["-hide_banner", "-loglevel", "error", "-n", "-i", source, "-f", "srt", "-i", decoy, "-f", "srt", "-i", "pipe:0",
      "-map", "0:v:0", "-map", "0:a:0", "-map", "1:s:0", "-map", "2:s:0", "-map_chapters", "-1",
      "-map_metadata", "-1", "-c:v", "copy", "-c:a", "copy", "-c:s", "mov_text",
      "-tag:s:0", "tx3g", "-tag:s:1", "tx3g", "-metadata:s:s:0", "language=fra", "-metadata:s:s:1", "language=spa",
      "-t", "1.500", "-movflags", "+faststart", input], cueText);
    const streams = JSON.parse(run(ffprobe, ["-v", "error", "-select_streams", "s", "-show_entries",
      "stream=index,codec_name,id:stream_tags=language", "-of", "json", input])).streams;
    assert.equal(streams.length, 2);
    assert.ok(streams.every(stream => stream.codec_name === "mov_text"));
    const id = Number(streams[1].id);
    const other = parseNativeSrt(run(ffmpeg, ["-hide_banner", "-loglevel", "error", "-i", input, "-map", "0:s:0", "-c:s", "srt", "-f", "srt", "pipe:1"]));
    assert.deepEqual(other, [{ timing: "00:00:00.150 --> 00:00:00.450", text: "Unselected first track" }]);
    const proof = parseNativeSrt(run(ffmpeg, ["-hide_banner", "-loglevel", "error", "-i", input, "-map", "0:s:1", "-c:s", "srt", "-f", "srt", "pipe:1"]));
    assert.deepEqual(proof, [
      { timing: "00:00:00.100 --> 00:00:00.500", text: "Première ligne 世界\nSecond line 😀" },
      { timing: "00:00:00.900 --> 00:00:01.300", text: "Next & cue" },
    ]);
    const file = await open(input, "r");
    try {
      const stat = await file.stat(), chunks = [], warnings = [];
      let reads = 0, maxRead = 0, readBytes = 0, pending = 0, peakPending = 0, maxWrite = 0, selectedBytes = 0;
      assert.ok(stat.size <= 1_048_576);
      const selected = await runIsoTimedTextToWebVtt({
        size: stat.size, assertActive() {}, warn(message) { warnings.push(message); },
        async read(at, length) {
          const bytes = new Uint8Array(length);
          assert.equal((await file.read(bytes, 0, length, at)).bytesRead, length);
          reads++; maxRead = Math.max(maxRead, length); readBytes += length;
          return bytes;
        },
        async write(bytes) {
          peakPending = Math.max(peakPending, ++pending);
          assert.equal(pending, 1);
          maxWrite = Math.max(maxWrite, bytes.length);
          selectedBytes += bytes.length;
          assert.ok(selectedBytes <= 65_536);
          chunks.push(Buffer.from(bytes));
          await new Promise(resolve => setImmediate(resolve));
          pending--;
        },
      }, id);
      const output = Buffer.concat(chunks);
      assert.deepEqual(parseVtt(output), proof);
      assert.equal(selected.cues, 2);
      assert.equal(selected.trackId, id);
      assert.equal(warnings.length, 1);
      cases.push({ format, fileBytes: stat.size, selected, outputBytes: output.length, outputSha256: sha(output),
        comparedCueTextAndTimeExactly: true, reads, readBytes, maxRead, maxWrite, peakPending });
    } finally { await file.close(); }
  }
} finally { await scratch.close(); }
await assert.rejects(lstat(scratch.directory), { code: "ENOENT" });
console.log(JSON.stringify({ version, cases, browserLaunched: false, productRouteRegistered: false,
  scratchRemoved: true, playerRenderingVerified: false }, null, 2));
