// Compact cross-size reporting only. Never a converter or a new stress pass.
import assert from "node:assert/strict";
import { assertSameMkvNativeBuild } from "./mkv-protected-repeat-contract.mjs";
import { assertHevcHeaderParserCore } from "./mkv-hevc-header-core-reference.mjs";
import { mkvProtectedCopy } from "./mkv-protected-copy-contract.mjs";
const fixed = n => Number.isFinite(n) ? n.toFixed(3) : "unavailable";
const escape = s => String(s).replaceAll("&", "&amp;").replaceAll("<", "&lt;").replaceAll('"', "&quot;");

export function summarizeCurrentScalingPoint(r, samples, { file, sha256, label }) {
  assert.match(file, /^evidence\/[a-zA-Z0-9.-]+\.json$/); assert.match(sha256, /^[a-f0-9]{64}$/);
  assertHevcHeaderParserCore(r.candidateBuild); assert.equal(r.nativeConversionUsed, false); assert.equal(r.publicAcceptance, false);
  assert.equal(r.headed, false); assert.equal(r.browserServicesDisabled, false);
  assert.ok(["passed-header-core-protected-not-public-acceptance", "passed-first-real-5gb-scaling-not-repeats-or-public-acceptance",
    "passed-first-real-near10gb-scaling-not-repeats-or-public-acceptance", "failed-not-acceptance"].includes(r.status));
  assert.deepEqual(r.originalBefore, { bytes: mkvProtectedCopy.bytes, sha256: mkvProtectedCopy.sha256 }); assert.deepEqual(r.originalBefore, r.originalAfter);
  assert.equal(r.arms.length, 1); const [a] = r.arms; assert.equal(a.cases.length, 1); const [c] = a.cases;
  assert.equal(c.state, "complete"); assert.ok(samples.length > 0 && samples.length <= 20000);
  assert.equal(a.blank.stable, true); assert.equal(a.loaded.stable, true);
  const window = samples.filter(s => Date.parse(s.timestamp) >= c.conversionWindow.start && Date.parse(s.timestamp) <= c.conversionWindow.end);
  const valid = window.filter(s => s.sampleError === null && Number.isFinite(s.privateBytes) && s.privateBytes > 0 && s.processes?.length > 0);
  assert.ok(valid.length > 0); for (const s of valid) assert.equal(s.processes.reduce((n, p) => n + p.privateBytes, 0), s.privateBytes);
  const peak = (Math.max(...valid.map(s => s.privateBytes)) - a.blank.privateBytes) / 1048576;
  assert.equal(peak, a.memory.incrementalPrivateMiB); assert.equal(valid.length, a.memory.validSamples);
  assert.equal(window.length - valid.length, a.memory.unavailableSamples);
  assert.ok(a.ownedRuntimeRemoved && a.serverCleanup.ownedRootAbsent && r.toolDownloadRemoved);
  assert.equal(a.browserCleanup.status, "owned-observed-pids-absent");
  if (r.status.startsWith("passed-")) {
    assert.ok(c.validation.candidateGate?.passed && c.outputRemoved && peak <= 250);
    assert.ok(a.memory.cleanupAboveIdleMiB !== null && a.memory.cleanupAboveIdleMiB <= 96);
  }
  assert.ok(Number.isSafeInteger(r.fixture.bytes) && Number.isSafeInteger(c.metrics.outputBytes) && c.metrics.elapsedMs > 0);
  return { file, sha256, label, status: r.status, singleCompleteQualification: r.status.startsWith("passed-"),
    inputBytes: r.fixture.bytes, inputSha256: r.fixture.sha256, outputBytes: c.metrics.outputBytes, outputSha256: c.validation.outputSha256,
    elapsedSeconds: c.metrics.elapsedMs / 1000, inputMiBPerSecond: r.fixture.bytes / 1048576 / (c.metrics.elapsedMs / 1000),
    incrementalPrivateMiB: peak, cleanupAboveIdleMiB: a.memory.cleanupAboveIdleMiB, validSamples: valid.length, unavailableSamples: window.length - valid.length,
    originalBlankPrivateBytes: a.blank.privateBytes, loadedIdlePrivateBytes: a.loaded.privateBytes,
    fixtureFamily: r.fixture.parent ? "synthetic-1280x720-hevc-aac-loop" : "original-test.mkv-different-content",
    parentSha256: r.fixture.parent?.sha256 ?? null,
    fullContentGatePassed: c.validation.candidateGate?.passed === true, repeatsAcceptance: false, publicAcceptance: false };
}

export function renderCurrentScalingSeries(entries) {
  assert.equal(entries.length, 3);
  for (const { report: r } of entries) {
    assertSameMkvNativeBuild(entries[0].report.candidateBuild, r.candidateBuild);
    const original = entries[0].report.arms[0].browser, actual = r.arms[0].browser;
    assert.equal(actual.version, original.version); assert.equal(actual.launcher.sha256, original.launcher.sha256); assert.equal(actual.library.sha256, original.library.sha256);
  }
  const points = entries.map(e => summarizeCurrentScalingPoint(e.report, e.samples, e.reference));
  assert.equal(points[0].inputBytes, mkvProtectedCopy.bytes); assert.equal(points[1].inputBytes, 5347972392);
  assert.ok(points[2].inputBytes >= 9000000000 && points[2].inputBytes <= 10200000000);
  assert.equal(points[1].parentSha256, points[2].parentSha256); assert.ok(points[1].parentSha256);
  const summary = { schemaVersion: 1, scope: "three-current-core-single-output-scaling-observations-not-repeat-or-speedup-acceptance",
    exactNativeAndChromeBuildsMatch: true, nativeWasmSha256: entries[0].report.candidateBuild.build.artifacts["within-direct.wasm"].sha256,
    chromeVersion: entries[0].report.arms[0].browser.version, primaryFormulaChanged: false, processesExcluded: false,
    originalHasDifferentContentAndGeometry: true, matchedSyntheticParentOnly: [1, 2], conversionMethod: "browser stream-copy remux, not re-encoding",
    flatMemoryProven: false, productionSpeedupProven: false, repeatGatePassed: false, publicAcceptance: false, points };
  const columns = ["label", "status", "inputBytes", "outputBytes", "elapsedSeconds", "inputMiBPerSecond", "incrementalPrivateMiB", "cleanupAboveIdleMiB", "validSamples", "unavailableSamples"];
  const csv = columns.join(",") + "\n" + points.map(p => columns.map(k => { const v = p[k]; assert.ok(!/[,\r\n]/.test(String(v))); return v ?? "unavailable"; }).join(",")).join("\n") + "\n";
  const panels = [["incrementalPrivateMiB", "Whole-Chrome incremental MiB", 300], ["elapsedSeconds", "Browser remux seconds", 0], ["inputMiBPerSecond", "Input throughput MiB/s", 0]];
  const plots = panels.map(([key, title, minTop], i) => {
    const top = Math.max(minTop, ...points.map(p => p[key])) * 1.08, left = i * 320 + 42, y = n => 250 - n / top * 180;
    return `<text x="${left}" y="30">${title}</text><path d="M${left} 60V250h250" stroke="#79869a" fill="none"/>${key === "incrementalPrivateMiB" ? `<path d="M${left} ${y(250)}h250" stroke="#b92338" stroke-dasharray="4 3"/>` : ""}${points.map((p, n) => `<circle cx="${left + p.inputBytes / 1e10 * 240}" cy="${y(p[key])}" r="5" fill="${p.singleCompleteQualification ? "#2465ae" : "#b92338"}"/><text x="${left + p.inputBytes / 1e10 * 240 - 8}" y="${y(p[key]) - 12}">${n + 1}</text>`).join("")}<text x="${left}" y="280">0–10 decimal GB input</text>`;
  }).join("");
  const html = `<!doctype html><html lang="en"><meta charset="utf-8"><meta name="viewport" content="width=device-width"><title>Current MKV scaling observations</title><style>body{font:15px system-ui;max-width:1100px;margin:2rem auto;padding:1rem;color:#172337}svg{width:100%;height:auto}text{font:12px system-ui;fill:#172337}table{border-collapse:collapse;width:100%}th,td{padding:.5rem;border-bottom:1px solid #ccd;text-align:left}</style>
<h1>Current MKV scaling observations</h1><p>Same exact native Wasm and Chrome builds; separate original blank baselines retained for each browser session. Browser stream-copy remuxing, NOT re-encoding. One output per size, NOT repeated stress or release acceptance. Red points failed full qualification even if browser output completed.</p>
<svg viewBox="0 0 980 310" role="img" aria-label="Input size versus full Chrome incremental private memory, browser time and throughput">${plots}</svg>
<p>Point1 is protected test.mkv: DIFFERENT content and geometry. Only points2–3 repeat the same small source. Neither three isolated points nor a first passing output prove flat long-session memory, repeat acceptance or a matched optimization speedup. Earlier failed original retention and5GB repeats remain FAILED. No disabled services, omitted Chrome processes or rebased baselines.</p>
<table><tr><th>Point</th><th>Input / output GB</th><th>Seconds</th><th>MiB/s</th><th>Peak MiB</th><th>Cleanup MiB</th><th>Complete qualification</th></tr>${points.map((p, n) => `<tr><td>${n + 1}: ${escape(p.label)}</td><td>${fixed(p.inputBytes / 1e9)} / ${fixed(p.outputBytes / 1e9)}</td><td>${fixed(p.elapsedSeconds)}</td><td>${fixed(p.inputMiBPerSecond)}</td><td>${fixed(p.incrementalPrivateMiB)}</td><td>${p.cleanupAboveIdleMiB === null ? "unavailable" : fixed(p.cleanupAboveIdleMiB)}</td><td>${p.singleCompleteQualification ? "single case only" : "FAILED"}</td></tr>`).join("")}</table><p>Source receipts and complete output hashes are retained in the accompanying compact JSON. Conversion outputs and disposable sources/profiles were removed by the owning runs; this report creates no media.</p></html>\n`;
  return { summary, csv, html };
}
