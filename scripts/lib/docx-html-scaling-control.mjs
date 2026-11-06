import assert from "node:assert/strict";
export const DOCX_HTML_SCALING_PLAN = Object.freeze({ paragraphs: Object.freeze([2048, 32768]), repeats: 3,
  outputLimitBytes: 256 * 1048576, cleanupRecoveryLimitMiB: 96, sampleCap: 12000,
  conversionTimeoutMs: 300000, validatorTimeoutMs: 120000, requiredDiskBytes: 2 * 1024 ** 3 });

export function summarizeDocxHtmlRunMemory(samples, start, end, blank, loaded, cleanup) {
  assert.ok(Number.isFinite(start) && Number.isFinite(end) && end >= start);
  assert.equal(blank.stable, true); assert.equal(loaded.stable, true); assert.equal(cleanup.stable, true);
  const window = samples.filter(row => Date.parse(row.timestamp) >= start && Date.parse(row.timestamp) <= end);
  const valid = window.filter(row => row.privateBytes !== null && Array.isArray(row.processes));
  assert.ok(valid.length > 0, "Real conversion samples required; unavailable is never zero");
  for (const row of valid) {
    assert.ok(row.privateBytes > 0 && row.processes.length > 0);
    assert.equal(row.processes.reduce((total, process) => total + process.privateBytes, 0), row.privateBytes);
  }
  const peak = valid.reduce((a, b) => a.privateBytes >= b.privateBytes ? a : b);
  return { peak, validSamples: valid.length, unavailableSamples: window.length - valid.length,
    incrementalPrivateMiB: (peak.privateBytes - blank.privateBytes) / 1048576,
    conversionOnlyPrivateMiB: (peak.privateBytes - loaded.privateBytes) / 1048576,
    cleanupDeltaFromLoadedMiB: (cleanup.privateBytes - loaded.privateBytes) / 1048576,
    cleanupStable: cleanup, cleanupRecoveryLimitMiB: DOCX_HTML_SCALING_PLAN.cleanupRecoveryLimitMiB,
    windowStart: new Date(start).toISOString(), windowEnd: new Date(end).toISOString() };
}

export function renderDocxHtmlScalingSummary(report) {
  // Only finite numeric results and fixed labels, never document content/names.
  const runs = report.cases.filter(row => row.kind === "complete" && row.runMemory);
  assert.ok(runs.length <= 6);
  const data = runs.map(row => [row.sourceBytes / 1048576, row.outputBytes / 1048576,
    row.runMemory.incrementalPrivateMiB, row.metrics.elapsedMs / 1000, row.runMemory.cleanupDeltaFromLoadedMiB]);
  assert.ok(data.flat().every(Number.isFinite));
  const chart = column => {
    const maximum = Math.max(1, ...data.map(row => row[column]));
    const points = data.map((row, i) => `${30 + i * 65},${150 - row[column] / maximum * 120}`).join(" ");
    return `<svg viewBox="0 0 400 180" role="img"><title>Ordered measured runs; maximum ${maximum.toFixed(2)}</title><polyline fill="none" stroke="#c43" stroke-width="3" points="${points}"/></svg>`;
  };
  return '<!doctype html><html><head><meta charset="utf-8"><title>Private DOCX HTML scaling control</title></head><body>' +
    '<h1>Private DOCX HTML scaling control</h1><p>Not public qualification, native picker, full OOXML/layout, fresh-session or media evidence. No service exclusions or forced GC.</p>' +
    '<table><thead><tr><th>Run</th><th>Input MiB</th><th>Output MiB</th><th>Incremental private MiB</th><th>Seconds</th><th>Cleanup delta MiB</th></tr></thead><tbody>' +
    data.map((row, i) => `<tr><td>${i + 1}</td>${row.map(value => `<td>${value.toFixed(3)}</td>`).join("")}</tr>`).join("") +
    '</tbody></table><h2>Input/output scale</h2>' + chart(0) + chart(1) + '<h2>Whole-tree incremental memory</h2>' + chart(2) +
    '<h2>Processing time</h2>' + chart(3) + '<h2>Cleanup delta</h2>' + chart(4) + '</body></html>\n';
}
