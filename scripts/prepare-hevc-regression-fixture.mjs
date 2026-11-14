// One explicitly reusable small source, not a converted user file. All extra
// copies stay in newly owned work scratch and disappear even on failure.
import assert from "node:assert/strict";
import { execFile } from "node:child_process";
import { promisify } from "node:util";
import { createReadStream, constants } from "node:fs";
import { access, copyFile, lstat, readFile, rm, writeFile } from "node:fs/promises";
import { createHash } from "node:crypto";
import path from "node:path";
import { createOwnedRuntimeScratch } from "./lib/owned-runtime-scratch.mjs";
import { mkvStagedReference } from "./lib/mkv-exact-aac-staged-reference.mjs";

const root = path.resolve(import.meta.dirname, ".."), execute = promisify(execFile);
const final = path.join(root, "fixtures/media/within-test-synthetic-hevc-aac.mkv"), manifest = final + ".json";
for (const file of [final, manifest]) await assert.rejects(access(file), { code: "ENOENT" });
const sha = async file => { const h = createHash("sha256"); for await (const chunk of createReadStream(file, { highWaterMark: 262144 })) h.update(chunk); return h.digest("hex"); };
const referenceBytes = await readFile(path.join(root, mkvStagedReference.file));
assert.equal(createHash("sha256").update(referenceBytes).digest("hex"), mkvStagedReference.sha256);
const reference = JSON.parse(referenceBytes), runtime = await createOwnedRuntimeScratch("hevc-regression-fixture-");
const run = async (tool, args) => (await execute(`C:/ffmpeg/bin/${tool}.exe`, args,
  { cwd: root, env: runtime.env, windowsHide: true, timeout: 90000, maxBuffer: 2097152 })).stdout.trim();
let created = null, retained = false;
try {
  const files = [1, 2].map(n => path.join(runtime.directory, `fixture-${n}.mkv`));
  const hashes = [];
  for (const file of files) {
    await run("ffmpeg", ["-v", "error", "-n", "-f", "lavfi", "-i", "testsrc2=size=1280x720:rate=24",
      "-f", "lavfi", "-i", "sine=frequency=553:sample_rate=48000", "-t", "12", "-c:v", "libx265", "-preset", "ultrafast",
      "-x265-params", "pools=1:frame-threads=1:log-level=error:keyint=48", "-b:v", "3600k", "-pix_fmt", "yuv420p",
      "-c:a", "aac", "-b:a", "128k", "-fflags", "+bitexact", file]);
    hashes.push(await sha(file));
  }
  assert.equal(hashes[0], hashes[1], "Fixture generation must be byte deterministic");
  const bytes = Number((await lstat(files[0])).size); assert.ok(bytes > 2 * 1048576 && bytes < 8 * 1048576);
  const packetHashes = await run("ffmpeg", ["-v", "error", "-i", files[0], "-map", "0:v:0", "-map", "0:a:0", "-c", "copy", "-f", "streamhash", "-hash", "sha256", "-"]);
  assert.equal(packetHashes, reference.fixture.packetHashes);
  const pcm = await run("ffmpeg", ["-v", "error", "-xerror", "-threads", "1", "-i", files[0], "-map", "0:a:0", "-c:a", "pcm_s16le", "-f", "streamhash", "-hash", "sha256", "-"]);
  assert.equal(pcm, reference.fixture.aac.pcm);
  const probe = JSON.parse(await run("ffprobe", ["-v", "error", "-count_packets", "-show_streams", "-show_format", "-of", "json", files[0]]));
  assert.deepEqual(probe.streams.map(s => [s.codec_name, Number(s.nb_read_packets)]), [["hevc", 288], ["aac", 564]]);
  assert.equal(Number(probe.format.duration), reference.arms[0].cases[0].validation.sourceHeader.durationSeconds);
  const fixture = { bytes, sha256: hashes[0], packetHashes, decodedPcm: pcm };
  await copyFile(files[0], final, constants.COPYFILE_EXCL); created = await lstat(final, { bigint: true });
  await writeFile(manifest, JSON.stringify({ status: "reusable-bitexact-source-generated-twice-identically", fixture,
    historicalReference: mkvStagedReference, historicalInputByteIdentity: false,
    historicalPacketHashesAndDecodedPcmMatch: true, inputIdentityRequiredForFutureRuns: true,
    reason: "Historical disposable Matroska had non-deterministic container identifiers; this source fixes future input identity without changing encoded packet streams or relaxing output validation.",
    nativeToolUsedOnlyForFixtureGenerationAndInspection: true, protectedOriginalSelected: false }, null, 2) + "\n", { flag: "wx" });
  retained = true; console.log(JSON.stringify({ file: path.relative(root, final).replaceAll("\\", "/"), ...fixture }));
} finally {
  if (created && !retained) {
    const current = await lstat(final, { bigint: true });
    assert.equal(current.dev, created.dev); assert.equal(current.ino, created.ino);
    await rm(final);
  }
  await runtime.close();
}
