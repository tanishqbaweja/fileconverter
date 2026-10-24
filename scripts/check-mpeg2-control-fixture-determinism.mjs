import "./lib/hidden-unit-subprocesses.mjs";
import assert from "node:assert/strict";
import { execFile } from "node:child_process";
import { createHash } from "node:crypto";
import { createReadStream } from "node:fs";
import { access, lstat, readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import { promisify } from "node:util";
import { createOwnedRuntimeScratch } from "./lib/owned-runtime-scratch.mjs";
import { mpeg2ControlFixtureArguments } from "./lib/mpeg2-control-fixture.mjs";
const root = path.resolve(import.meta.dirname, ".."), execute = promisify(execFile), sha = bytes => createHash("sha256").update(bytes).digest("hex");
const hashFile = async file => { const h = createHash("sha256"); for await (const bytes of createReadStream(file, { highWaterMark: 65536 })) h.update(bytes); return h.digest("hex"); };
const runtime = await createOwnedRuntimeScratch("mpeg2-control-fixture-proof-");
const options = { cwd: root, env: runtime.env, windowsHide: true, timeout: 30000, maxBuffer: 65536 };
const report = { startedAt: new Date().toISOString(), scope: "Native synthetic source generation only; not user-media/browser conversion or performance acceptance", generatedFixtures: [],
  browserConversions: 0, originalRead: false, publicAcceptance: false };
try {
  report.generatorSha256 = sha(await readFile(path.join(root, "scripts/lib/mpeg2-control-fixture.mjs")));
  report.nativeVersion = (await execute("ffmpeg", ["-version"], options)).stdout.split(/\r?\n/)[0];
  for (let index = 0; index < 2; index++) {
    const file = path.join(runtime.directory, `source-${index}.mkv`);
    await execute("ffmpeg", mpeg2ControlFixtureArguments(file), options);
    const probe = JSON.parse((await execute("ffprobe", ["-v", "error", "-count_frames", "-show_streams", "-show_format", "-of", "json", file], options)).stdout);
    assert.equal(probe.streams.length, 2); const video = probe.streams.find(s => s.codec_type === "video"), audio = probe.streams.find(s => s.codec_type === "audio");
    assert.equal(video.codec_name, "hevc"); assert.equal(video.width, 640); assert.equal(video.height, 360);
    assert.equal(video.avg_frame_rate, "24/1"); assert.equal(Number(video.nb_read_frames), 96);
    assert.equal(audio.codec_name, "aac"); assert.equal(audio.tags.language, "eng"); assert.equal(probe.format.tags.title, "MPEG-2 café 音楽");
    const packets = (await execute("ffmpeg", ["-v", "error", "-i", file, "-map", "0", "-c", "copy", "-f", "streamhash", "-hash", "sha256", "pipe:1"], options)).stdout.trim();
    report.generatedFixtures.push({ bytes: (await lstat(file)).size, sha256: await hashFile(file), streams: ["hevc", "aac"], width: 640, height: 360, frames: 96, packets });
  }
  assert.deepEqual(report.generatedFixtures[0], report.generatedFixtures[1]); report.status = "passed-byte-identical-generated-fixtures";
} catch (error) { report.status = "failed"; report.failure = String(error.stack ?? error); process.exitCode = 1; }
finally {
  await runtime.close(); await assert.rejects(access(runtime.directory), { code: "ENOENT" }); report.scratchRemoved = true;
  const destination = path.join(root, "evidence", report.startedAt.replaceAll(":", "-") + "-mpeg2-control-fixture-determinism.json");
  await writeFile(destination, JSON.stringify(report, null, 2) + "\n", { flag: "wx" }); console.log(JSON.stringify(report));
}
