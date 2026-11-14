// Native tools generate a reusable SOURCE only. Browser conversions are separate.
import assert from "node:assert/strict";
import { execFile } from "node:child_process";
import { promisify } from "node:util";
import { createReadStream, constants } from "node:fs";
import { access, copyFile, lstat, rm, writeFile } from "node:fs/promises";
import { createHash } from "node:crypto";
import path from "node:path";
import { createOwnedRuntimeScratch } from "./lib/owned-runtime-scratch.mjs";
import { complexMkvFixture } from "./lib/mkv-complex-fidelity.mjs";

assert.equal(process.argv.length, 2);
const root = path.resolve(import.meta.dirname, ".."), execute = promisify(execFile);
const final = path.join(root, "fixtures/media/within-test-h264-bframes.mkv"), manifest = final + ".json";
for (const file of [final, manifest]) await assert.rejects(access(file), { code: "ENOENT" });
const sha = async file => { const h = createHash("sha256"); for await (const b of createReadStream(file, { highWaterMark: 262144 })) h.update(b); return h.digest("hex"); };
const source = path.join(root, complexMkvFixture.file);
assert.equal(await sha(source), complexMkvFixture.sha256);
const runtime = await createOwnedRuntimeScratch("h264-bframe-fixture-");
const run = async (tool, args) => (await execute(`C:/ffmpeg/bin/${tool}.exe`, args,
  { cwd: root, env: runtime.env, windowsHide: true, timeout: 90000, maxBuffer: 2097152 })).stdout.trim();
let created = null, retained = false;
try {
  const files = [1, 2].map(n => path.join(runtime.directory, `fixture-${n}.mkv`));
  const argumentsFor = file => ["-v", "error", "-n", "-copyts", "-noautorotate", "-i", source,
    "-map", "0", "-map_metadata", "0", "-map_chapters", "0", "-c", "copy", "-c:v", "libx264",
    "-preset", "medium", "-crf", "12", "-bf", "2", "-g", "48", "-x264-params", "threads=1:b-adapt=0:scenecut=0",
    "-fps_mode", "passthrough", "-avoid_negative_ts", "disabled", "-fflags", "+bitexact", file];
  for (const file of files) {
    const encoded = file + ".encoded.mkv";
    await run("ffmpeg", argumentsFor(encoded));
    // libx264 does not carry display-matrix side data through encoding. Restore
    // the source orientation in a copy-only fixture mux, never rotate pixels.
    await run("ffmpeg", ["-v", "error", "-n", "-copyts", "-display_rotation:v:0", "90", "-i", encoded,
      "-map", "0", "-map_metadata", "0", "-map_chapters", "0", "-c", "copy", "-avoid_negative_ts", "disabled", "-fflags", "+bitexact", file]);
  }
  const hash = await sha(files[0]); assert.equal(await sha(files[1]), hash, "Source must generate byte identically twice");
  const probe = JSON.parse(await run("ffprobe", ["-v", "error", "-count_packets", "-show_streams", "-show_format", "-show_chapters", "-of", "json", files[0]]));
  assert.deepEqual(probe.streams.map(s => s.codec_type), ["video", "audio", "audio", "subtitle", "attachment"]);
  assert.deepEqual(probe.streams.slice(0, 3).map(s => Number(s.nb_read_packets)), [72, 189, 189]);
  assert.equal(probe.streams[0].has_b_frames, 2);
  assert.equal(probe.streams[0].side_data_list.find(s => s.side_data_type === "Display Matrix")?.rotation, 90);
  assert.equal(probe.chapters.length, 2);
  assert.deepEqual(probe.streams.slice(1, 3).map(s => s.initial_padding), [1024, 1024]);
  const packets = JSON.parse(await run("ffprobe", ["-v", "error", "-select_streams", "v:0", "-show_packets", "-show_entries",
    "packet=pts_time,dts_time", "-of", "json", files[0]])).packets;
  assert.equal(packets.length, 72);
  const pts = packets.map(p => Number(p.pts_time));
  assert.ok(pts.every(Number.isFinite) && pts.some((p, i) => i > 0 && p < pts[i - 1]), "Real decode-order presentation reordering required");
  const sorted = [...pts].sort((a, b) => a - b);
  const cadences = [...new Set(sorted.slice(1).map((p, i) => Math.round((p - sorted[i]) * 1000)))].sort((a, b) => a - b);
  assert.ok(cadences.includes(42) && cadences.includes(83));
  const bytes = (await lstat(files[0])).size; assert.ok(bytes > 400000 && bytes < 8 * 1048576);
  await copyFile(files[0], final, constants.COPYFILE_EXCL); created = await lstat(final, { bigint: true });
  const descriptor = { status: "reusable-bitexact-source-generated-twice-identically", file: path.relative(root, final).replaceAll("\\", "/"), bytes, sha256: hash,
    parent: complexMkvFixture, nativeToolUsedOnlyForFixtureGenerationAndInspection: true, hasBFrames: 2, packetCounts: [72, 189, 189],
    sourceCadenceMs: cadences, reorderedPresentationInDecodeOrder: true, sourceFirstDts: packets[0].dts_time ?? null,
    missingSourceDts: packets.filter(p => p.dts_time === undefined).length, command: argumentsFor("<owned-repository-work-source.mkv>"),
    fixtureOnlyDisplayMatrixRestoredByCopyMux: true };
  await writeFile(manifest, JSON.stringify(descriptor, null, 2) + "\n", { flag: "wx" });
  retained = true; console.log(JSON.stringify(descriptor));
} finally {
  if (created && !retained) {
    const current = await lstat(final, { bigint: true });
    assert.equal(current.dev, created.dev); assert.equal(current.ino, created.ino); await rm(final);
  }
  await runtime.close();
}
