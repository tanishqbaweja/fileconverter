// Qualify the real-media fixture construction method before multi-GB writes.
// Native tools generate/inspect a SOURCE only, never browser conversion output.
import assert from "node:assert/strict";
import { execFile } from "node:child_process";
import { promisify } from "node:util";
import { createReadStream } from "node:fs";
import { lstat, access, writeFile } from "node:fs/promises";
import { createHash } from "node:crypto";
import path from "node:path";
import { createOwnedRuntimeScratch } from "./lib/owned-runtime-scratch.mjs";
import { mkvHevcRegressionFixture } from "./lib/mkv-exact-aac-staged-reference.mjs";
assert.equal(process.argv.length, 2);
const root = path.resolve(import.meta.dirname, ".."), source = path.join(root, mkvHevcRegressionFixture.file);
const digest = createHash("sha256");
for await (const bytes of createReadStream(source, { highWaterMark: 262144 })) digest.update(bytes);
assert.equal(digest.digest("hex"), mkvHevcRegressionFixture.sha256);
const runtime = await createOwnedRuntimeScratch("mkv-scaling-loop-probe-");
let report;
try {
  const run = async (name, args) => (await promisify(execFile)(`C:/ffmpeg/bin/${name}.exe`, args,
    { cwd: root, env: runtime.env, windowsHide: true, timeout: 90000, maxBuffer: 2097152 })).stdout;
  const file = path.join(runtime.directory, "within-test-loop-source.mkv");
  await run("ffmpeg", ["-v", "error", "-n", "-copyts", "-stream_loop", "1", "-i", source,
    "-map", "0", "-c", "copy", "-avoid_negative_ts", "disabled", "-fflags", "+bitexact", file]);
  const probe = JSON.parse(await run("ffprobe", ["-v", "error", "-show_streams", "-show_format", "-of", "json", file]));
  const packets = JSON.parse(await run("ffprobe", ["-v", "error", "-select_streams", "v:0", "-show_packets", "-show_entries",
    "packet=pts_time,dts_time,duration_time", "-of", "json", file])).packets;
  assert.equal(packets.length, 576); assert.deepEqual(probe.streams.map(s => s.codec_name), ["hevc", "aac"]);
  const rows = packets.map((p, index) => {
    const nominalDtsUs = Math.round((index - 2) * 1000 / 24) * 1000;
    const sourceDtsUs = p.dts_time === undefined ? null : Math.round(Number(p.dts_time) * 1000000);
    return { index, pts: p.pts_time, dts: p.dts_time ?? null, nominalDtsUs,
      errorUs: sourceDtsUs === null ? null : Math.abs(sourceDtsUs - nominalDtsUs) };
  });
  report = { status: "source-loop-feasibility-inspected-not-browser-acceptance", source: mkvHevcRegressionFixture,
    generatedBytes: (await lstat(file)).size, formatDuration: probe.format.duration, videoPackets: packets.length,
    maximumKnownDtsVsCurrentNominalPolicyErrorUs: Math.max(...rows.filter(r => r.errorUs !== null).map(r => r.errorUs)),
    join: rows.slice(284, 294), nativeToolUsedOnlyForFixtureGenerationAndInspection: true };
} finally { await runtime.close(); }
await assert.rejects(access(runtime.directory), { code: "ENOENT" });
report.generatedSourceRemovedInFinally = true;
const retained = `evidence/${new Date().toISOString().replaceAll(/[:.]/g, "-")}-mkv-scaling-loop-feasibility.json`;
await writeFile(path.join(root, retained), JSON.stringify(report, null, 2) + "\n", { flag: "wx" });
console.log(JSON.stringify({ file: retained, ...report }));
