// Actual source extraction in Node, with FFmpeg only generating and validating fixtures.
import "./lib/hidden-unit-subprocesses.mjs";
import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { createHash } from "node:crypto";
import { lstat, open, readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import { createOwnedRuntimeScratch } from "./lib/owned-runtime-scratch.mjs";
import { runIsoTimedTextToWebVtt } from "../workers/iso-timed-text-webvtt.ts";
import { loadTimedTextWorkerControl } from "./lib/iso-timed-text-worker-control.mjs";
import { inspectMediaSource } from "../lib/media-source-inspection.ts";
import { timedTextTrackChoices } from "../lib/timed-text-qualification.ts";

const ffmpeg = process.env.WITHIN_FFMPEG_EXECUTABLE ?? "ffmpeg";
const ffprobe = process.env.WITHIN_FFPROBE_EXECUTABLE ?? "ffprobe";
const repo = path.resolve(import.meta.dirname, "..");
const integrated = process.argv[2] === "--worker-integration";
assert.equal(process.argv.length, integrated ? 3 : 2);
const worker = integrated ? await loadTimedTextWorkerControl(repo) : null;
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
  // FFmpeg may wrap a generated cue in default srt font tags. Compare the
  // text/timing layer only, without stripping arbitrary cue markup.
  const plain = payload.join("\n").replace(/<\/?font(?: (?:face|size|color)="(?:Serif|18|0|#000000)")*>/g, "");
  return { timing: timing.replaceAll(",", "."), text: plain };
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
    if (worker) {
      const stat = await lstat(input);
      assert.ok(stat.isFile() && stat.size <= 1_048_576);
      const file = new File([await readFile(input)], "static-generated." + format);
      const inspection = await inspectMediaSource(file, format);
      const choices = timedTextTrackChoices(inspection?.streams ?? []);
      assert.deepEqual(choices.map(choice => choice.id), streams.map(stream => Number(stream.id)));
      const request = { file, format, trackId: choices[1].id };
      const successful = await worker(request);
      assert.equal(successful.terminal.type, "complete");
      assert.deepEqual(parseVtt(successful.committed), proof);
      assert.deepEqual([successful.opened, successful.closed, successful.aborted], [1, 1, 0]);
      const metrics = successful.terminal.metrics;
      assert.equal(metrics.outputBytes, successful.committed.length);
      assert.ok(metrics.inputBytes < 4096);
      assert.ok(metrics.maxReadChunkBytes <= 131072 && metrics.maxWriteChunkBytes <= 65536);
      assert.equal(metrics.peakPendingOperations, 1);
      const adverse = [];
      if (format === "mp4") {
        for (const [kind, changes, expectedType, opened, aborted] of [
          ["remote-origin", { hostname: "example.invalid" }, "error", 0, 0],
          ["missing-track", { trackId: undefined }, "error", 0, 0],
          ["unknown-track", { trackId: 99999 }, "error", 1, 1],
          ["destination-fault", { fault: "write" }, "error", 1, 1],
          ["cancel-after-actual-write-to-double", { cancel: true }, "cancelled", 1, 1],
        ]) {
          const stopped = await worker({ ...request, ...changes });
          assert.equal(stopped.terminal.type, expectedType, kind);
          assert.deepEqual([stopped.opened, stopped.closed, stopped.aborted], [opened, 0, aborted], kind);
          assert.equal(stopped.previousUnchanged, true, kind);
          assert.equal(stopped.terminal.metrics.pendingOperations, 0);
          if (kind === "destination-fault" || kind.startsWith("cancel")) assert.equal(stopped.writes, 1);
          adverse.push({ kind, ...stopped, committed: undefined, errorMessage: stopped.terminal.message,
            terminal: stopped.terminal.type });
        }
        const recovery = await worker(request);
        assert.equal(recovery.terminal.type, "complete");
        assert.equal(sha(recovery.committed), sha(successful.committed));
        adverse.push({ kind: "same-worker-exact-recovery", sha256: sha(recovery.committed), terminal: recovery.terminal.type });
      }
      cases.push({ format, fileBytes: stat.size, sourcePanelOfferedTrackIds: choices.map(choice => choice.id), selectedTrackId: id, outputBytes: successful.committed.length,
        outputSha256: sha(successful.committed), exactNativeCueComparison: true, metrics, adverse });
      continue;
    }
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
console.log(JSON.stringify({ version, cases, browserLaunched: false,
  ...(integrated ? { privateWorkerDispatchVerifiedInNode: true, destinationBackend: "transactional test double, no browser storage" }
    : { productRouteRegistered: false }),
  scratchRemoved: true, playerRenderingVerified: false }, null, 2));
