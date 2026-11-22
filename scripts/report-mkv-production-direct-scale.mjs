// Report the actual browser job, never process media or perform conversion.
import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { gunzipSync } from "node:zlib";
import { largeScalingReference, readLargeScalingReference } from "./lib/mkv-large-scaling-reference.mjs";
import { near10GbContentReference, readNear10GbContentReference } from "./lib/mkv-near10gb-content-reference.mjs";
import { assertMkvRecoveryPage, replayMkvProductionRecovery } from "./lib/mkv-current-production-recovery.mjs";
import { summarizeProtectedWindow } from "./lib/mkv-protected-repeat-contract.mjs";
import { mkvProtectedCopy } from "./lib/mkv-protected-copy-contract.mjs";

const root = path.resolve(import.meta.dirname, ".."), mib = 1048576;
const read = file => readFile(path.join(root, file));
const sha = b => createHash("sha256").update(b).digest("hex"), fixed = n => n.toFixed(3);

export async function replayProductionDirectScale(file) {
  const match = /^evidence\/\d{4}-\d{2}-\d{2}T\d{2}-\d{2}-\d{2}-\d{3}Z-mkv-hevc-header-core-production-direct-scale-(5gb|near10gb)\.json$/.exec(file);
  assert.ok(match, "Expected one scoped scale receipt inside evidence");
  const bytes = await read(file), r = JSON.parse(bytes), [arm] = r.arms, [job] = arm.cases;
  assert.equal(r.status, "passed-unmodified-production-direct-scaling-not-repeats-or-public-acceptance");
  assert.equal(r.productionDirectScaling, match[1]); assert.equal(r.arms.length, 1); assert.equal(arm.cases.length, 1);
  for (const flag of ["headed", "browserServicesDisabled", "nativeConversionUsed", "productionFilesReplaced", "originalMediaSelected", "publicAcceptance", "speedGainProven"]) assert.equal(r[flag], false);
  assert.deepEqual(r.originalBefore, { bytes: mkvProtectedCopy.bytes, sha256: mkvProtectedCopy.sha256 });
  assert.deepEqual(r.originalAfter, r.originalBefore);
  const reference = match[1] === "5gb" ? readLargeScalingReference(await read(largeScalingReference.file), r.candidateBuild)
    : readNear10GbContentReference(await read(near10GbContentReference.file), r.candidateBuild);
  assert.deepEqual(r.productionDirectScaleContentReference, reference);
  assert.equal(r.fixture.sha256, reference.sourceSha256); assert.equal(r.fixture.bytes, reference.sourceBytes);
  assert.equal(job.state, "complete"); assert.equal(job.selection.selectedFileBytes, reference.sourceBytes);
  assert.equal(job.metrics.outputBytes, reference.outputBytes); assert.equal(job.validation.outputSha256, reference.outputSha256);
  assert.ok(job.validation.candidateGate.passed && job.validation.fullDecodedContentInheritedThroughWholeOutputIdentity);
  assert.equal(job.validation.fullDecode, false);
  assert.deepEqual(job.destination, { profileId: "mkv-to-mp4", corrected: true, mode: "handle", realFileHandle: true, hasStagingName: false, fault: null });
  for (const k of ["scratchBytes", "peakScratchBytes", "maxScratchReadChunkBytes", "maxScratchWriteChunkBytes"]) assert.equal(job.metrics[k] ?? 0, 0);
  assert.ok(job.metrics.maxReadChunkBytes > 0 && job.metrics.maxReadChunkBytes <= 262144);
  assert.ok(job.metrics.maxWriteChunkBytes > 0 && job.metrics.maxWriteChunkBytes <= mib);
  assert.ok(job.metrics.peakQueuedBytes > 0 && job.metrics.peakQueuedBytes <= mib);
  assert.equal(job.metrics.peakPendingOperations, 1); assert.equal(job.metrics.pendingOperations, 0);
  assert.ok(job.outputRemoved && r.fixtureRuntimeRemoved && arm.ownedRuntimeRemoved && arm.serverCleanup.ownedRootAbsent);
  assert.ok(arm.browserCleanup.status === "owned-observed-pids-absent" || arm.birthCleanup?.allObservedBirthsAbsent);
  const small = await replayMkvProductionRecovery(r, read);
  assert.deepEqual(r.productionDirectRecoveryReference, small);
  assert.equal(arm.releaseWorker.sha256, small.workerSha256);
  assert.equal(arm.productionWorkerBinding.sha256, small.workerSha256);
  if (small.page) assertMkvRecoveryPage(arm.productionPageBinding, small);
  assert.equal(arm.releaseWorker.overrides, false); assert.equal(arm.workerResponses, 0);
  assert.deepEqual(arm.engineResponses, { module: 1, wasm: 1 }); assert.deepEqual(arm.engineResponses, arm.directEngineRequests);
  assert.deepEqual(arm.forbiddenRequests, []); assert.deepEqual(arm.failures, []); assert.deepEqual(r.failures, []);
  assert.equal(arm.archive.file, file.replace(/\.json$/, "-production-direct-native.json.gz"));
  const packed = await read(arm.archive.file); assert.equal(packed.length, arm.archive.bytes); assert.equal(sha(packed), arm.archive.sha256);
  const raw = gunzipSync(packed, { maxOutputLength: 48 * mib }); assert.equal(sha(raw), arm.archive.decodedSha256);
  const samples = JSON.parse(raw), valid = s => s.privateBytes !== null && Array.isArray(s.processes);
  for (const s of samples.filter(valid)) assert.equal(s.processes.reduce((total, p) => total + p.privateBytes, 0), s.privateBytes);
  const active = s => Date.parse(s.timestamp) >= job.conversionWindow.start && Date.parse(s.timestamp) <= job.conversionWindow.end;
  const memory = summarizeProtectedWindow(samples, job.conversionWindow, arm.blank.privateBytes);
  for (const k of ["incrementalPrivateMiB", "validSamples", "unavailableSamples", "peak"]) assert.deepEqual(memory[k], arm.memory[k]);
  const cleanup = (arm.cleanupStable.privateBytes - arm.loaded.privateBytes) / mib;
  assert.equal(arm.memory.cleanupAboveIdleMiB, cleanup); assert.ok(cleanup <= 96);
  const seconds = job.metrics.elapsedMs / 1000;
  assert.ok(Number.isFinite(seconds) && seconds > 0);
  const data = { scope: match[1], inputBytes: reference.sourceBytes, outputBytes: reference.outputBytes, seconds,
    throughputMiBs: reference.outputBytes / seconds / mib, peakMiB: memory.incrementalPrivateMiB, cleanupMiB: cleanup,
    rawRows: samples.length, validConversionRows: memory.validSamples, unavailableConversionRows: memory.unavailableSamples,
    outputSha256: reference.outputSha256, receiptSha256: sha(bytes) };
  const start = Date.parse(samples[0].timestamp);
  const rows = samples.map(s => ({ elapsed: (Date.parse(s.timestamp) - start) / 1000, active: active(s),
    delta: valid(s) ? (s.privateBytes - arm.blank.privateBytes) / mib : null }));
  return { data, rows };
}

export function renderProductionDirectScale({ data, rows }) {
  const keys = ["scope", "inputBytes", "outputBytes", "seconds", "throughputMiBs", "peakMiB", "cleanupMiB", "rawRows", "validConversionRows", "unavailableConversionRows"];
  const values = keys.map(k => Number.isInteger(data[k]) || typeof data[k] === "string" ? data[k] : fixed(data[k]));
  const csv = keys.join(",") + "\n" + values.join(",") + "\n";
  const duration = Math.max(1, rows.at(-1).elapsed), valid = rows.filter(p => p.delta !== null);
  const lo = Math.min(0, ...valid.map(p => p.delta)), hi = Math.max(270, ...valid.map(p => p.delta));
  const y = n => fixed(206 - 174 * (n - lo) / (hi - lo));
  const points = valid.map(p => `<circle cx="${fixed(48 + 556 * p.elapsed / duration)}" cy="${y(p.delta)}" r="1.2" fill="${p.active ? "#255b9e" : "#9ca3af"}"/>`).join("");
  const html = `<!doctype html><html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width">
<meta http-equiv="Content-Security-Policy" content="default-src 'none'; style-src 'unsafe-inline'"><title>Production direct MKV scaling</title>
<style>body{font:1rem system-ui;margin:2rem auto;max-width:55rem;padding:0 1rem;color:#172337}svg{width:min(100%,44rem)}td,th{padding:.4rem;text-align:left;border-bottom:1px solid #ccd}code{overflow-wrap:anywhere}</style></head>
<body><h1>Production direct MKV scaling</h1><p>One fresh real Chrome stream-copy pass. No app stage or retained output. Not a matched speed benchmark, repeat test or release approval.</p>
<svg viewBox="0 0 640 240" role="img" aria-label="Complete Chrome private memory above its original blank baseline"><text x="10" y="18">Chrome delta in MiB: blue during conversion, grey otherwise</text><line x1="48" x2="604" y1="${y(250)}" y2="${y(250)}" stroke="#a41535" stroke-dasharray="5 4"/>${points}<text x="48" y="230">0 s</text><text x="530" y="230">${fixed(duration)} s</text></svg>
<table>${keys.map((key, i) => `<tr><th scope="row">${key}</th><td>${values[i]}</td></tr>`).join("")}</table>
<p>Red line: 250 MiB whole-tree conversion limit. Unavailable samples are not plotted or replaced by zero. Cleanup is measured separately above loaded idle.</p>
<p>Output SHA-256: <code>${data.outputSha256}</code>. Complete content proof is inherited only through exact source, output and native build identity; no fresh full decode claim. Receipt SHA-256: <code>${data.receiptSha256}</code>.</p></body></html>\n`;
  return { csv, html };
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  assert.equal(process.argv.length, 3);
  const file = process.argv[2], report = await replayProductionDirectScale(file);
  for (const [ext, contents] of Object.entries(renderProductionDirectScale(report))) {
    const output = path.join(root, file.replace(/\.json$/, `.${ext}`));
    try { await writeFile(output, contents, { flag: "wx" }); }
    catch (e) { if (e.code !== "EEXIST") throw e; assert.equal(await readFile(output, "utf8"), contents); }
  }
  console.log(JSON.stringify(report.data));
}
