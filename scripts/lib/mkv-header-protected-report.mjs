import assert from "node:assert/strict";
import { assertHevcHeaderParserCore } from "./mkv-hevc-header-core-reference.mjs";
import { mkvProtectedCopy } from "./mkv-protected-copy-contract.mjs";
const escape = value => String(value).replaceAll("&", "&amp;").replaceAll("<", "&lt;").replaceAll('"', "&quot;");
const fixed = value => Number.isFinite(value) ? value.toFixed(3) : "unavailable";

export function headerProtectedVideoEvidenceText(validation) {
  if (!validation?.candidateGate?.passed) return "Complete video validation is unverified.";
  if (validation.fullVideoDecode === true && validation.completeVideo?.status === "passed-complete-independent-video-decode" &&
      validation.completeVideo.decodedFrames === 296160 && validation.completeVideo.duplicateFrames === 0 && validation.completeVideo.droppedFrames === 0 &&
      validation.completeVideo.decodedFileCreated === false && validation.completeVideo.nativeToolUsedForConversion === false)
    return "Fresh complete independent video decode: 296160 frames, no drops or duplicates, no decoded file created.";
  if (validation.fullVideoDecodeInheritedThroughWholeOutputIdentity === true && validation.fullVideoDecode !== true &&
      validation.independentValidation?.fullDecodedVideoFrames === 296160 &&
      validation.outputSha256 === validation.independentValidation.outputSha256)
    return "Prior complete video decode inherited ONLY through entire output byte identity; not a new native decode or native-build equality claim.";
  return "Complete video validation is unverified.";
}

// A new explicit report scope: never rewrite older report bytes or silently
// label inherited validation as fresh. Native journal keeps every process row.
export function renderHeaderProtectedReport(report, samples) {
  assert.equal(report.hevcHeaderProtectedCandidate, true);
  assert.equal(report.nativeConversionUsed, false); assert.equal(report.headed, false);
  assert.ok(["passed-header-core-protected-not-public-acceptance", "failed-not-acceptance"].includes(report.status));
  assert.deepEqual(report.originalBefore, { bytes: mkvProtectedCopy.bytes, sha256: mkvProtectedCopy.sha256 });
  assert.ok(Array.isArray(samples) && samples.length <= 20000 && report.arms.length <= 1);
  const arm = report.arms[0], row = arm?.cases[0], passed = report.status.startsWith("passed-");
  if (passed) {
    assertHevcHeaderParserCore(report.candidateBuild); assert.deepEqual(report.originalAfter, report.originalBefore);
    assert.equal(row.state, "complete"); assert.ok(row.validation.candidateGate.passed && row.outputRemoved);
    assert.ok(arm.ownedRuntimeRemoved && arm.serverCleanup.ownedRootAbsent && report.toolDownloadRemoved);
    assert.notEqual(headerProtectedVideoEvidenceText(row.validation), "Complete video validation is unverified.");
    if (row.validation.fullVideoDecodeInheritedThroughWholeOutputIdentity)
      assert.equal(row.metrics.outputBytes, row.validation.independentValidation.outputBytes);
  }
  const blank = arm?.blank?.privateBytes, origin = samples.length ? Date.parse(samples[0].timestamp) : 0;
  const window = arm?.memory, valid = s => s.sampleError === null && Number.isFinite(s.privateBytes) && s.privateBytes > 0 && Array.isArray(s.processes) && s.processes.length > 0;
  const active = s => !!window && Date.parse(s.timestamp) >= window.start && Date.parse(s.timestamp) <= window.end;
  const conversion = samples.filter(active), available = conversion.filter(valid);
  if (window) {
    assert.equal(available.length, window.validSamples); assert.equal(conversion.length - available.length, window.unavailableSamples);
    assert.ok(available.length > 0 && Number.isFinite(blank));
    for (const s of available) assert.equal(s.processes.reduce((total, p) => total + p.privateBytes, 0), s.privateBytes);
    const delta = (Math.max(...available.map(s => s.privateBytes)) - blank) / 1048576;
    assert.equal(delta, window.incrementalPrivateMiB);
    if (passed) assert.ok(delta <= 250 && window.cleanupAboveIdleMiB !== null && window.cleanupAboveIdleMiB <= 96);
  } else assert.equal(passed, false);
  const header = "sequence,timestamp,elapsed_seconds,available,in_conversion,tree_private_bytes,tree_rss_bytes,incremental_private_mib,process_count";
  const rows = samples.map(s => {
    const elapsed = (Date.parse(s.timestamp) - origin) / 1000;
    assert.ok(Number.isFinite(elapsed) && typeof s.timestamp === "string" && !/[\r\n,\"<>]/.test(s.timestamp));
    return [s.sequence, s.timestamp, fixed(elapsed), valid(s), active(s), valid(s) ? s.privateBytes : "unavailable", valid(s) ? s.rssBytes ?? "unavailable" : "unavailable",
      valid(s) && Number.isFinite(blank) ? fixed((s.privateBytes - blank) / 1048576) : "unavailable", valid(s) ? s.processes.length : "unavailable"].join(",");
  });
  const csv = [header, ...rows].join("\n") + "\n";
  const points = samples.filter(s => valid(s) && Number.isFinite(blank)).map(s => ({
    time: (Date.parse(s.timestamp) - origin) / 1000, delta: (s.privateBytes - blank) / 1048576, active: active(s),
  }));
  const duration = Math.max(1, ...points.map(p => p.time)), top = Math.max(300, ...points.map(p => p.delta)), bottom = Math.min(0, ...points.map(p => p.delta));
  const x = n => 65 + n / duration * 690, y = n => 270 - (n - bottom) / (top - bottom || 1) * 230;
  const circles = points.map(p => `<circle cx="${x(p.time).toFixed(2)}" cy="${y(p.delta).toFixed(2)}" r="1" fill="${p.active ? "#2465ae" : "#a5adba"}"/>`).join("");
  const video = headerProtectedVideoEvidenceText(row?.validation);
  const html = `<!doctype html><html lang="en"><meta charset="utf-8"><meta name="viewport" content="width=device-width"><title>Corrected-core protected original</title>
<style>body{font:16px system-ui;max-width:1000px;margin:2rem auto;padding:0 1rem;color:#172337}table{border-collapse:collapse}td,th{padding:.5rem;text-align:left;border-bottom:1px solid #ccd}svg{width:100%;height:auto}text{font:12px system-ui;fill:#172337}code{overflow-wrap:anywhere}</style>
<h1>Corrected-core protected original</h1><p>Status: <strong>${escape(report.status)}</strong>. One original-file job, not repeats, &gt;4GB, near10GB, release or manual/headed acceptance.</p>
<p>Original ${report.originalBefore.bytes} bytes. Peak is the complete Chrome tree during conversion minus the SAME original stable blank; loaded idle is not substituted. Grey points are outside conversion (including independent validation); blue points are inside. Missing samples are unavailable, never zero. Full per-process rows remain in the native journal.</p>
<svg viewBox="0 0 800 320" role="img" aria-label="Full Chrome private-memory increase over original blank, throughout conversion and validation"><text x="15" y="20">Incremental private MiB; 250MiB conversion limit</text><line x1="65" y1="${y(250).toFixed(2)}" x2="755" y2="${y(250).toFixed(2)}" stroke="#b92338" stroke-dasharray="5 4"/>${circles}<text x="65" y="300">0 seconds</text><text x="620" y="300">${fixed(duration)} seconds</text></svg>
<table><tr><th>Input bytes</th><td>${report.originalBefore.bytes}</td></tr><tr><th>Output bytes</th><td>${row?.metrics?.outputBytes ?? "unavailable"}</td></tr><tr><th>Browser remux seconds</th><td>${fixed(row?.metrics?.elapsedMs / 1000)}</td></tr><tr><th>Conversion peak MiB</th><td>${fixed(window?.incrementalPrivateMiB)}</td></tr><tr><th>Cleanup over original loaded idle MiB</th><td>${fixed(window?.cleanupAboveIdleMiB)}</td></tr><tr><th>Valid / unavailable conversion samples</th><td>${window?.validSamples ?? "unavailable"} / ${window?.unavailableSamples ?? "unavailable"}</td></tr><tr><th>Output removed</th><td>${row?.outputRemoved === true ? "yes" : "unverified"}</td></tr></table>
<p>${escape(video)} Fresh whole-packet/clocks, codec initialization, full HE-AAC PCM and structure checks: ${row?.validation?.candidateGate?.passed ? "passed" : "unverified"}.</p><p>Output SHA-256: <code>${escape(row?.validation?.outputSha256 ?? "unavailable")}</code>. Native tools inspect sources and validate finished browser outputs; they do not perform conversion. Browser timing is not independent-validator timing or a matched speedup benchmark.</p></html>\n`;
  return { csv, html };
}
