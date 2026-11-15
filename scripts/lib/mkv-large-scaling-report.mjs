import assert from "node:assert/strict";
import { assertHevcHeaderParserCore } from "./mkv-hevc-header-core-reference.mjs";
import { MKV_SCALE_5GB, assertLargeScalingExtent } from "./mkv-large-scaling.mjs";
import { mkvProtectedCopy } from "./mkv-protected-copy-contract.mjs";
const escape = value => String(value).replaceAll("&", "&amp;").replaceAll("<", "&lt;").replaceAll('"', "&quot;");
const fixed = value => typeof value === "number" && Number.isFinite(value) ? value.toFixed(3) : "unavailable";

export function renderLargeScalingReport(report, samples) {
  assert.equal(report.largeScalingCandidate, true); assert.equal(report.nativeConversionUsed, false); assert.equal(report.publicAcceptance, false);
  assert.ok(["passed-first-real-5gb-scaling-not-repeats-or-public-acceptance", "failed-not-acceptance"].includes(report.status));
  assert.deepEqual(report.originalBefore, { bytes: mkvProtectedCopy.bytes, sha256: mkvProtectedCopy.sha256 });
  assert.deepEqual(report.originalBefore, report.originalAfter);
  assert.ok(samples.length <= 20000 && report.arms.length === 1);
  const [arm] = report.arms, [job] = arm.cases, v = job?.validation, passed = report.status.startsWith("passed-");
  assert.equal(arm.cases.length, 1);
  const valid = row => row.sampleError === null && Number.isFinite(row.privateBytes) && row.privateBytes > 0 && Array.isArray(row.processes) && row.processes.length > 0;
  const active = row => job?.conversionWindow && Date.parse(row.timestamp) >= job.conversionWindow.start &&
    Date.parse(row.timestamp) <= (job.conversionWindow.end ?? arm.memory?.end);
  const selected = samples.filter(active), available = selected.filter(valid);
  for (const row of samples.filter(valid)) assert.equal(row.processes.reduce((sum, p) => sum + p.privateBytes, 0), row.privateBytes);
  const peak = available.length ? (Math.max(...available.map(s => s.privateBytes)) - arm.blank.privateBytes) / 1048576 : null;
  if (arm.memory) {
    assert.equal(peak, arm.memory.incrementalPrivateMiB); assert.equal(available.length, arm.memory.validSamples);
    assert.equal(selected.length - available.length, arm.memory.unavailableSamples);
  }
  if (passed) {
    assertHevcHeaderParserCore(report.candidateBuild); assertLargeScalingExtent(report.fixture.bytes); assertLargeScalingExtent(job.metrics.outputBytes);
    assert.equal(report.fixture.loops, MKV_SCALE_5GB.loops); assert.equal(v.video.packets, MKV_SCALE_5GB.expectedVideoPackets);
    assert.ok(v.video.packetBytesIdentical && v.aac.packetBytesIdentical && v.completeDecodedVideoAndPcmEqual && v.candidateGate.passed);
    for (const decode of [v.sourceCompleteDecode, v.outputCompleteDecode]) {
      assert.equal(decode.status, "passed-complete-independent-scaling-content-decode"); assert.equal(decode.decodedFrames, MKV_SCALE_5GB.expectedVideoPackets);
      assert.equal(decode.duplicateFrames, 0); assert.equal(decode.droppedFrames, 0); assert.equal(decode.decodedFileCreated, false);
      assert.equal(decode.nativeToolUsedForConversion, false);
    }
    assert.equal(v.sourceCompleteDecode.decodedVideoSha256, v.outputCompleteDecode.decodedVideoSha256);
    assert.equal(v.sourceCompleteDecode.decodedPcmSha256, v.outputCompleteDecode.decodedPcmSha256);
    assert.ok(job.outputRemoved && arm.ownedRuntimeRemoved && arm.serverCleanup.ownedRootAbsent && report.fixtureRuntimeRemoved && report.toolDownloadRemoved);
    assert.ok(peak <= 250 && arm.memory.cleanupAboveIdleMiB !== null && arm.memory.cleanupAboveIdleMiB <= 96);
  }
  const origin = Date.parse(samples[0]?.timestamp), elapsed = s => (Date.parse(s.timestamp) - origin) / 1000;
  const csv = ["sequence,timestamp,elapsed_seconds,available,in_conversion,tree_private_bytes,tree_rss_bytes,delta_over_original_blank_mib",
    ...samples.map(s => {
      assert.ok(!/[\r\n,"<>]/.test(s.timestamp));
      return [s.sequence, s.timestamp, fixed(elapsed(s)), valid(s), Boolean(active(s)), valid(s) ? s.privateBytes : "unavailable",
        valid(s) ? s.rssBytes : "unavailable", valid(s) ? fixed((s.privateBytes - arm.blank.privateBytes) / 1048576) : "unavailable"].join(",");
    })].join("\n") + "\n";
  const dots = samples.filter(valid).map(s => ({ seconds: elapsed(s), delta: (s.privateBytes - arm.blank.privateBytes) / 1048576, active: active(s) }));
  const seconds = Math.max(1, ...dots.map(s => s.seconds)), top = Math.max(300, ...dots.map(s => s.delta)), low = Math.min(0, ...dots.map(s => s.delta));
  const y = n => 270 - (n - low) / (top - low || 1) * 230;
  const circles = dots.map(s => `<circle cx="${(65 + s.seconds / seconds * 690).toFixed(2)}" cy="${y(s.delta).toFixed(2)}" r="1" fill="${s.active ? "#2465ae" : "#a5adba"}"/>`).join("");
  const values = [
    ["Valid media source bytes", report.fixture?.bytes], ["Browser output bytes", job?.metrics?.outputBytes],
    ["Browser remux seconds", fixed(job?.metrics?.elapsedMs / 1000)], ["Full-Chrome conversion delta MiB", fixed(peak)],
    ["Cleanup above ORIGINAL loaded idle MiB", fixed(arm.memory?.cleanupAboveIdleMiB)],
    ["Valid / unavailable conversion samples", `${available.length} / ${selected.length - available.length}`],
    ["Full decoded source/output video + PCM equal", v?.completeDecodedVideoAndPcmEqual === true ? "yes" : "unverified"],
    ["Output / generated source removed", `${job?.outputRemoved === true ? "yes" : "unverified"} / ${report.fixtureRuntimeRemoved === true ? "yes" : "unverified"}`],
  ];
  const html = `<!doctype html><html lang="en"><meta charset="utf-8"><meta name="viewport" content="width=device-width"><title>First real >4GiB media scaling</title>
<style>body{font:16px system-ui;max-width:1000px;margin:2rem auto;padding:1rem;color:#172337}table{border-collapse:collapse}td,th{padding:.5rem;text-align:left;border-bottom:1px solid #ccd}svg{width:100%;height:auto}text{font:12px system-ui;fill:#172337}code{overflow-wrap:anywhere}</style>
<h1>First real &gt;4GiB media scaling</h1><p>Status: ${escape(report.status)}. One first scaling job; not required repeat/near10GB/public-release or headed/manual acceptance. Stream-copy remuxing, not re-encoding or an established speedup.</p>
<p>Peak is the complete Chrome process tree DURING conversion minus the SAME original stable blank. Loaded idle is not substituted. Blue dots are conversion; grey dots are outside conversion, including independent decoding. Missing samples are unavailable, never zero. All processes remain included in the native journal.</p>${arm.losslessNativeArchive ? "\n<p>Every original 100ms native sample is retained in the separately authenticated lossless archive. This graph retains EVERY conversion point, but thins validation-only points to at most one per second. Neither acquisition frequency nor conversion peaks/counts are reduced.</p>" : ""}
<svg viewBox="0 0 800 320" role="img" aria-label="Whole-Chrome private memory over original blank throughout real scaling and independent validation"><text x="15" y="20">Incremental private MiB; 250 MiB conversion limit</text><line x1="65" y1="${y(250).toFixed(2)}" x2="755" y2="${y(250).toFixed(2)}" stroke="#b92338" stroke-dasharray="5 4"/>${circles}<text x="65" y="300">0 seconds</text><text x="620" y="300">${fixed(seconds)} seconds</text></svg>
<table>${values.map(([label, value]) => `<tr><th>${label}</th><td>${escape(value ?? "unavailable")}</td></tr>`).join("")}</table>
<p>Output SHA-256: <code>${escape(v?.outputSha256 ?? "unavailable")}</code>. Native tools generate the source and independently validate completed browser output only; they never convert in place of the browser. Existing retained-memory failure stays failed; this job does not establish flat long-session memory.</p></html>\n`;
  return { csv, html };
}
