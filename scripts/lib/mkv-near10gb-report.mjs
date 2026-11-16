import assert from "node:assert/strict";
import { assertNear10GbExtent, MKV_SCALE_NEAR10GB, near10GbExpectedPcmSamples } from "./mkv-near10gb-scaling.mjs";
import { assertLargeScalingLosslessCoverage } from "./mkv-large-scaling-report.mjs";
import { assertHevcHeaderParserCore } from "./mkv-hevc-header-core-reference.mjs";
import { mkvProtectedCopy } from "./mkv-protected-copy-contract.mjs";
const fixed = n => typeof n === "number" && Number.isFinite(n) ? n.toFixed(3) : "unavailable";
const escape = s => String(s).replaceAll("&", "&amp;").replaceAll("<", "&lt;").replaceAll('"', "&quot;");

export function renderNear10GbReport(r, samples) {
  assert.equal(r.near10GbScalingCandidate, true); assert.equal(r.nativeConversionUsed, false); assert.equal(r.publicAcceptance, false);
  assert.ok(["passed-first-real-near10gb-scaling-not-repeats-or-public-acceptance", "failed-not-acceptance"].includes(r.status));
  assert.deepEqual(r.originalBefore, { bytes: mkvProtectedCopy.bytes, sha256: mkvProtectedCopy.sha256 }); assert.deepEqual(r.originalBefore, r.originalAfter);
  assert.equal(r.arms.length, 1); const [a] = r.arms, [c] = a.cases, v = c?.validation, passed = r.status.startsWith("passed-");
  assert.ok(samples.length <= 20000 && a.cases.length <= 1);
  const valid = s => s.sampleError === null && Number.isFinite(s.privateBytes) && s.privateBytes > 0 && Array.isArray(s.processes) && s.processes.length > 0;
  const active = s => c?.conversionWindow && Date.parse(s.timestamp) >= c.conversionWindow.start && Date.parse(s.timestamp) <= (c.conversionWindow.end ?? a.memory?.end);
  const window = samples.filter(active), available = window.filter(valid);
  for (const s of samples.filter(valid)) assert.equal(s.processes.reduce((n, p) => n + p.privateBytes, 0), s.privateBytes);
  const peak = available.length ? (Math.max(...available.map(s => s.privateBytes)) - a.blank.privateBytes) / 1048576 : null;
  if (a.memory) {
    assert.equal(peak, a.memory.incrementalPrivateMiB); assert.equal(available.length, a.memory.validSamples);
    assert.equal(window.length - available.length, a.memory.unavailableSamples);
  }
  if (passed) {
    assertHevcHeaderParserCore(r.candidateBuild); assertLargeScalingLosslessCoverage(r);
    assertNear10GbExtent(r.fixture.bytes); assertNear10GbExtent(c.metrics.outputBytes);
    assert.equal(r.fixture.loops, 1600); assert.equal(v.video.packets, MKV_SCALE_NEAR10GB.expectedVideoPackets);
    assert.equal(v.aac.packets, MKV_SCALE_NEAR10GB.expectedAudioPackets);
    assert.ok(v.video.packetBytesIdentical && v.aac.packetBytesIdentical && v.completeDecodedVideoAndPcmEqual && v.candidateGate.passed);
    for (const d of [v.sourceCompleteDecode, v.outputCompleteDecode]) {
      assert.equal(d.status, "passed-complete-independent-scaling-content-decode"); assert.equal(d.decodedFrames, 460800);
      assert.equal(d.decodedVideoBytes, 460800 * 1280 * 720 * 3 / 2);
      assert.equal(d.decodedPcmBytes, 2 * near10GbExpectedPcmSamples(902400, 1024, 0));
      assert.equal(d.droppedFrames, 0); assert.equal(d.duplicateFrames, 0); assert.equal(d.decodedFileCreated, false);
      assert.equal(d.nativeToolUsedForConversion, false); assert.ok(d.maximumDecodedReadChunkBytes <= 262144);
    }
    assert.equal(v.sourceCompleteDecode.decodedVideoSha256, v.outputCompleteDecode.decodedVideoSha256);
    assert.equal(v.sourceCompleteDecode.decodedPcmSha256, v.outputCompleteDecode.decodedPcmSha256);
    assert.ok(c.outputRemoved && a.ownedRuntimeRemoved && a.serverCleanup.ownedRootAbsent && r.fixtureRuntimeRemoved && r.toolDownloadRemoved);
    assert.ok(peak <= 250 && a.memory.cleanupAboveIdleMiB !== null && a.memory.cleanupAboveIdleMiB <= 96);
  }
  const origin = Date.parse(samples[0]?.timestamp), seconds = s => (Date.parse(s.timestamp) - origin) / 1000;
  const csv = ["sequence,timestamp,elapsed_seconds,available,in_conversion,tree_private_bytes,tree_rss_bytes,delta_original_blank_mib",
    ...samples.map(s => {
      assert.ok(!/[\r\n,"<>]/.test(s.timestamp));
      return [s.sequence, s.timestamp, fixed(seconds(s)), valid(s), Boolean(active(s)), valid(s) ? s.privateBytes : "unavailable",
        valid(s) ? s.rssBytes : "unavailable", valid(s) ? fixed((s.privateBytes - a.blank.privateBytes) / 1048576) : "unavailable"].join(",");
    })].join("\n") + "\n";
  const points = samples.filter(valid).map(s => ({ time: seconds(s), delta: (s.privateBytes - a.blank.privateBytes) / 1048576, active: active(s) }));
  const duration = Math.max(1, ...points.map(p => p.time)), top = Math.max(300, ...points.map(p => p.delta)), low = Math.min(0, ...points.map(p => p.delta));
  const y = n => 270 - (n - low) / (top - low || 1) * 230;
  const dots = points.map(p => `<circle cx="${(65 + p.time / duration * 690).toFixed(2)}" cy="${y(p.delta).toFixed(2)}" r="1" fill="${p.active ? "#2465ae" : "#a5adba"}"/>`).join("");
  const rows = [["Source bytes", r.fixture?.bytes], ["Browser output bytes", c?.metrics?.outputBytes], ["Browser remux seconds", fixed(c?.metrics?.elapsedMs / 1000)],
    ["Full-Chrome peak over original blank MiB", fixed(peak)], ["Cleanup over original loaded idle MiB", fixed(a.memory?.cleanupAboveIdleMiB)],
    ["Valid / unavailable conversion samples", `${available.length} / ${window.length - available.length}`],
    ["Complete source/output decoded video + PCM equal", v?.completeDecodedVideoAndPcmEqual === true ? "yes" : "unverified"],
    ["Output / generated source removed", `${c?.outputRemoved === true ? "yes" : "unverified"} / ${r.fixtureRuntimeRemoved === true ? "yes" : "unverified"}`]];
  const html = `<!doctype html><html lang="en"><meta charset="utf-8"><meta name="viewport" content="width=device-width"><title>First real near10GB scaling</title>
<style>body{font:16px system-ui;max-width:1000px;margin:2rem auto;padding:1rem;color:#172337}table{border-collapse:collapse}td,th{padding:.5rem;border-bottom:1px solid #ccd;text-align:left}svg{width:100%;height:auto}text{font:12px system-ui;fill:#172337}code{overflow-wrap:anywhere}</style>
<h1>First real near10GB scaling</h1><p>Status: ${escape(r.status)}. One genuine large-source browser remux, not repeated/long-session/public-release or headed/manual acceptance. Stream copy, not re-encoding. Prior failed5GB repeats stay FAILED; this does not mitigate Chrome background allocations.</p>
<p>Every conversion sample is retained. Original100ms full native stream is authenticated separately; only independent-validation graph points are thinned. Peak is the complete Chrome tree DURING conversion minus SAME original stable blank; grey dots are outside conversion, blue inside. Loaded idle is not substituted; unavailable is never zero.</p>
<svg viewBox="0 0 800 320" role="img" aria-label="Near10GB full Chrome private memory over original blank throughout browser conversion and independent validation"><text x="15" y="20">Incremental private MiB; 250MiB conversion limit</text><line x1="65" y1="${y(250).toFixed(2)}" x2="755" y2="${y(250).toFixed(2)}" stroke="#b92338" stroke-dasharray="5 4"/>${dots}<text x="65" y="300">0 seconds</text><text x="620" y="300">${fixed(duration)} seconds</text></svg>
<table>${rows.map(([label, value]) => `<tr><th>${label}</th><td>${escape(value ?? "unavailable")}</td></tr>`).join("")}</table>
<p>Full output SHA-256: <code>${escape(v?.outputSha256 ?? "unavailable")}</code>. ${v?.completeDecodedVideoAndPcmEqual === true ? "COMPLETE source and output video/PCM independently decoded and SHA-256 equal through bounded local pipes, no decoded media copy." : "Complete source/output decoded-content equality is UNVERIFIED; do not infer acceptance from packet equality or completed browser output. Failure: " + escape(a.failures?.[0] ?? "unavailable")} Native tools generate/inspect sources and validate finished browser output only; they never replace browser conversion. Validator optimization is not a production conversion speedup.</p></html>\n`;
  return { csv, html };
}
