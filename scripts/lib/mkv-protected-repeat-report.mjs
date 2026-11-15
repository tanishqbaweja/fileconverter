import assert from "node:assert/strict";

const escape = value => String(value).replaceAll("&", "&amp;").replaceAll("<", "&lt;").replaceAll('"', "&quot;");
const fixed = value => Number.isFinite(value) ? value.toFixed(3) : "unavailable";
export function renderProtectedRepeatReport(report) {
  assert.ok(["passed-protected-repeats-not-public-acceptance", "passed-startup-core-protected-not-public-acceptance",
    "passed-startup-core-protected-repeats-not-public-acceptance", "passed-header-core-protected-repeats-not-public-acceptance", "failed-not-acceptance"].includes(report.status));
  assert.ok(report.arms.length <= 2);
  const headerCore = report.hevcHeaderProtectedCandidate === true;
  const changedCore = report.startupProtectedCandidate === true || headerCore;
  if (report.status === "passed-header-core-protected-repeats-not-public-acceptance") assert.equal(report.hevcHeaderProtectedRepeats, true);
  if (report.status.startsWith("passed-startup-core-")) assert.equal(changedCore, true);
  const memory = (row, arm) => row.memory ?? (changedCore && arm.cases.length === 1 ? arm.memory : undefined);
  const cleanup = (row, arm) => row.cleanupAboveIdleMiB ?? (changedCore && arm.cases.length === 1 ? arm.memory?.cleanupAboveIdleMiB : undefined);
  const header = ["session", "job", "state", "input_bytes", "output_bytes", "elapsed_ms", "peak_incremental_private_mib", "cleanup_above_idle_mib", "valid_samples", "unavailable_samples", "output_sha256", "output_removed"];
  const rows = [], table = [];
  for (const [session, arm] of report.arms.entries()) for (const [job, row] of arm.cases.entries()) {
    assert.ok(job < 3);
    const values = [session + 1, job + 1, row.state ?? "unavailable", report.originalBefore.bytes,
      row.metrics?.outputBytes ?? "unavailable", row.metrics?.elapsedMs ?? "unavailable",
      memory(row, arm)?.incrementalPrivateMiB ?? "unavailable", cleanup(row, arm) ?? "unavailable",
      memory(row, arm)?.validSamples ?? "unavailable", memory(row, arm)?.unavailableSamples ?? "unavailable",
      row.validation?.outputSha256 ?? "unavailable", row.outputRemoved === true];
    assert.ok(values.every(value => !/[\r\n,"<>]/.test(String(value))));
    rows.push(values.join(","));
    table.push(`<tr><td>${session + 1}</td><td>${job + 1}</td><td>${escape(values[2])}</td><td>${fixed(row.metrics?.elapsedMs / 1000)}</td><td>${fixed(memory(row, arm)?.incrementalPrivateMiB)}</td><td>${fixed(cleanup(row, arm))}</td><td>${row.outputRemoved === true ? "yes" : "unverified"}</td></tr>`);
  }
  const csv = [header.join(","), ...rows].join("\n") + "\n";
  const chartRows = report.arms.flatMap((arm, session) => arm.cases.map((row, job) => ({ row, arm, label: `S${session + 1} J${job + 1}` })));
  const bars = chartRows.map(({ row, arm, label }, index) => {
    const peak = memory(row, arm)?.incrementalPrivateMiB;
    if (!Number.isFinite(peak)) return `<text x="${95 + index * 125}" y="270">${label}: unavailable</text>`;
    const height = Math.max(0, Math.min(300, peak)) * 0.7;
    return `<rect x="${95 + index * 125}" y="${260 - height}" width="65" height="${height}" fill="#3266b0"/><text x="${95 + index * 125}" y="${250 - height}">${fixed(peak)}</text><text x="${100 + index * 125}" y="282">${label}</text>`;
  }).join("");
  const title = changedCore && report.arms.length === 1 && report.arms[0].cases.length === 1
    ? "Protected MKV first changed-core run" : "Protected MKV repeat results";
  const inherited = changedCore && chartRows.length > 0 && chartRows.every(({ row }) => row.validation?.fullVideoDecodeInheritedThroughWholeOutputIdentity === true);
  const videoText = inherited && headerCore
    ? "Prior complete packet, codec, PCM and video-decode evidence is bound by EVERY output byte on the SAME authenticated native build; no fresh full native decode is claimed."
    : inherited ? "Prior complete packet, PCM and video-decode evidence is bound by entire-output byte identity; no new full native decode or native-core equality is claimed." : "Full video decode remains unverified.";
  const fidelityText = changedCore ? "Each successful job is hashed in full and must match the independently validated prior output."
    : "Each successful repeat is hashed in full and must match the independently packet/audio-validated prior output.";
  const repeatCleanup = report.hevcHeaderProtectedRepeats === true ? report.arms[0]?.cases.map(row => row.cleanupAboveIdleMiB) : [];
  const risingCleanup = repeatCleanup.length === 3 && repeatCleanup.every(Number.isFinite)
    && repeatCleanup[1] > repeatCleanup[0] && repeatCleanup[2] > repeatCleanup[1];
  const cleanupText = risingCleanup
    ? `<p>Observed same-session post-cleanup memory rose on each run: ${repeatCleanup.map(fixed).join(" → ")} MiB over the ORIGINAL loaded idle. The increase from first to third was ${fixed(repeatCleanup[2] - repeatCleanup[0])} MiB. All were below the existing 96 MiB observation gate, but this does NOT establish flat retained memory or long-session stability. Allocation-level attribution and longer-session qualification remain open; the baseline was not rebased.</p>` : "";
  const html = `<!doctype html><html lang="en"><meta charset="utf-8"><meta name="viewport" content="width=device-width"><title>${title}</title>
<style>body{font:16px system-ui;max-width:900px;margin:2rem auto;padding:0 1rem;color:#172337}h1{font-size:1.6rem}td,th{padding:.6rem;text-align:right;border-bottom:1px solid #ccd}table{border-collapse:collapse;width:100%}svg{width:100%;height:auto}code{overflow-wrap:anywhere}text{font:13px system-ui;fill:#172337}</style>
<h1>${title}</h1><p>Status: <strong>${escape(report.status)}</strong>.</p>
<p>Original input: ${report.originalBefore.bytes} bytes. Entire Chromium process-tree private peak minus the same session's stable blank baseline; unchanged 250 MiB gate. Cleanup is compared with the original loaded-idle baseline, never rebased between jobs.</p>
<svg viewBox="0 0 680 310" role="img" aria-label="Each job's incremental private peak against the 250 MiB limit"><text x="10" y="20">Peak incremental private memory (MiB)</text><line x1="60" y1="85" x2="640" y2="85" stroke="#b92338" stroke-dasharray="5 4"/><text x="540" y="76">250 MiB limit</text><line x1="60" y1="260" x2="640" y2="260" stroke="#172337"/>${bars}</svg>
<table><thead><tr><th>Session</th><th>Job</th><th>State</th><th>Seconds</th><th>Peak MiB</th><th>Cleanup MiB</th><th>Output removed</th></tr></thead><tbody>${table.join("")}</tbody></table>
${cleanupText}<p>Output fidelity reference: <code>${escape(report.protectedReference?.outputSha256 ?? "unavailable")}</code>. ${fidelityText} ${videoText} Headless evidence is not manual/headed coverage; these results are not public-release or 10 GB acceptance.</p></html>\n`;
  return { csv, html };
}
