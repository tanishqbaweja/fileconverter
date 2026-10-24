// Unit validation and wiring only; no full-original browser execution claimed.
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";
import { MPEG2_ORIGINAL_GATE, assertMpeg2OriginalStructure, compareOriginalAacPackets, selectExactLocalOriginal } from "../scripts/lib/mpeg2-original-gate.mjs";
import { fileURLToPath } from "node:url";
import { createHash } from "node:crypto";
import { gunzipSync } from "node:zlib";
test("local original picker adapter selects existing DOM input without remote transfer and always detaches", async () => {
  const calls = []; let detached = false;
  const page = { context: () => ({ newCDPSession: async () => ({ send: async (method, params) => {
    calls.push({ method, params }); return method === "DOM.getDocument" ? { root: { nodeId: 1 } } : method === "DOM.querySelector" ? { nodeId: 2 } : {};
  }, detach: async () => { detached = true; } }) }), waitForFunction: async () => {} };
  const file = fileURLToPath(new URL("../test.mkv", import.meta.url));
  const result = await selectExactLocalOriginal(page, file);
  assert.deepEqual(calls.map(c => c.method), ["DOM.getDocument", "DOM.querySelector", "DOM.setFileInputFiles"]);
  assert.deepEqual(calls.at(-1).params, { nodeId: 2, files: [file] }); assert.equal(detached, true);
  assert.equal(result.remotePlaywrightUpload, false); assert.equal(result.sourceCopyCreated, false); assert.equal(result.alternateConversionPath, false);
  await assert.rejects(selectExactLocalOriginal(page, file + ".copy"));
});
function fixture() {
  const disposition = { default: 1, forced: 1, hearing_impaired: 0, visual_impaired: 0, comment: 0, original: 0 };
  const video = { codec_name: "hevc", width: 1920, height: 804, avg_frame_rate: "24/1", sample_aspect_ratio: "1:1", display_aspect_ratio: "160:67",
    pix_fmt: "yuv420p", color_range: "tv", color_space: "bt709", color_transfer: "bt709", color_primaries: "bt709", chroma_location: "left",
    disposition, tags: { title: "Original video" } };
  const audio = { codec_name: "aac", profile: "HE-AAC", sample_rate: "48000", channels: 6, channel_layout: "5.1", extradata_size: 4,
    disposition, tags: { language: "hin", title: "Original audio" } };
  const source = { streams: [video, audio, { codec_name: "subrip" }, { codec_name: "png", width: 250, height: 140, disposition: { attached_pic: 1 } }], chapters: [],
    format: { size: String(MPEG2_ORIGINAL_GATE.bytes), duration: "12340.096", tags: { TITLE: "Original film", WEBSiTE: "example.invalid" } } };
  const output = structuredClone(source); output.streams.splice(2, 1); output.streams[0].codec_name = "mpeg2video";
  output.streams[0].tags = { name: "Original video", encoder: "Within FFmpeg MPEG-2" }; output.streams[1].tags = { name: "Original audio", language: "hin" };
  output.format.size = "6414309978"; output.format.duration = "12340.095";
  return { source, output, warnings: ["Source stream 2 (subrip) cannot be represented in MP4 and is explicitly excluded."] };
}
test("original structure requires full-size video, source geometry/colour, audio, tags, dispositions and artwork", () => {
  const f = fixture(); const result = assertMpeg2OriginalStructure(f.source, f.output, f.warnings);
  assert.equal(result.sourceFrames, 296160); assert.equal(result.subtitleConversionImplemented, false); assert.equal(result.publicAcceptance, false);
  for (const mutate of [f => f.output.streams[0].width = 320, f => f.output.streams[0].color_space = "bt601",
    f => f.output.streams[1].tags.language = "eng", f => f.output.streams[1].channels = 2,
    f => f.output.streams[0].tags.name = "lost", f => f.output.streams[0].disposition.forced = 0,
    f => f.output.streams.pop(), f => f.output.format.size = "210000000", f => f.output.format.tags.WEBSiTE = "lost",
    f => f.output.chapters.push({ title: "invented" }), f => f.warnings = []]) {
    const f = fixture(); mutate(f); assert.throws(() => assertMpeg2OriginalStructure(f.source, f.output, f.warnings));
  }
});
function packets(change = () => {}) {
  return (async function* () { for (let i = 0; i < 3; i++) { const row = { hash: "hash-" + i, streamIndex: 1,
    pts: i * 0.042667, dts: i * 0.042667, duration: 0.042667, skip: 0, tail: 0 }; change(row, i); yield row; } })();
}
test("all original AAC packets compare bytes, order, clocks, duration and trim without retention", async () => {
  const r = await compareOriginalAacPackets(packets(), packets(row => { row.pts += 0.000313; row.dts += 0.000313; }));
  assert.equal(r.packets, 3); assert.equal(r.maximumRetainedPackets, 2); assert.equal(r.pcmValidationCovered, false);
  for (const mutate of [row => row.hash = "wrong", row => row.pts += 0.001, row => row.dts += 0.001,
    row => row.duration += 0.002, row => row.skip = 1024, row => row.tail = 1024, row => row.duration = null])
    await assert.rejects(compareOriginalAacPackets(packets(), packets(mutate)));
});
test("full-original mode binds exact source and long deadline, journals all native rows and aborts known memory failure", async () => {
  const driver = await readFile(new URL("../scripts/test-mpeg2-production-runtime.mjs", import.meta.url), "utf8");
  const ui = await readFile(new URL("../scripts/lib/mpeg2-ui-job.mjs", import.meta.url), "utf8");
  assert.match(driver, /fixture = fullOriginal \? path.join\(root, "test.mkv"\)/);
  assert.match(driver, /if \(!fullOriginal\) await native\(/);
  assert.match(driver, /await nativeJournal.appendBatch\(\{ \.\.\.batch, samples: annotated \}\)/);
  assert.match(driver, /fullOriginal && samples.length > 128/);
  assert.match(driver, /nativeJournal\.peaksExcept\(\["blank"\]\)/);
  assert.match(driver, /incrementalPrivateMiB.*250|privateBytes.*1048576 > 250/s);
  assert.match(driver, /if \(requested\) cancel.click\(\)/);
  assert.match(driver, /phase: "after-known-budget-failure-before-native-cancel"/);
  assert.ok(driver.indexOf('phase: "after-known-budget-failure-before-native-cancel"') < driver.indexOf("if (requested) cancel.click()"));
  assert.match(driver, /processes: peak.processes, captureMs: 8000/);
  assert.match(driver, /Date.now\(\) - Date.parse\(rendererNativeProfile.startedAt\) >= 15000/);
  assert.match(driver, /report.nativeProfileDiagnosticOnly = true/);
  assert.ok(driver.indexOf("await rendererNativeProfile.capture()") < driver.indexOf("if (requested) cancel.click()"));
  assert.match(driver, /compactLosslessNativeMemoryJournal\(coverageFailure/);
  assert.match(driver, /\{ \.\.\.receipt, complete: false, conversionAcceptance: false, failure: coverageFailure \}/);
  assert.ok(driver.indexOf("startActiveMonitor(page);") < driver.indexOf("await page.goto("));
  assert.match(driver, /await selectExactLocalOriginal\(page, fixture\)/);
  assert.match(driver, /assertMpeg2OriginalStructure\(source, converted, report.conversion.warnings\)/);
  assert.match(driver, /compareOriginalAacPackets\(packets\(fixture\), packets\(output\)\)/);
  assert.match(driver, /assert.ok\(ssim >= 0.98/); assert.match(driver, /compareStreamingVideoClocks\(clockReference, times\(output\)/);
  assert.match(ui, /files\[0\].name !== "test.mkv" \|\| files\[0\].size !== 2958573265/);
  assert.match(ui, /fullOriginal \? 21600000 : 60000/); assert.match(ui, /fullOriginal \? 250 : 16/);
  assert.equal(MPEG2_ORIGINAL_GATE.maximumConversionMs, 21600000); assert.equal(MPEG2_ORIGINAL_GATE.publicAcceptance, false);
});
test("first original attempt preserves observer overflow and partial journal without claiming conversion or memory acceptance", async () => {
  const root = new URL("../", import.meta.url), hash = b => createHash("sha256").update(b).digest("hex");
  const r = JSON.parse(await readFile(new URL("evidence/2026-10-24T06-37-29.552Z-mpeg2-original-result.json", root)));
  const packed = await readFile(new URL(r.archive.path, root)); assert.equal(hash(packed), r.archive.sha256);
  const bytes = gunzipSync(packed); assert.equal(hash(bytes), r.archive.restoredSha256);
  const raw = JSON.parse(bytes); assert.equal(raw.status, "failed"); assert.equal(r.completedCases.length, 0);
  assert.equal(r.originalQualification.completed, false); assert.equal(r.memory, null); assert.equal(r.overallGatePassed, false);
  assert.match(raw.failures[0], /Native observer queue overflow/); assert.equal(raw.conversion, undefined);
  const partial = r.incompleteLosslessMemoryJournal;
  assert.equal(partial.complete, false); assert.equal(partial.rawRemoved, true); assert.equal(partial.readbackVerified, true);
  assert.equal(r.losslessNativeJournalReplayVerified, false);
  const archive = await readFile(new URL("output/playwright/2026-10-24T06-37-29.552Z-mpeg2-original-memory.ndjson.gz", root));
  assert.equal(hash(archive), partial.archiveSha256);
  const restored = gunzipSync(archive); assert.equal(hash(restored), partial.sha256); assert.equal(restored.length, partial.bytes);
  const rows = restored.toString("utf8").trim().split("\n").map(s => JSON.parse(s).sample);
  assert.equal(rows.length, 180); assert.ok(rows.every((row, i) => row.sequence === i + 1 && row.phase === "blank"));
  assert.equal(r.recordedSourcesMatchHistoricalGitHead, true); assert.equal(r.sourcePins, 48);
  assert.equal(r.protectedOriginalUnchangedAtExecution, true); assert.equal(r.cleanup.allOwnedProcessesAbsent, true);
  assert.equal(r.cleanup.disposableOutputDeleted, true); assert.equal(r.publicAcceptance, false);
});
test("actual original reaches native work, fails260MiB gate and cancels with complete lossless observations", async () => {
  const root = new URL("../", import.meta.url), hash = b => createHash("sha256").update(b).digest("hex");
  const receipt = JSON.parse(await readFile(new URL("evidence/2026-10-24T06-53-22.603Z-mpeg2-original-result.json", root)));
  const packed = await readFile(new URL(receipt.archive.path, root)); assert.equal(hash(packed), receipt.archive.sha256);
  const bytes = gunzipSync(packed); assert.equal(hash(bytes), receipt.archive.restoredSha256); const r = JSON.parse(bytes);
  const j = receipt.losslessMemoryJournal;
  const archive = await readFile(new URL("output/playwright/2026-10-24T06-53-22.603Z-mpeg2-original-memory.ndjson.gz", root));
  assert.equal(hash(archive), j.archiveSha256); const raw = gunzipSync(archive); assert.equal(hash(raw), j.sha256);
  assert.equal(raw.length, j.bytes); assert.equal(j.complete, true); assert.equal(j.rawRemoved, true);
  assert.equal(receipt.losslessNativeJournalReplayVerified, true);
  const samples = raw.toString("utf8").trim().split("\n").map(s => JSON.parse(s).sample);
  assert.equal(samples.length, 392); assert.ok(samples.every((s, i) => s.sequence === i + 1));
  const valid = samples.filter(s => s.privateBytes !== null); assert.equal(valid.length, 391);
  for (const s of valid) assert.equal(s.privateBytes, s.processes.reduce((n, p) => n + p.privateBytes, 0));
  const missing = samples.filter(s => s.privateBytes === null); assert.equal(missing.length, 1);
  assert.equal(missing[0].phase, "loaded"); assert.equal(missing[0].sampleError, "OpenProcess 38344");
  const peak = valid.filter(s => s.phase !== "blank").reduce((a, b) => a.privateBytes > b.privateBytes ? a : b);
  assert.equal((peak.privateBytes - r.blankBaseline.privateBytes) / 1048576, 260.10546875);
  assert.equal(receipt.memory.incrementalPrivateMiB, 260.10546875); assert.equal(r.status, "failed");
  const cancellation = r.earlyMemoryFailure.cancellation;
  assert.equal(cancellation.requested, true); assert.equal(cancellation.phase, "Encoding MPEG-2 MP4");
  assert.ok(cancellation.inputBytes > 0 && cancellation.outputBytes > 0); assert.equal(cancellation.wasmMemoryBytes, 50331648);
  assert.equal(receipt.originalQualification.inputAdapter.remotePlaywrightUpload, false);
  assert.equal(receipt.originalQualification.inputAdapter.sourceCopyCreated, false);
  assert.equal(receipt.completedCases.length, 0); assert.equal(receipt.originalQualification.completed, false);
  assert.equal(receipt.overallGatePassed, false); assert.equal(receipt.publicAcceptance, false);
  assert.equal(receipt.protectedOriginalUnchangedAtExecution, true); assert.equal(receipt.cleanup.allOwnedProcessesAbsent, true);
  assert.equal(receipt.cleanup.disposableOutputDeleted, true);
});
test("exact-size loader original attempt still fails251MiB; do not turn a lower observation into acceptance or causal savings", async () => {
  const root = new URL("../", import.meta.url), hash = b => createHash("sha256").update(b).digest("hex");
  const receipt = JSON.parse(await readFile(new URL("evidence/2026-10-24T07-07-06.295Z-mpeg2-original-result.json", root)));
  const packed = await readFile(new URL(receipt.archive.path, root)); assert.equal(hash(packed), receipt.archive.sha256);
  const r = JSON.parse(gunzipSync(packed));
  assert.deepEqual(r.codeManifest.value.artifactBytes, { "decoder.wasm": 5716027, "encoder.wasm": 675411 });
  const j = receipt.losslessMemoryJournal, archive = await readFile(new URL("output/playwright/2026-10-24T07-07-06.295Z-mpeg2-original-memory.ndjson.gz", root));
  assert.equal(hash(archive), j.archiveSha256); const bytes = gunzipSync(archive); assert.equal(hash(bytes), j.sha256);
  const samples = bytes.toString("utf8").trim().split("\n").map(s => JSON.parse(s).sample);
  assert.equal(samples.length, 408); assert.ok(samples.every((s, i) => s.sequence === i + 1 && s.privateBytes !== null));
  for (const s of samples) assert.equal(s.privateBytes, s.processes.reduce((n, p) => n + p.privateBytes, 0));
  const peak = samples.filter(s => s.phase !== "blank").reduce((a, b) => a.privateBytes > b.privateBytes ? a : b);
  assert.equal((peak.privateBytes - r.blankBaseline.privateBytes) / 1048576, 251.5859375);
  assert.equal(receipt.memory.incrementalPrivateMiB, 251.5859375); assert.equal(receipt.memory.unavailableSampleCount, 0);
  assert.equal(receipt.overallGatePassed, false); assert.equal(receipt.completedCases.length, 0);
  assert.equal(receipt.originalQualification.completed, false); assert.equal(receipt.publicAcceptance, false);
  assert.equal(r.earlyMemoryFailure.cancellation.requested, true);
  assert.ok(r.earlyMemoryFailure.cancellation.inputBytes > 0 && r.earlyMemoryFailure.cancellation.outputBytes > 0);
  assert.equal(receipt.protectedOriginalUnchangedAtExecution, true); assert.equal(receipt.cleanup.allOwnedProcessesAbsent, true);
  assert.equal(receipt.losslessNativeJournalReplayVerified, true); assert.equal(receipt.speedComparison, false);
});
test("progress isolation still fails the exact limit with complete386-record evidence", async () => {
  const root = new URL("../", import.meta.url), hash = b => createHash("sha256").update(b).digest("hex");
  const receipt = JSON.parse(await readFile(new URL("evidence/2026-10-24T07-13-40.577Z-mpeg2-original-result.json", root)));
  const packed = await readFile(new URL(receipt.archive.path, root)); assert.equal(hash(packed), receipt.archive.sha256);
  const reportBytes = gunzipSync(packed); assert.equal(hash(reportBytes), receipt.archive.restoredSha256); const r = JSON.parse(reportBytes);
  const j = receipt.losslessMemoryJournal, archive = await readFile(new URL("output/playwright/2026-10-24T07-13-40.577Z-mpeg2-original-memory.ndjson.gz", root));
  assert.equal(hash(archive), j.archiveSha256); const bytes = gunzipSync(archive); assert.equal(hash(bytes), j.sha256);
  const rows = bytes.toString("utf8").trim().split("\n").map(line => JSON.parse(line).sample);
  assert.equal(rows.length, 386); assert.ok(rows.every((s, i) => s.sequence === i + 1 && s.privateBytes !== null));
  for (const s of rows) assert.equal(s.privateBytes, s.processes.reduce((n, p) => n + p.privateBytes, 0));
  const peak = rows.filter(s => s.phase !== "blank").reduce((a, b) => a.privateBytes > b.privateBytes ? a : b);
  assert.equal((peak.privateBytes - r.blankBaseline.privateBytes) / 1048576, 250.41015625);
  assert.equal(receipt.overallGatePassed, false); assert.equal(receipt.completedCases.length, 0);
  assert.equal(r.earlyMemoryFailure.cancellation.requested, true); assert.equal(receipt.publicAcceptance, false);
  assert.equal(receipt.protectedOriginalUnchangedAtExecution, true); assert.equal(receipt.cleanup.allOwnedProcessesAbsent, true);
});
