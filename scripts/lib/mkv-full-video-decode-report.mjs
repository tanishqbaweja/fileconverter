import assert from "node:assert/strict";
import { summarizeProtectedWindow } from "./mkv-protected-repeat-contract.mjs";

const fixed = value => value.toFixed(3);
const mib = 1048576;

// Derived, offline evidence only. The graph covers the actual browser conversion,
// not the later independent native decode; all observed Chromium processes count.
export function renderFullVideoDecodeReport(report, samples) {
  assert.equal(report.status, "passed-protected-complete-video-decode-not-public-acceptance");
  assert.equal(report.arms.length, 1);
  assert.ok(Array.isArray(samples) && samples.length <= 20000);
  const [arm] = report.arms;
  assert.equal(arm.cases.length, 1);
  const [row] = arm.cases, decode = row.validation.completeVideo;
  assert.match(arm.browser.version, /^\d+\.\d+\.\d+\.\d+$/);
  assert.equal(row.metrics.outputBytes, 2962151594);
  assert.equal(row.validation.fullVideoDecode, true);
  assert.equal(decode.status, "passed-complete-independent-video-decode");
  assert.equal(decode.decodedFrames, 296160);
  assert.equal(decode.finalOutputTimeSeconds, 12340);
  assert.equal(decode.duplicateFrames, 0);
  assert.equal(decode.droppedFrames, 0);
  assert.equal(decode.retainedDecodedFrames, 0);
  assert.equal(decode.decodedFileCreated, false);
  assert.equal(decode.nativeToolUsedForConversion, false);
  assert.match(row.validation.outputSha256, /^[a-f0-9]{64}$/);
  assert.ok(row.outputRemoved && arm.ownedRuntimeRemoved && report.toolDownloadRemoved);
  assert.ok(arm.serverCleanup.ownedRootAbsent);
  assert.equal(arm.browserCleanup.status, "owned-observed-pids-absent");
  assert.deepEqual(report.originalBefore, report.originalAfter);
  const memory = summarizeProtectedWindow(samples, row.conversionWindow, arm.blank.privateBytes);
  for (const key of ["peak", "incrementalPrivateMiB", "validSamples", "unavailableSamples", "start", "end"]) {
    assert.deepEqual(memory[key], arm.memory[key]);
  }
  const cleanup = (arm.cleanupStable.privateBytes - arm.loaded.privateBytes) / mib;
  assert.equal(cleanup, arm.memory.cleanupAboveIdleMiB);
  assert.ok(cleanup <= 96);
  const duration = memory.end - memory.start;
  assert.ok(duration > 0 && Number.isFinite(row.metrics.elapsedMs) && Number.isFinite(decode.elapsedMs));
  const selected = samples.filter(s => Date.parse(s.timestamp) >= memory.start && Date.parse(s.timestamp) <= memory.end);
  const csv = ["timestamp,seconds_since_conversion_start,private_bytes,rss_bytes,incremental_private_mib,available"];
  const lines = []; let points = [];
  const flush = () => { if (points.length) lines.push(`<polyline points="${points.join(" ")}"/>`); points = []; };
  for (const sample of selected) {
    const elapsed = Date.parse(sample.timestamp) - memory.start;
    const valid = sample.privateBytes !== null && Array.isArray(sample.processes);
    const increment = valid ? (sample.privateBytes - arm.blank.privateBytes) / mib : null;
    csv.push([sample.timestamp, elapsed / 1000, valid ? sample.privateBytes : "unavailable",
      sample.rssBytes ?? "unavailable", increment ?? "unavailable", valid].join(","));
    if (!valid) { flush(); continue; } // Missing measurements are gaps, never zero.
    points.push(`${(60 + elapsed / duration * 720).toFixed(2)},${(290 - increment * 0.8).toFixed(2)}`);
  }
  flush();
  const html = `<!doctype html><html lang="en"><meta charset="utf-8"><meta name="viewport" content="width=device-width"><title>Protected MP4 full-video validation</title>
<style>body{font:16px system-ui;max-width:900px;margin:2rem auto;padding:0 1rem;color:#172337}h1{font-size:1.6rem}svg{width:100%;height:auto}text{font:13px system-ui;fill:#172337}polyline{fill:none;stroke:#3266b0;stroke-width:2}td,th{padding:.6rem;text-align:left;border-bottom:1px solid #ccd}table{border-collapse:collapse;width:100%}code{overflow-wrap:anywhere}</style>
<h1>Protected MP4 full-video validation passed</h1>
<p>Unpublished candidate, installed Chrome ${arm.browser.version}. Headless evidence only; not manual/headed, all-browser, near-10 GB or public-release acceptance.</p>
<table><tr><th>Browser stream-copy conversion</th><td>${fixed(row.metrics.elapsedMs / 1000)} s</td></tr><tr><th>Finished output</th><td>${row.metrics.outputBytes} bytes</td></tr><tr><th>Independent native validation (not conversion)</th><td>${fixed(decode.elapsedMs / 1000)} s; ${decode.decodedFrames} frames; ${decode.finalOutputTimeSeconds} s endpoint; zero drops/duplicates</td></tr><tr><th>Whole-Chromium peak over stable blank</th><td>${fixed(memory.incrementalPrivateMiB)} MiB / 250 MiB</td></tr><tr><th>Cleanup over original loaded idle</th><td>${fixed(cleanup)} MiB / 96 MiB</td></tr></table>
<svg viewBox="0 0 840 340" role="img" aria-label="Whole Chromium process-tree private memory increase during the browser conversion"><text x="60" y="25">Incremental private memory (MiB), complete Chromium process tree</text><line x1="60" y1="90" x2="780" y2="90" stroke="#b92338" stroke-dasharray="5 4"/><text x="650" y="80">250 MiB limit</text><line x1="60" y1="290" x2="780" y2="290" stroke="#172337"/>${lines.join("")}<text x="35" y="295">0</text><text x="60" y="318">0 s</text><text x="700" y="318">${fixed(duration / 1000)} s</text></svg>
<p>${memory.validSamples} valid conversion-window samples; ${memory.unavailableSamples} unavailable, excluded from calculations and shown as a gap, never zero. Formula: peak complete Chromium-tree private bytes during conversion minus the same instance's stable blank private bytes. Later native decoding is a separate phase, not conversion time or browser-active memory.</p>
<p>Full output SHA-256: <code>${row.validation.outputSha256}</code>. Identical to the independently packet/PCM-validated prior output. All ${arm.browserCleanup.observedPids.length} observed owned Chromium PIDs, server, output and runtime/tool scratch removed; original size and SHA-256 unchanged. No decoded media file created.</p></html>\n`;
  return { csv: csv.join("\n") + "\n", html };
}
