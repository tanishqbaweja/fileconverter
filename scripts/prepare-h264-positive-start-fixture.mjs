// Synthetic reusable SOURCE generation only; never a browser-output conversion.
import assert from "node:assert/strict";
import { execFile } from "node:child_process";
import { promisify } from "node:util";
import { createReadStream, constants } from "node:fs";
import { access, copyFile, lstat, rm, writeFile } from "node:fs/promises";
import { createHash } from "node:crypto";
import path from "node:path";
import { createOwnedRuntimeScratch } from "./lib/owned-runtime-scratch.mjs";
import { bframeMkvFixture, assertBFrameMkvSource } from "./lib/mkv-complex-fidelity.mjs";
assert.equal(process.argv.length, 2);
const root = path.resolve(import.meta.dirname, ".."), execute = promisify(execFile);
const final = path.join(root, "fixtures/media/within-test-h264-bframes-positive.mkv"), manifest = final + ".json";
for (const file of [final, manifest]) await assert.rejects(access(file), { code: "ENOENT" });
const sha = async file => { const h = createHash("sha256"); for await (const b of createReadStream(file, { highWaterMark: 262144 })) h.update(b); return h.digest("hex"); };
const source = path.join(root, bframeMkvFixture.file); assert.equal(await sha(source), bframeMkvFixture.sha256);
const runtime = await createOwnedRuntimeScratch("h264-positive-source-");
const run = async (tool, args) => (await execute(`C:/ffmpeg/bin/${tool}.exe`, args,
  { cwd: root, env: runtime.env, windowsHide: true, timeout: 90000, maxBuffer: 2097152 })).stdout.trim();
const packets = async file => JSON.parse(await run("ffprobe", ["-v", "error", "-show_packets", "-show_data_hash", "sha256",
  "-show_entries", "packet=stream_index,pts_time,dts_time,duration_time,data_hash:packet_side_data=side_data_type,skip_samples,discard_padding", "-of", "json", file])).packets.filter(p => p.stream_index <= 2);
let created, retained = false;
try {
  const files = [1, 2].map(n => path.join(runtime.directory, `source-${n}.mkv`));
  for (const file of files) await run("ffmpeg", ["-v", "error", "-n", "-copyts", "-i", source, "-map", "0", "-c", "copy",
    "-output_ts_offset", "5", "-avoid_negative_ts", "disabled", "-fflags", "+bitexact", file]);
  const hash = await sha(files[0]); assert.equal(await sha(files[1]), hash);
  const probe = JSON.parse(await run("ffprobe", ["-v", "error", "-show_streams", "-show_chapters", "-show_format", "-of", "json", files[0]]));
  const before = await packets(source), after = await packets(files[0]);
  assert.equal(before.length, 450); assert.equal(after.length, before.length);
  for (const index of [0, 1, 2]) {
    const a = before.filter(p => p.stream_index === index), b = after.filter(p => p.stream_index === index);
    assert.equal(a.length, [72, 189, 189][index]); assert.equal(b.length, a.length);
    for (let i = 0; i < a.length; i++) {
      assert.equal(b[i].data_hash, a[i].data_hash); assert.equal(b[i].duration_time, a[i].duration_time);
      assert.deepEqual(b[i].side_data_list, a[i].side_data_list);
      for (const clock of ["pts_time", "dts_time"]) {
        if (a[i][clock] === undefined) assert.equal(b[i][clock], undefined);
        else assert.ok(Math.abs(Number(b[i][clock]) - Number(a[i][clock]) - 5) < 1e-9);
      }
    }
  }
  assertBFrameMkvSource(probe, after);
  assert.equal(probe.format.start_time, "5.000000"); assert.equal(probe.format.duration, "9.031000");
  assert.equal(probe.streams[0].side_data_list.find(s => s.side_data_type === "Display Matrix")?.rotation, 90);
  assert.deepEqual(probe.streams.slice(1, 3).map(s => s.initial_padding), [1024, 1024]);
  assert.equal(probe.chapters.length, 2);
  const bytes = (await lstat(files[0])).size; assert.ok(bytes > 400000 && bytes < 8 * 1048576);
  await copyFile(files[0], final, constants.COPYFILE_EXCL); created = await lstat(final, { bigint: true });
  const descriptor = { status: "reusable-bitexact-source-generated-twice-identically", file: path.relative(root, final).replaceAll("\\", "/"), bytes,
    sha256: hash, parent: bframeMkvFixture, offsetSeconds: 5, packetCounts: [72, 189, 189], packetPayloadAndTrimIdentity: true,
    everyAvailablePtsAndDtsShiftedExactlyFiveSeconds: true, unavailableInitialDtsPreserved: true,
    formatStartSeconds: 5, matroskaSegmentEndpointSeconds: 9.031, nativeToolUsedOnlyForFixtureGenerationAndInspection: true };
  await writeFile(manifest, JSON.stringify(descriptor, null, 2) + "\n", { flag: "wx" });
  retained = true; console.log(JSON.stringify(descriptor));
} finally {
  if (created && !retained) {
    const now = await lstat(final, { bigint: true }); assert.equal(now.dev, created.dev); assert.equal(now.ino, created.ino); await rm(final);
  }
  await runtime.close();
}
