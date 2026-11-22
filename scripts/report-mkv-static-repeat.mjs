// Read-only replay of compact Chrome samples; never opens media.
import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import { gunzipSync } from "node:zlib";

const root = path.resolve(import.meta.dirname, ".."), mib = 1048576, file = process.argv[2];
assert.equal(process.argv.length, 3);
assert.match(file, /^evidence\/\d{4}-\d\d-\d\dT\d\d-\d\d-\d\d-\d{3}Z-mkv-hevc-header-core-production-static-scale-5gb-repeats\.json$/);
const sha = b => createHash("sha256").update(b).digest("hex"), fmt = n => n == null ? "unavailable" : n.toFixed(3);
const bytes = await readFile(path.join(root, file)), report = JSON.parse(bytes);
assert.ok(["failed-not-acceptance", "passed-production-static-5gb-repeats-not-public-acceptance"].includes(report.status));
assert.equal(report.staticDelivery.responseBodiesOverridden, false);
const data = [];
for (const [i, a] of report.arms.entries()) {
  assert.equal(a.archive.file, file.replace(/\.json$/, `-production-direct-session${i + 1}-native.json.gz`));
  const packed = await readFile(path.join(root, a.archive.file));
  assert.equal(sha(packed), a.archive.sha256);
  const raw = gunzipSync(packed, { maxOutputLength: 32 * mib });
  assert.equal(sha(raw), a.archive.decodedSha256);
  const rows = JSON.parse(raw);
  for (const [j, c] of a.cases.entries()) {
    const w = c.conversionWindow;
    const active = w ? rows.filter(s => Date.parse(s.timestamp) >= w.start && Date.parse(s.timestamp) <= w.end) : [];
    const valid = active.filter(s => s.privateBytes !== null && Array.isArray(s.processes));
    for (const s of valid) assert.equal(s.processes.reduce((n, p) => n + p.privateBytes, 0), s.privateBytes);
    const delta = valid.length ? (Math.max(...valid.map(s => s.privateBytes)) - a.blank.privateBytes) / mib : null;
    if (c.memory) assert.equal(delta, c.memory.incrementalPrivateMiB);
    const terminal = c.state ?? (j === a.cases.length - 1 ? a.preCleanupJob?.state : null) ?? "unverified";
    assert.ok(["complete", "cancelled", "error", "unverified"].includes(terminal));
    data.push({ session: i + 1, job: j + 1, terminal, delta, valid: valid.length, missing: active.length - valid.length,
      seconds: c.metrics ? c.metrics.elapsedMs / 1000 : null, bytes: c.outputRemoved ? c.metrics.outputBytes : null, completeVerified: Boolean(c.outputRemoved && c.validation?.candidateGate?.passed) });
  }
}
const title = ["Session", "Job", "Terminal", "Peak MiB", "Valid samples", "Unavailable samples", "Conversion seconds", "Verified output bytes", "Validated"];
const rows = data.map(d => [d.session, d.job, d.terminal, fmt(d.delta), d.valid, d.missing, fmt(d.seconds), d.bytes ?? "unavailable", d.completeVerified]);
const csv = [title, ...rows].map(r => r.join(",")).join("\n") + "\n";
const upper = Math.max(275, ...data.map(d => d.delta ?? 0)), x = n => 84 + 475 * Math.max(0, n) / upper;
const chart = `<svg viewBox="0 0 640 ${58 + rows.length * 27}" role="img" aria-label="Peak complete Chrome private memory above the blank baseline per attempted job">
<title>Peak complete Chrome private memory above blank per job</title>
<line x1="${x(250)}" y1="22" x2="${x(250)}" y2="${40 + rows.length * 27}" stroke="#8a2433" stroke-dasharray="5 4"/><text x="${x(250) - 45}" y="16">250 MiB limit</text>
${data.map((d, i) => `<text x="6" y="${43 + i * 27}">S${d.session} J${d.job}</text>${d.delta === null ? "" : `<rect x="84" y="${30 + i * 27}" width="${x(d.delta) - 84}" height="15" fill="${d.delta > 250 ? "#a32e3e" : "#1c5b97"}"/>`}<text x="${x(d.delta ?? 0) + 6}" y="${43 + i * 27}">${fmt(d.delta)}</text>`).join("\n")}</svg>`;
const html = `<!doctype html><html lang="en"><meta charset="utf-8"><meta name="viewport" content="width=device-width"><meta http-equiv="Content-Security-Policy" content="default-src 'none'; style-src 'unsafe-inline'"><title>Served static MKV repeat gate</title>
<style>body{font:16px system-ui;max-width:68rem;margin:2rem auto;padding:0 1rem}svg{width:min(100%,42rem)}th,td{padding:.4rem;text-align:left;border-bottom:1px solid #ccd}section{overflow-x:auto}code{overflow-wrap:anywhere}</style>
<h1>Served static MKV repeat gate</h1><p>${report.status}. Measurements use the original stable blank for each session. Jobs without a complete validated output do not count.</p>${chart}
<section><table><thead><tr>${title.map(t => `<th scope="col">${t}</th>`).join("")}</tr></thead><tbody>${rows.map(r => `<tr>${r.map(c => `<td>${c}</td>`).join("")}</tr>`).join("")}</tbody></table></section>
<p>No substituted responses or public release acceptance. Archived report SHA-256: <code>${sha(bytes)}</code>.</p></html>\n`;
for (const [ext, contents] of Object.entries({ csv, html })) {
  const target = path.join(root, file.replace(/\.json$/, `.${ext}`));
  try { await writeFile(target, contents, { flag: "wx" }); }
  catch (error) { if (error.code !== "EEXIST") throw error; assert.equal(await readFile(target, "utf8"), contents); }
}
console.log(JSON.stringify(data));
