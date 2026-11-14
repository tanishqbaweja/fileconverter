import assert from "node:assert/strict";

const escape = value => String(value).replaceAll("&", "&amp;").replaceAll("<", "&lt;").replaceAll('"', "&quot;");
const fixed = value => Number.isFinite(value) ? value.toFixed(3) : "unavailable";
export function renderProtectedRepeatReport(report) {
  assert.ok(["passed-protected-repeats-not-public-acceptance", "failed-not-acceptance"].includes(report.status));
  assert.ok(report.arms.length <= 2);
  const header = ["session", "job", "state", "input_bytes", "output_bytes", "elapsed_ms", "peak_incremental_private_mib", "cleanup_above_idle_mib", "valid_samples", "unavailable_samples", "output_sha256", "output_removed"];
  const rows = [], table = [];
  for (const [session, arm] of report.arms.entries()) for (const [job, row] of arm.cases.entries()) {
    assert.ok(job < 3);
    const values = [session + 1, job + 1, row.state ?? "unavailable", report.originalBefore.bytes,
      row.metrics?.outputBytes ?? "unavailable", row.metrics?.elapsedMs ?? "unavailable",
      row.memory?.incrementalPrivateMiB ?? "unavailable", row.cleanupAboveIdleMiB ?? "unavailable",
      row.memory?.validSamples ?? "unavailable", row.memory?.unavailableSamples ?? "unavailable",
      row.validation?.outputSha256 ?? "unavailable", row.outputRemoved === true];
    assert.ok(values.every(value => !/[\r\n,"<>]/.test(String(value))));
    rows.push(values.join(","));
    table.push(`<tr><td>${session + 1}</td><td>${job + 1}</td><td>${escape(values[2])}</td><td>${fixed(row.metrics?.elapsedMs / 1000)}</td><td>${fixed(row.memory?.incrementalPrivateMiB)}</td><td>${fixed(row.cleanupAboveIdleMiB)}</td><td>${row.outputRemoved === true ? "yes" : "unverified"}</td></tr>`);
  }
  const csv = [header.join(","), ...rows].join("\n") + "\n";
  const chartRows = report.arms.flatMap((arm, session) => arm.cases.map((row, job) => ({ row, label: `S${session + 1} J${job + 1}` })));
  const bars = chartRows.map(({ row, label }, index) => {
    const peak = row.memory?.incrementalPrivateMiB;
    if (!Number.isFinite(peak)) return `<text x="${95 + index * 125}" y="270">${label}: unavailable</text>`;
    const height = Math.max(0, Math.min(300, peak)) * 0.7;
    return `<rect x="${95 + index * 125}" y="${260 - height}" width="65" height="${height}" fill="#3266b0"/><text x="${95 + index * 125}" y="${250 - height}">${fixed(peak)}</text><text x="${100 + index * 125}" y="282">${label}</text>`;
  }).join("");
  const html = `<!doctype html><html lang="en"><meta charset="utf-8"><meta name="viewport" content="width=device-width"><title>Protected MKV repeat results</title>
<style>body{font:16px system-ui;max-width:900px;margin:2rem auto;padding:0 1rem;color:#172337}h1{font-size:1.6rem}td,th{padding:.6rem;text-align:right;border-bottom:1px solid #ccd}table{border-collapse:collapse;width:100%}svg{width:100%;height:auto}code{overflow-wrap:anywhere}text{font:13px system-ui;fill:#172337}</style>
<h1>Protected MKV repeat results</h1><p>Status: <strong>${escape(report.status)}</strong>.</p>
<p>Original input: ${report.originalBefore.bytes} bytes. Entire Chromium process-tree private peak minus the same session's stable blank baseline; unchanged 250 MiB gate. Cleanup is compared with the original loaded-idle baseline, never rebased between jobs.</p>
<svg viewBox="0 0 680 310" role="img" aria-label="Each job's incremental private peak against the 250 MiB limit"><text x="10" y="20">Peak incremental private memory (MiB)</text><line x1="60" y1="85" x2="640" y2="85" stroke="#b92338" stroke-dasharray="5 4"/><text x="540" y="76">250 MiB limit</text><line x1="60" y1="260" x2="640" y2="260" stroke="#172337"/>${bars}</svg>
<table><thead><tr><th>Session</th><th>Job</th><th>State</th><th>Seconds</th><th>Peak MiB</th><th>Cleanup MiB</th><th>Output removed</th></tr></thead><tbody>${table.join("")}</tbody></table>
<p>Output fidelity reference: <code>${escape(report.protectedReference?.outputSha256 ?? "unavailable")}</code>. Each successful repeat is hashed in full and must match the independently packet/audio-validated prior output. Full video decode remains unverified. Headless evidence is not manual/headed coverage; these results are not public-release or 10 GB acceptance.</p></html>\n`;
  return { csv, html };
}
