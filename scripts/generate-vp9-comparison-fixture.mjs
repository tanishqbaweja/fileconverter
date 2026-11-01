// Small explicitly reusable deterministic SOURCE fixture, not a native converter.
import assert from "node:assert/strict";
import { execFile } from "node:child_process";
import { constants } from "node:fs";
import { access, copyFile, readFile, unlink, writeFile } from "node:fs/promises";
import { createHash } from "node:crypto";
import path from "node:path";
import { promisify } from "node:util";
import { createOwnedRuntimeScratch } from "./lib/owned-runtime-scratch.mjs";
assert.equal(process.argv.length, 2);
const root = path.resolve(import.meta.dirname, ".."), source = path.join(root, "fixtures/media/vp9-fallback-comparison.mkv");
const manifest = source + ".json", execute = promisify(execFile), expected = "4fad7ea6c1dd0d374b1b69201b6af4b68e8518bf2672884d23b1f136f5f2cc46";
await assert.rejects(access(source), { code: "ENOENT" }); await assert.rejects(access(manifest), { code: "ENOENT" });
const runtime = await createOwnedRuntimeScratch("vp9-comparison-source-"); let created = false, complete = false;
try {
  const file = path.join(runtime.directory, "source.mkv"), args = ["-hide_banner", "-loglevel", "error", "-nostdin", "-f", "lavfi", "-i",
    "testsrc2=size=320x180:rate=24", "-t", "2", "-an", "-c:v", "libx264", "-threads", "1", "-pix_fmt", "yuv420p",
    "-color_primaries", "bt709", "-color_trc", "bt709", "-colorspace", "bt709", "-color_range", "tv", "-bitexact"];
  await execute("C:/ffmpeg/bin/ffmpeg.exe", [...args, file], { env: runtime.env, windowsHide: true, timeout: 30000, maxBuffer: 65536 });
  const bytes = await readFile(file); assert.equal(bytes.length, 58389); assert.equal(createHash("sha256").update(bytes).digest("hex"), expected);
  const probe = JSON.parse((await execute("C:/ffmpeg/bin/ffprobe.exe", ["-v", "error", "-count_frames", "-show_streams", "-show_format", "-of", "json", file],
    { env: runtime.env, windowsHide: true, timeout: 30000, maxBuffer: 262144 })).stdout);
  assert.equal(probe.streams.length, 1); assert.equal(probe.streams[0].codec_name, "h264"); assert.equal(Number(probe.streams[0].nb_read_frames), 48);
  assert.deepEqual([probe.streams[0].width, probe.streams[0].height, probe.streams[0].color_space, probe.streams[0].color_range], [320, 180, "bt709", "tv"]);
  assert.equal(probe.streams[0].color_primaries, undefined); assert.equal(probe.streams[0].color_transfer, undefined);
  await copyFile(file, source, constants.COPYFILE_EXCL); created = true;
  probe.format.filename = "fixtures/media/vp9-fallback-comparison.mkv";
  await writeFile(manifest, JSON.stringify({ bytes: bytes.length, sha256: expected, args, probe,
    purpose: "Identical small source for private fallback core comparison; not original or large-file stress substitute",
    explicitlyReusableSmallFixture: true, nativeUsedForFixtureGenerationOnly: true, noDocker: true, publicAcceptance: false }, null, 2) + "\n", { flag: "wx" });
  complete = true; console.log(JSON.stringify({ source, bytes: bytes.length, sha256: expected, reusableForCurrentComparison: true }));
} finally { if (created && !complete) await unlink(source); await runtime.close(); }
