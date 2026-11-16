import assert from "node:assert/strict";
import { mkvProtectedCopy } from "./mkv-protected-copy-contract.mjs";
const fixed = n => typeof n === "number" && Number.isFinite(n) ? n.toFixed(3) : "unavailable";
const escape = text => String(text).replaceAll("&", "&amp;").replaceAll("<", "&lt;").replaceAll('"', "&quot;");

export function deriveScalingRepeatWindow(samples, window, blank) {
  if (!window || !Number.isFinite(window.start) || !Number.isFinite(window.end) || !Number.isSafeInteger(blank) || blank <= 0) return null;
  assert.ok(window.end >= window.start);
  const selected = samples.filter(s => Date.parse(s.timestamp) >= window.start && Date.parse(s.timestamp) <= window.end);
  const valid = selected.filter(s => s.privateBytes !== null && Array.isArray(s.processes));
  if (!valid.length) return null;
  for (const s of valid) assert.equal(s.processes.reduce((n, p) => n + p.privateBytes, 0), s.privateBytes);
  const peak = valid.reduce((a, b) => a.privateBytes >= b.privateBytes ? a : b);
  return { ...window, peak, validSamples: valid.length, unavailableSamples: selected.length - valid.length,
    incrementalPrivateMiB: (peak.privateBytes - blank) / 1048576 };
}

export function renderScalingRepeatReport(report, nativeArms) {
  assert.equal(report.largeScalingRepeats, true); assert.equal(report.nativeConversionUsed, false); assert.equal(report.publicAcceptance, false);
  assert.ok(["passed-real-5gb-scaling-repeats-not-public-acceptance", "failed-not-acceptance"].includes(report.status));
  assert.ok(report.arms.length <= 2 && nativeArms.length === report.arms.length);
  assert.deepEqual(report.originalBefore, { bytes: mkvProtectedCopy.bytes, sha256: mkvProtectedCopy.sha256 });
  assert.deepEqual(report.originalBefore, report.originalAfter);
  const passed = report.status.startsWith("passed-");
  if (passed) assert.deepEqual(report.arms.map(a => a.cases.length), [3, 1]);
  const jobs = [];
  for (const [session, a] of report.arms.entries()) {
    const samples = nativeArms[session]; assert.ok(samples.length <= 20000);
    for (const [index, c] of a.cases.entries()) {
      const window = c.conversionWindow ? { ...c.conversionWindow, end: c.conversionWindow.end ?? a.memory?.end } : null;
      const memory = deriveScalingRepeatWindow(samples, window, a.blank?.privateBytes);
      if (c.memory) assert.deepEqual(memory, c.memory);
      const cleanup = c.cleanupStable && a.loaded ? (c.cleanupStable.privateBytes - a.loaded.privateBytes) / 1048576 : null;
      if (cleanup !== null) assert.equal(cleanup, c.cleanupAboveIdleMiB);
      if (passed) {
        assert.equal(c.state, "complete"); assert.ok(c.outputRemoved && c.validation.candidateGate.passed);
        assert.equal(c.metrics.inputBytes, report.largeScalingReference.sourceBytes);
        assert.equal(c.metrics.outputBytes, report.largeScalingReference.outputBytes);
        assert.equal(c.validation.outputSha256, report.largeScalingReference.outputSha256);
        assert.equal(c.validation.fullDecode, false); assert.equal(c.validation.fullDecodedContentInheritedThroughWholeOutputIdentity, true);
        assert.ok(c.validation.independentValidation.sameExactNativeBuildRequired && c.validation.independentValidation.noValidationReplay);
        assert.ok(memory.incrementalPrivateMiB <= 250 && cleanup !== null && cleanup <= 96);
      }
      jobs.push({ session: session + 1, job: index + 1, state: c.state ?? "unavailable", inputBytes: c.metrics?.inputBytes ?? null,
        outputBytes: c.metrics?.outputBytes ?? null, elapsedMs: c.metrics?.elapsedMs ?? null, memory, cleanupAboveOriginalIdleMiB: cleanup,
        outputSha256: c.validation?.outputSha256 ?? null, outputRemoved: c.outputRemoved === true });
    }
    if (passed) {
      assert.equal(a.nativeJournalMode, "every-100ms-native-row-in-finite-repeat-archive-no-thinning");
      assert.equal(a.browserCleanup.status, "owned-observed-pids-absent");
      assert.ok(a.ownedRuntimeRemoved && a.serverCleanup.ownedRootAbsent); assert.deepEqual(a.forbiddenRequests, []);
    }
  }
  if (passed) assert.ok(report.fixtureRuntimeRemoved && report.toolDownloadRemoved);
  const header = "session,job,state,input_bytes,output_bytes,elapsed_ms,peak_incremental_private_mib,cleanup_above_original_idle_mib,valid_samples,unavailable_samples,output_sha256,output_removed";
  const csv = [header, ...jobs.map(j => [j.session, j.job, j.state, j.inputBytes ?? "unavailable", j.outputBytes ?? "unavailable", j.elapsedMs ?? "unavailable",
    j.memory?.incrementalPrivateMiB ?? "unavailable", j.cleanupAboveOriginalIdleMiB ?? "unavailable", j.memory?.validSamples ?? "unavailable",
    j.memory?.unavailableSamples ?? "unavailable", j.outputSha256 ?? "unavailable", j.outputRemoved].map(value => {
    assert.ok(!/[\r\n,"<>]/.test(String(value))); return value;
  }).join(","))].join("\n") + "\n";
  const bars = jobs.map((j, i) => {
    const peak = j.memory?.incrementalPrivateMiB;
    return Number.isFinite(peak) ? `<rect x="${95 + i * 125}" y="${260 - Math.min(peak, 350) * 0.65}" width="65" height="${Math.max(0, Math.min(peak, 350)) * 0.65}" fill="#3266b0"/><text x="${95 + i * 125}" y="${250 - Math.min(peak, 350) * 0.65}">${fixed(peak)}</text><text x="${95 + i * 125}" y="282">S${j.session} J${j.job}</text>` : "";
  }).join("");
  const rows = jobs.map(j => `<tr><td>${j.session}</td><td>${j.job}</td><td>${escape(j.state)}</td><td>${fixed(j.elapsedMs === null ? null : j.elapsedMs / 1000)}</td><td>${fixed(j.memory?.incrementalPrivateMiB)}</td><td>${fixed(j.cleanupAboveOriginalIdleMiB)}</td><td>${j.outputRemoved ? "yes" : "unverified"}</td></tr>`).join("");
  const cleanup = jobs.filter(j => j.session === 1).map(j => j.cleanupAboveOriginalIdleMiB);
  const rising = cleanup.length === 3 && cleanup.every(n => n !== null) && cleanup[1] > cleanup[0] && cleanup[2] > cleanup[1];
  const html = `<!doctype html><html lang="en"><meta charset="utf-8"><meta name="viewport" content="width=device-width"><title>Real5.35GB repeat results</title>
<style>body{font:16px system-ui;max-width:950px;margin:2rem auto;padding:1rem;color:#172337}table{border-collapse:collapse;width:100%}td,th{padding:.5rem;border-bottom:1px solid #ccd;text-align:right}svg{width:100%;height:auto}text{font:13px system-ui;fill:#172337}code{overflow-wrap:anywhere}</style>
<h1>Real5.35GB repeat results</h1><p>Status: ${escape(report.status)}. Required three same-page jobs and one clean-session repeat; not near10GB, public release, headed/manual evidence or a speedup benchmark.</p>
<p>EVERY output byte is hashed and bound, with the entire source and SAME exact authenticated native build, to the fresh complete packet/codec/video/PCM proof. This is inherited complete content evidence, NOT a fresh native decode. Every100ms native row remains in each session's authenticated archive, with no thinning or process exclusion. Primary peak uses the SAME session's ORIGINAL blank; cleanup uses ORIGINAL loaded idle, never rebased.</p>
<svg viewBox="0 0 680 310" role="img" aria-label="Every repeat's whole-Chrome private peak above its original blank"><text x="10" y="20">Peak incremental private memory (MiB)</text><line x1="60" y1="97.5" x2="640" y2="97.5" stroke="#b92338" stroke-dasharray="5 4"/><text x="540" y="85">250 MiB limit</text>${bars}</svg>
<table><thead><tr><th>Session</th><th>Job</th><th>State</th><th>Seconds</th><th>Peak MiB</th><th>Cleanup MiB</th><th>Removed</th></tr></thead><tbody>${rows}</tbody></table>
<p>${rising ? "Same-session cleanup rose on EVERY job: " + cleanup.map(fixed).join(" → ") + " MiB. This does not prove flat retained memory; the trend remains open." : "These four observations do not establish unlimited long-session memory stability."}</p>
<p>Content reference: <code>${escape(report.largeScalingReference?.file ?? "unavailable")}</code>. Output SHA-256: <code>${escape(report.largeScalingReference?.outputSha256 ?? "unavailable")}</code>. Missing samples stay unavailable, never zero.</p></html>\n`;
  return { csv, html };
}
