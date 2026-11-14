import assert from "node:assert/strict";
import test from "node:test";
import { readFile } from "node:fs/promises";
import { createHash } from "node:crypto";
import { gunzipSync } from "node:zlib";
import { summarizeProtectedWindow } from "../scripts/lib/mkv-protected-repeat-contract.mjs";
import { reconcileChromiumBirths } from "../scripts/lib/reconcile-chromium-births.mjs";
import { compareComplexMkvPackets, assertComplexMkvStructure } from "../scripts/lib/mkv-complex-fidelity.mjs";

const packets = () => [0, 1, 2].flatMap(stream_index => Array.from({ length: [72, 189, 189][stream_index] }, (_, i) => {
  const seconds = stream_index === 0 ? i < 24 ? i / 12 : 2 + (i - 24) / 24 : i * 1024 / 48000;
  return { stream_index, pts_time: seconds.toFixed(6), dts_time: seconds.toFixed(6),
    duration_time: stream_index === 0 ? "0.041000" : "0.021333", data_hash: "SHA256:" + (stream_index + 1).toString().repeat(64),
    ...(stream_index > 0 && i === 0 ? { side_data_list: [{ side_data_type: "Skip Samples", skip_samples: 1024, discard_padding: 0 }] } : {}) };
}));

test("Complex packet gate checks both VFR cadences and both AAC payload/clock/trim tracks", () => {
  const source = packets(), result = compareComplexMkvPackets(source, structuredClone(source));
  assert.deepEqual(result.packetCounts, [72, 189, 189]);
  assert.deepEqual(result.aac.map(a => a.initialSkipSamples), [1024, 1024]);
  assert.ok(result.sourceCadenceMs.includes(83) && result.sourceCadenceMs.includes(42));
  assert.deepEqual(result.clocks.map(c => c.maximumPtsErrorUs), [0, 0, 0]);
  const changed = structuredClone(source);
  changed.find(p => p.stream_index === 2).data_hash = "SHA256:" + "f".repeat(64);
  assert.throws(() => compareComplexMkvPackets(source, changed), /payload\/decode order/);
  const trim = structuredClone(source);
  trim.find(p => p.stream_index === 2).side_data_list[0].skip_samples = 1008;
  assert.throws(() => compareComplexMkvPackets(source, trim), /skip_samples changed/);
  const clock = structuredClone(source);
  clock[10].pts_time = (Number(clock[10].pts_time) + 0.002).toFixed(6);
  assert.throws(() => compareComplexMkvPackets(source, clock), /PTS changed/);
  const dts = structuredClone(source); dts[10].dts_time = "0.000000";
  assert.throws(() => compareComplexMkvPackets(source, dts), /DTS changed/);
  assert.throws(() => compareComplexMkvPackets(source, source.filter(p => p.stream_index !== 2)), /packet count changed/);
});

const probes = () => {
  const video = { codec_type: "video", codec_name: "h264", width: 640, height: 360,
    pix_fmt: "yuv420p", sample_aspect_ratio: "1:1", display_aspect_ratio: "16:9", color_range: "tv", color_space: "bt709",
    color_transfer: "bt709", color_primaries: "bt709", chroma_location: "left", field_order: "progressive",
    side_data_list: [{ side_data_type: "Display Matrix", rotation: 90 }] };
  const audio = (language, d) => ({ codec_type: "audio", codec_name: "aac", profile: "LC", sample_rate: "48000",
    channels: 1, channel_layout: "mono", tags: { language }, disposition: { default: d } });
  const source = { streams: [video, audio("eng", 1), audio("spa", 0), { codec_type: "subtitle" }, { codec_type: "attachment" }],
    chapters: [{}, {}], format: { format_name: "matroska,webm", duration: "4.031", tags: { title: "test", COMMENT: "note" } } };
  const output = structuredClone(source);
  output.streams = output.streams.slice(0, 3); output.chapters = [];
  output.format = { format_name: "mov,mp4,m4a,3gp,3g2,mj2", duration: "4.031", tags: { title: "test", comment: "note" } };
  return { source, output };
};
test("Complex metadata gate rejects changed rotation/languages/defaults, lost tags and silent exclusions", () => {
  const { source, output } = probes(), warnings = ["subtitle, attachment and chapter exclusions"];
  assert.deepEqual(assertComplexMkvStructure(source, output, warnings).audioLanguages, ["eng", "spa"]);
  assert.throws(() => assertComplexMkvStructure(source, output, []), /not disclosed/);
  const rotation = structuredClone(output); rotation.streams[0].side_data_list = [];
  assert.throws(() => assertComplexMkvStructure(source, rotation, warnings));
  const language = structuredClone(output); language.streams[2].tags.language = "eng";
  assert.throws(() => assertComplexMkvStructure(source, language, warnings));
  const disposition = structuredClone(output); disposition.streams[2].disposition.default = 1;
  assert.throws(() => assertComplexMkvStructure(source, disposition, warnings));
  const metadata = structuredClone(output); delete metadata.format.tags.comment;
  assert.throws(() => assertComplexMkvStructure(source, metadata, warnings));
});

test("Real complex browser run is a retained VFR timestamp failure, not candidate acceptance", async () => {
  const read = file => readFile(new URL(`../${file}`, import.meta.url));
  const sha = data => createHash("sha256").update(data).digest("hex");
  const file = "evidence/2026-11-14T09-47-53-431Z-mkv-exact-aac-complex.json", bytes = await read(file);
  assert.equal(sha(bytes), "4c39feffd003429f2129535bf5669161977c8dab658b100fd8bde0fa19f011d9");
  const report = JSON.parse(bytes), [arm] = report.arms, [row] = arm.cases;
  assert.equal(report.status, "failed-not-acceptance");
  assert.equal(arm.cases.length, 1, "The failed initial gate must not replay cancellation/recovery jobs");
  assert.equal(row.state, "complete");
  assert.equal(row.metrics.inputBytes, 780989);
  assert.equal(row.metrics.outputBytes, 782961);
  assert.equal(row.metrics.elapsedMs, 250.37000000476837);
  assert.match(arm.failures[0], /Complex DTS changed/);
  assert.notEqual(row.validation.candidateGate?.passed, true);
  const source = report.fixture.sourceProbe, output = row.validation.outputProbe;
  assert.equal(output.streams[0].duration, "2.999000");
  assert.equal(source.streams[0].tags.DURATION, "00:00:03.999000000");
  assert.equal(output.streams[0].avg_frame_rate, "72000/2999");
  assert.equal(output.format.duration, "4.031333"); // Audio masks video-track shortening.
  assert.ok(assertComplexMkvStructure(source, output, row.validation.warnings).streamTitlesPreserved);
  assert.deepEqual(output.streams.map(s => s.codec_name), ["h264", "aac", "aac"]);
  assert.deepEqual(report.originalBefore, report.originalAfter);
  assert.ok(arm.ownedRuntimeRemoved && arm.serverCleanup.ownedRootAbsent && report.toolDownloadRemoved && report.fixtureRuntimeRemoved);
  const packed = await read(arm.archive.file);
  assert.equal(sha(packed), arm.archive.sha256);
  const raw = gunzipSync(packed, { maxOutputLength: 2 * 1024 ** 2 });
  assert.equal(sha(raw), arm.archive.decodedSha256);
  const samples = JSON.parse(raw);
  const memory = summarizeProtectedWindow(samples, arm.memory, arm.blank.privateBytes);
  assert.equal(memory.incrementalPrivateMiB, 100.734375);
  assert.equal(arm.memory.cleanupAboveIdleMiB, null, "No stable success cleanup metric was acquired");
  assert.equal(arm.browserCleanup.status, "owned-observed-pids-not-proven-absent");
  assert.equal(arm.birthCleanup.allObservedBirthsAbsent, true);
  const births = reconcileChromiumBirths({ identity: arm.identity, observedPids: arm.browserCleanup.observedPids,
    samples, current: arm.browserCleanup.observations.at(-1).current });
  assert.deepEqual(births, arm.birthCleanup);
  assert.equal(births.observedPidCount, 42); assert.equal(births.reused.length, 1);
  assert.equal(births.noProcessesKilled, true);
  assert.equal(report.publicAcceptance, false); assert.equal(report.nativeConversionUsed, false);
  assert.equal(report.productionFilesReplaced, false); assert.equal(report.originalMediaSelected, false);
  const patch = (await read("media/ffmpeg/patches/direct-mp4-only-source.patch")).toString();
  assert.match(patch, /codec_id == AV_CODEC_ID_H264 \|\|[\s\S]*codec_id == AV_CODEC_ID_HEVC\)\) \{\r?\n\+      synthesize_video_dts\[index\] = 1;/);
  assert.match(patch, /\+  if \(profile != 1 && inspect_stream_info\)/);
});
