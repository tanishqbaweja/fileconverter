// Compact this owned diagnostic only; exact reversible archives precede removal of redundant JSON copies.
import assert from "node:assert/strict";
import { lstat, readFile, realpath, unlink, writeFile } from "node:fs/promises";
import path from "node:path";
import { gzipSync, gunzipSync } from "node:zlib";
import { sha } from "../images/resvg-source/source-pins.mjs";
assert.equal(process.argv.length, 2);
const root = path.resolve(import.meta.dirname, ".."), evidence = path.join(root, "evidence");
const parentPath = "evidence/2026-10-29T21-22-29-227Z-svg-blur-boundary-allocator-diagnostic.json";
const browserPath = "evidence/2026-10-29T21-22-29-880Z-source-svg-browser.json";
const output = "evidence/2026-10-29-svg-blur-boundary-allocation-terminal.json";
const bounded = async (file, limit) => {
  const absolute = path.join(root, file), info = await lstat(absolute);
  assert.ok(info.isFile() && !info.isSymbolicLink() && info.size > 0 && info.size <= limit);
  assert.equal(await realpath(absolute), absolute); return readFile(absolute);
};
const parentBytes = await bounded(parentPath, 4194304), browserBytes = await bounded(browserPath, 4194304);
const parent = JSON.parse(parentBytes), browser = JSON.parse(browserBytes);
assert.equal(parent.browserReceipt.path, browserPath); assert.equal(parent.browserReceipt.bytes, browserBytes.length);
assert.equal(parent.browserReceipt.sha256, sha(browserBytes)); assert.equal(parent.allocationOnly, true);
assert.equal(browser.allocationDiagnostic, true); assert.equal(browser.boundaryAllocationDiagnosticOnly, true);
assert.equal(browser.diagnosticPerturbsMemory, true); assert.equal(browser.publicEngineReplacement, false);
assert.equal(parent.allocatorCaptures.length, 3); assert.deepEqual(parent.allocatorErrors, []);
assert.equal(parent.ownedRuntimeRemoved, true); assert.equal(parent.ownedBrowserRuntimeRemoved, true);
assert.ok(parent.processCleanup.every(row => row.status === "owned-identity-absent"));
assert.equal(parent.ownerProcessCleanup.status, "owned-identity-absent");
assert.deepEqual(parent.protectedOriginalBefore, parent.protectedOriginalAfter);
const captures = [];
for (const row of parent.allocatorCaptures) {
  const result = row.result; assert.equal(result.status, "captured-live-light-memory-diagnostic");
  assert.equal(result.dataLossOccurred, false); assert.equal(result.acceptanceMetric, false);
  const relative = result.archive.path.replaceAll("\\", "/"); assert.match(relative, /^output\/playwright\/[\w-]+\.json\.gz$/);
  const compressed = await bounded(relative, 8388608); assert.equal(compressed.length, result.archive.bytes); assert.equal(sha(compressed), result.archive.sha256);
  const raw = gunzipSync(compressed, { maxOutputLength: 8388608 });
  assert.equal(raw.length, result.archive.restoredBytes); assert.equal(sha(raw), result.archive.restoredSha256);
  const trace = JSON.parse(raw), counts = new Map();
  for (const event of trace.traceEvents ?? []) for (const [name, details] of Object.entries(event.args?.dumps?.allocators ?? {})) {
    if (!/^blink_objects\/(Document|Frame|Node|WorkerGlobalScope|DetachedScriptState)$/.test(name)) continue;
    const counter = details.attrs?.object_count; assert.equal(counter.type, "scalar"); assert.equal(counter.units, "objects");
    assert.match(counter.value, /^[a-f0-9]{1,12}$/i); const value = Number.parseInt(counter.value, 16); assert.ok(Number.isSafeInteger(value));
    if (!counts.has(event.pid)) counts.set(event.pid, {}); counts.get(event.pid)[name] = value;
  }
  assert.equal(result.summary.length, 1); const summary = result.summary[0];
  assert.equal(summary.allocatorValuesOverlap, true); assert.equal(summary.summedAllocatorTotal, null);
  captures.push({ phase: row.phase, scheduledAt: row.scheduledAt, runnerStillLiveAtRequest: row.runnerStillLiveAtRequest,
    archive: { ...result.archive, path: relative }, acceptanceMetric: false, allocatorValuesOverlap: true, summedAllocatorTotal: null,
    processes: summary.processes.map(process => ({ pid: process.pid, traceName: process.traceName, osType: process.osType,
      osPrivateBytesBeforeDump: process.osPrivateBytesBeforeDump, tracePrivateFootprintBytes: process.tracePrivateFootprintBytes,
      allocatorCategories: Object.fromEntries(Object.entries(process.allocators).filter(([name]) => !name.includes("/") ||
        ["blink_gc/main", "blink_gc/workers", "v8/main/heap/code_space", "v8/workers/heap/code_space"].includes(name))),
      skiaGpuResources: process.liveAllocatorCounters["skia/gpu_resources"] ?? null, objectCounts: counts.get(process.pid) ?? null })) });
}
const rawReceipts = [];
for (const [file, bytes] of [[parentPath, parentBytes], [browserPath, browserBytes]]) {
  assert.equal(path.dirname(path.join(root, file)), evidence);
  const archive = gzipSync(bytes, { level: 9 }), archivePath = file + ".gz";
  await writeFile(path.join(root, archivePath), archive, { flag: "wx" });
  const retained = await bounded(archivePath, 4194304);
  assert.deepEqual(gunzipSync(retained, { maxOutputLength: 4194304 }), bytes);
  rawReceipts.push({ originalPath: file, originalBytes: bytes.length, originalSha256: sha(bytes),
    archivePath, archiveBytes: archive.length, archiveSha256: sha(retained), exactByteReversalVerified: true });
}
const report = { schemaVersion: 1, sourceHead: browser.executedHead, plan: "evidence/2026-10-29-svg-blur-boundary-allocation-plan.json",
  scope: "One perturbed diagnostic; unchanged prior265.445MiB failure remains authoritative, not another acceptance run",
  rawReceipts, captures, stats: parent.stats, components: parent.diagnostic.results.map(row => ({ component: row.component,
    alphaMismatches: row.alphaDiagnostics.mismatchedPixels, maximumAlphaError: row.alphaDiagnostics.maximumAbsoluteError,
    wholeSsim: row.wholeSsim, minimumBandSsim: row.minimumBandSsim })),
  diagnosticMemory: { perturbed: true, acceptanceMetric: false, incrementalPrivateMiB: browser.memory.incrementalPrivateMiB,
    peakPrivateBytes: browser.memory.peak.privateBytes, stableBlankPrivateBytes: browser.blankBaseline.privateBytes,
    validSamples: browser.memory.validSamples, unavailableSamples: browser.memory.unavailableSamples, limitMiB: 250 },
  nativeWasmSha256: browser.candidatePin.wasmSha256, qualityAndMemoryThresholdsChanged: false,
  forbiddenRequests: browser.forbiddenRequests.length, forbiddenRequestOverflow: browser.forbiddenRequestOverflow,
  allFourOwnedRootsAndOwnerAbsent: true, ownedRuntimeAndDisposableConversionDataRemoved: true,
  protectedOriginal: parent.protectedOriginalAfter, retainedFailureTrace: browser.failureTrace,
  originalUncompressedJsonCopiesRemovedAfterExactArchives: true,
  sourceRecompiled: false, publicEngineReplacement: false, wholeGoalComplete: false,
  specificAllocationStacksProven: false,
  conclusions: ["Renderer native categories grow across V8, Blink GC, malloc and PartitionAlloc; overlapping counters must not be added",
    "GPU capture includes increased Skia GPU-resource counters; it does not prove a particular allocation stack or production leak",
    "Post-suite Document/Frame/DetachedScriptState/WorkerGlobalScope counts require lifecycle investigation, not a forced-GC or snapshot/HAR-off acceptance workaround"],
  priorRejectedSnapshotHarOffControl: "evidence/2026-10-27-svg-snapshot-control-terminal.json",
  next: "Inspect retained per-document/worker lifetimes before changing production code; do not repeat this unchanged allocation experiment or disable default services/tracing to claim acceptance" };
await writeFile(path.join(root, output), JSON.stringify(report, null, 2) + "\n", { flag: "wx" });
for (const [file, bytes] of [[parentPath, parentBytes], [browserPath, browserBytes]]) {
  assert.deepEqual(await bounded(file, 4194304), bytes, "Only remove this exact owned redundant generated receipt");
  await unlink(path.join(root, file));
}
console.log(JSON.stringify({ output, rawJsonBytes: rawReceipts.reduce((n, row) => n + row.originalBytes, 0),
  retainedArchiveBytes: rawReceipts.reduce((n, row) => n + row.archiveBytes, 0), captures: captures.length,
  diagnosticMemory: report.diagnosticMemory, publicEngineReplacement: false }));
