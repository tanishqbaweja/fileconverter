import assert from "node:assert/strict";
import { summarizeProtectedWindow } from "./mkv-protected-repeat-contract.mjs";
import { traceHexBytes } from "./memory-infra-attribution.mjs";

const mib = 1048576;
const finite = n => typeof n === "number" && Number.isFinite(n) && n >= 0;
const number = n => finite(n) ? n : null;
const total = (rows, field) => rows.length && rows.every(r => finite(r[field])) ? rows.reduce((sum, r) => sum + r[field], 0) : null;
const escape = text => String(text).replaceAll("&", "&amp;").replaceAll("<", "&lt;").replaceAll('"', "&quot;");
const display = n => typeof n === "number" && Number.isFinite(n) ? n.toFixed(3) : "unavailable";

export function extractRetentionBlinkHeaps(trace, point) {
  const [start, end] = point.summary.traceIntervalMicroseconds, rows = [];
  assert.ok(trace.traceEvents.length <= 100000);
  for (const event of trace.traceEvents) {
    if (event.ph !== "v" || event.ts < start || event.ts > end) continue;
    for (const [name, allocator] of Object.entries(event.args?.dumps?.allocators ?? {})) {
      if (!/^blink_gc\/(?:main|workers(?:\/worker_0x[0-9a-f]+)?)\/heap$/i.test(name)) continue;
      assert.ok(rows.length < 256);
      const bytes = key => {
        const attr = allocator.attrs?.[key];
        return attr?.type === "scalar" && attr.units === "bytes" ? traceHexBytes(attr.value) : null;
      };
      rows.push({ pid: event.pid, name, residentBytes: bytes("size"), committedBytes: bytes("committed_size"),
        allocatedObjectsBytes: bytes("allocated_objects_size"), pooledBytes: bytes("pooled_size"),
        valuesOverlap: true, nondeterministicDumpMayIncludeGarbage: true, callsiteCauseProven: false });
    }
  }
  return { phase: point.phase, rows };
}

export function summarizeMkvRetention(report, samples) {
  assert.equal(report.hevcHeaderProtectedRetention, true); assert.equal(report.diagnosticOnly, true);
  assert.equal(report.publicAcceptance, false); assert.equal(report.nativeConversionUsed, false);
  assert.equal(report.arms.length, 1);
  const [arm] = report.arms, diagnostic = arm.retention;
  assert.ok(diagnostic && diagnostic.perturbsMemory && diagnostic.acceptanceMetric === false && diagnostic.forcedGc === false);
  assert.ok(diagnostic.checkpoints.length <= 19 && arm.cases.length <= 6 && samples.length <= 20000);
  const checkpoints = diagnostic.checkpoints.map(row => {
    const targets = row.realms?.targetsAvailable === true ? row.realms.targets : null;
    const availableTargets = targets?.filter(t => t.error === null) ?? [];
    const processes = row.processes;
    const native = Array.isArray(processes) && processes.length > 0 && processes.every(p => finite(p.privateBytes))
      ? processes.reduce((sum, p) => sum + p.privateBytes, 0) : null;
    return { phase: row.phase, timestamp: row.startedAt, error: row.error,
      treePrivateBytes: native, treeAboveOriginalBlankMiB: native !== null ? (native - arm.blank.privateBytes) / mib : null,
      treeAboveOriginalLoadedMiB: native !== null ? (native - arm.loaded.privateBytes) / mib : null,
      targets: targets?.length ?? null, unavailableTargets: targets ? targets.length - availableTargets.length : null,
      // Incomplete realm sets must never become smaller apparent totals.
      usedJSHeapBytes: targets && availableTargets.length === targets.length ? total(targets, "usedJSHeapBytes") : null,
      allocatedJSHeapBytes: targets && availableTargets.length === targets.length ? total(targets, "allocatedJSHeapBytes") : null,
      backingStorageBytes: targets && availableTargets.length === targets.length ? total(targets, "backingStorageBytes") : null,
      documents: number(row.dom?.documents), nodes: number(row.dom?.nodes), jsEventListeners: number(row.dom?.jsEventListeners),
      realms: targets,
    };
  });
  const jobs = arm.cases.map(row => ({ state: row.state, outputRemoved: row.outputRemoved,
    outputBytes: row.metrics?.outputBytes ?? null, elapsedMs: row.metrics?.elapsedMs ?? null,
    memory: row.memory ? summarizeProtectedWindow(samples, row.conversionWindow, arm.blank.privateBytes) : null,
    cleanupAboveOriginalIdleMiB: row.cleanupAboveIdleMiB ?? null }));
  for (const [i, row] of jobs.entries()) if (row.memory) assert.deepEqual(row.memory, arm.cases[i].memory);
  const allocatorPoints = diagnostic.allocation.checkpoints.map(point => ({ phase: point.phase, error: point.error,
    processes: point.summary?.processes ?? null, allocatorValuesOverlap: true, summedAllocatorTotal: null }));
  const active = samples.filter(s => arm.cases.some(c => c.conversionWindow && Date.parse(s.timestamp) >= c.conversionWindow.start
    && Date.parse(s.timestamp) <= (c.conversionWindow.end ?? arm.memory?.end)));
  const valid = active.filter(s => s.privateBytes !== null && Array.isArray(s.processes));
  for (const s of valid) assert.equal(s.processes.reduce((sum, p) => sum + p.privateBytes, 0), s.privateBytes);
  const peak = valid.reduce((best, s) => !best || s.privateBytes > best.privateBytes ? s : best, null);
  const conversion = peak ? { incrementalPrivateMiB: (peak.privateBytes - arm.blank.privateBytes) / mib,
    timestamp: peak.timestamp, validSamples: valid.length, unavailableSamples: active.length - valid.length,
    processes: peak.processes.map(p => {
      const birth = arm.observer.birthTypeCapture.records.find(r => r.pid === p.pid && r.creationFileTime === p.creationFileTime);
      return { ...p, classification: birth?.status === "classified" ? { type: birth.type, utilitySubtype: birth.utilitySubtype } : null };
    }) } : null;
  if (arm.memory) {
    assert.equal(conversion.incrementalPrivateMiB, arm.memory.incrementalPrivateMiB);
    assert.equal(conversion.validSamples, arm.memory.validSamples); assert.equal(conversion.unavailableSamples, arm.memory.unavailableSamples);
  }
  return { status: report.status, checkpoints, jobs, allocatorPoints, conversion,
    diagnosticPerturbsMemory: true, privateMemoryIsPrimary: true, forcedGc: false,
    allocationCallsiteCauseProven: false, publicAcceptance: false, flatLongSessionMemoryProven: false };
}

export function renderMkvRetention(summary) {
  const fields = ["phase", "timestamp", "treePrivateBytes", "treeAboveOriginalBlankMiB", "treeAboveOriginalLoadedMiB",
    "targets", "unavailableTargets", "usedJSHeapBytes", "allocatedJSHeapBytes", "backingStorageBytes", "documents", "nodes", "jsEventListeners"];
  const csv = [fields.join(","), ...summary.checkpoints.map(row => fields.map(key => {
    const value = row[key] ?? "unavailable"; assert.ok(!/[\r\n,"<>]/.test(String(value))); return value;
  }).join(","))].join("\n") + "\n";
  const rows = summary.checkpoints.map(row => `<tr><td>${escape(row.phase)}</td><td>${display(row.treeAboveOriginalBlankMiB)}</td><td>${display(row.usedJSHeapBytes === null ? null : row.usedJSHeapBytes / mib)}</td><td>${display(row.allocatedJSHeapBytes === null ? null : row.allocatedJSHeapBytes / mib)}</td><td>${display(row.backingStorageBytes === null ? null : row.backingStorageBytes / mib)}</td><td>${row.nodes ?? "unavailable"}</td><td>${row.jsEventListeners ?? "unavailable"}</td></tr>`).join("");
  const points = summary.checkpoints.map((row, i) => finite(row.treeAboveOriginalBlankMiB)
    ? `<circle cx="${60 + i * 36}" cy="${270 - Math.min(row.treeAboveOriginalBlankMiB, 350) * 0.65}" r="3" fill="#2465ae"/>` : "").join("");
  const html = `<!doctype html><html lang="en"><meta charset="utf-8"><meta name="viewport" content="width=device-width"><title>Original-file retention diagnostic</title>
<style>body{font:15px system-ui;max-width:1100px;margin:2rem auto;padding:1rem;color:#172337}table{border-collapse:collapse;font-size:13px}td,th{padding:.4rem;border-bottom:1px solid #ccd;text-align:right}td:first-child{text-align:left}svg{width:100%;height:auto}text{font:13px system-ui;fill:#172337}</style>
<h1>Original-file retention diagnostic</h1><p>Status: ${escape(summary.status)}. Instrumentation perturbs memory; not release acceptance, a fresh video decode, a speed benchmark or multi-GB scaling proof. No forced GC or substituted baseline. Missing observations remain unavailable.</p>
<p>Rederived actual conversion-window full-tree peak: ${display(summary.conversion?.incrementalPrivateMiB)} MiB over original blank; valid / unavailable samples: ${summary.conversion?.validSamples ?? "unavailable"} / ${summary.conversion?.unavailableSamples ?? "unavailable"}. The unchanged 250 MiB failure is retained, never converted into a pass.</p>
<p>Checkpoint tree private bytes are diagnostic snapshots, not guaranteed peaks. Conversion-window peaks are independently rederived from the original whole-process native journal. JS heap, backing storage and allocator categories overlap and must NOT be added together or substituted for full-tree private bytes. Allocation callsite cause and flat long-session stability remain unproven.</p>
<svg viewBox="0 0 800 315" role="img" aria-label="Diagnostic checkpoint full-tree private memory over original blank"><text x="20" y="20">Checkpoint full-tree delta MiB over ORIGINAL blank; 250 MiB reference</text><line x1="55" y1="107.5" x2="750" y2="107.5" stroke="#b92338" stroke-dasharray="5 4"/>${points}<text x="55" y="300">Checkpoints in time order (not equally spaced in time)</text></svg>
<table><thead><tr><th>Checkpoint</th><th>Tree delta MiB</th><th>Used JS MiB</th><th>Allocated JS MiB</th><th>Backing MiB</th><th>DOM nodes</th><th>Listeners</th></tr></thead><tbody>${rows}</tbody></table></html>\n`;
  return { csv, html };
}
