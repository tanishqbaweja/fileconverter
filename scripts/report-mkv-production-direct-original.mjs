// Offline report only. Never opens the protected input or browser outputs.
import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { gunzipSync } from "node:zlib";
import { headerProtectedReference, readHeaderProtectedReference } from "./lib/mkv-header-protected-reference.mjs";
import { readProductionDirectSmallReference, productionDirectSmallReference } from "./lib/mkv-production-direct-small-reference.mjs";
import { summarizeProtectedWindow } from "./lib/mkv-protected-repeat-contract.mjs";
import { mkvProtectedCopy } from "./lib/mkv-protected-copy-contract.mjs";

const root = path.resolve(import.meta.dirname, ".."), mib = 1048576;
const sha = b => createHash("sha256").update(b).digest("hex");
const fixed = n => n.toFixed(3);
const within = (timestamp, window) => timestamp >= window.start && timestamp <= window.end;
const expectedReport = /^evidence\/\d{4}-\d{2}-\d{2}T\d{2}-\d{2}-\d{2}-\d{3}Z-mkv-hevc-header-core-production-direct-original-repeats\.json$/;

export async function replayProductionDirectOriginal(file) {
  assert.match(file, expectedReport);
  const bytes = await readFile(path.join(root, file)), r = JSON.parse(bytes);
  assert.equal(r.status, "passed-unmodified-production-direct-original-repeats-not-public-acceptance");
  for (const flag of ["headed", "browserServicesDisabled", "productionFilesReplaced", "nativeConversionUsed", "publicAcceptance", "speedGainProven"]) assert.equal(r[flag], false);
  assert.equal(r.originalMediaSelected, true);
  assert.deepEqual(r.originalBefore, { bytes: mkvProtectedCopy.bytes, sha256: mkvProtectedCopy.sha256 });
  assert.deepEqual(r.originalAfter, r.originalBefore);
  assert.ok(r.toolDownloadRemoved);
  assert.deepEqual(r.arms.map(a => a.cases.length), [3, 1]);
  assert.notDeepEqual(r.arms[0].identity, r.arms[1].identity);
  const protectedProof = readHeaderProtectedReference(await readFile(path.join(root, headerProtectedReference.file)), r.candidateBuild);
  const small = readProductionDirectSmallReference(await readFile(path.join(root, productionDirectSmallReference.file)), r.candidateBuild, r.sourcePins);
  assert.deepEqual(r.protectedReference, protectedProof);
  assert.deepEqual(r.productionDirectRecoveryReference, small);
  const jobs = [], sessions = [];
  for (const [index, a] of r.arms.entries()) {
    const session = index + 1;
    assert.ok(a.ownedRuntimeRemoved && a.serverCleanup.ownedRootAbsent);
    assert.ok(a.browserCleanup.status === "owned-observed-pids-absent" || a.birthCleanup?.allObservedBirthsAbsent);
    assert.deepEqual(a.forbiddenRequests, []);
    assert.deepEqual(a.failures, []);
    assert.equal(a.releaseWorker.sha256, small.workerSha256);
    assert.equal(a.productionWorkerBinding.sha256, small.workerSha256);
    assert.equal(a.releaseWorker.overrides, false); assert.equal(a.workerResponses, 0);
    assert.deepEqual(a.engineResponses, { module: a.cases.length, wasm: a.cases.length });
    assert.deepEqual(a.directEngineRequests, a.engineResponses);
    assert.equal(a.archive.file, file.replace(/\.json$/, `-production-direct-session${session}-native.json.gz`));
    const packed = await readFile(path.join(root, a.archive.file));
    assert.equal(packed.length, a.archive.bytes); assert.equal(sha(packed), a.archive.sha256);
    const raw = gunzipSync(packed, { maxOutputLength: 32 * mib });
    assert.equal(sha(raw), a.archive.decodedSha256);
    const samples = JSON.parse(raw);
    for (const s of samples) if (s.privateBytes !== null && Array.isArray(s.processes)) {
      assert.equal(s.processes.reduce((sum, p) => sum + p.privateBytes, 0), s.privateBytes);
    }
    const active = samples.filter(s => a.cases.some(c => within(Date.parse(s.timestamp), c.conversionWindow)));
    const available = active.filter(s => s.privateBytes !== null && Array.isArray(s.processes));
    assert.equal(available.length, a.memory.validSamples); assert.equal(active.length - available.length, a.memory.unavailableSamples);
    const peak = available.reduce((high, row) => high.privateBytes >= row.privateBytes ? high : row);
    assert.deepEqual(a.memory.peak, peak);
    assert.equal(a.memory.incrementalPrivateMiB, (peak.privateBytes - a.blank.privateBytes) / mib);
    const sessionCleanup = (a.cleanupStable.privateBytes - a.loaded.privateBytes) / mib;
    assert.equal(a.memory.cleanupAboveIdleMiB, sessionCleanup); assert.ok(sessionCleanup <= 96);
    for (const [i, c] of a.cases.entries()) {
      assert.equal(c.state, "complete");
      assert.ok(c.selection.completeOriginalSelected && !c.selection.sourceCopyCreated && c.outputRemoved);
      assert.deepEqual(c.destination, { profileId: "mkv-to-mp4", corrected: true, mode: "handle", realFileHandle: true, hasStagingName: false, fault: null });
      assert.equal(c.binding.convertedCopyCreated, false);
      assert.equal(c.metrics.outputBytes, protectedProof.outputBytes); assert.equal(c.validation.outputSha256, protectedProof.outputSha256);
      assert.ok(c.validation.candidateGate.passed && c.validation.fullVideoDecodeInheritedThroughWholeOutputIdentity);
      assert.equal(c.validation.fullVideoDecode, false);
      assert.ok(c.validation.structure.subtitleDisclosed && c.validation.structure.artworkDisclosed);
      for (const k of ["scratchBytes", "peakScratchBytes", "maxScratchReadChunkBytes", "maxScratchWriteChunkBytes"]) assert.equal(c.metrics[k] ?? 0, 0);
      assert.ok(c.metrics.maxReadChunkBytes > 0 && c.metrics.maxReadChunkBytes <= 262144);
      assert.ok(c.metrics.maxWriteChunkBytes > 0 && c.metrics.maxWriteChunkBytes <= mib);
      assert.ok(c.metrics.peakQueuedBytes > 0 && c.metrics.peakQueuedBytes <= mib);
      assert.equal(c.metrics.peakPendingOperations, 1); assert.equal(c.metrics.pendingOperations, 0);
      const memory = summarizeProtectedWindow(samples, c.conversionWindow, a.blank.privateBytes);
      assert.deepEqual(memory, c.memory);
      const cleanup = (c.cleanupStable.privateBytes - a.loaded.privateBytes) / mib;
      assert.equal(c.cleanupAboveIdleMiB, cleanup); assert.ok(cleanup <= 96);
      const elapsedSeconds = c.metrics.elapsedMs / 1000;
      assert.ok(Number.isFinite(elapsedSeconds) && elapsedSeconds > 0);
      jobs.push({ session, job: i + 1, elapsedSeconds, throughputMiBs: c.metrics.outputBytes / elapsedSeconds / mib,
        inputBytes: r.originalBefore.bytes, outputBytes: c.metrics.outputBytes, incrementalMiB: memory.incrementalPrivateMiB,
        cleanupMiB: cleanup, validSamples: memory.validSamples, unavailableSamples: memory.unavailableSamples });
    }
    sessions.push({ session, rows: samples.length, validConversionRows: available.length, sessionCleanup });
  }
  return { sha256: sha(bytes), outputSha256: protectedProof.outputSha256, jobs, sessions };
}

export function renderProductionDirectOriginal({ sha256, outputSha256, jobs, sessions }) {
  const titles = ["Session", "Job", "Seconds", "Output MiB/s", "Input bytes", "Output bytes", "Chrome delta MiB", "Cleanup delta MiB", "Valid samples", "Unavailable samples"];
  const rows = jobs.map(j => [j.session, j.job, fixed(j.elapsedSeconds), fixed(j.throughputMiBs), j.inputBytes, j.outputBytes,
    fixed(j.incrementalMiB), fixed(j.cleanupMiB), j.validSamples, j.unavailableSamples]);
  const csv = [titles, ...rows].map(r => r.join(",")).join("\n") + "\n";
  const chart = (property, max, title) => `<svg viewBox="0 0 640 142" role="img" aria-label="${title}"><title>${title}</title>
<text x="12" y="16">${title}</text><line x1="90" y1="24" x2="90" y2="130" stroke="#999"/><line x1="540" y1="24" x2="540" y2="130" stroke="#999"/>
${jobs.map((row, i) => `<text x="12" y="${42 + i * 25}">S${row.session} / J${row.job}</text><rect x="90" y="${30 + i * 25}" width="${450 * row[property] / max}" height="15" fill="#255b9e"/><text x="549" y="${42 + i * 25}">${fixed(row[property])}</text>`).join("\n")}</svg>`;
  const html = `<!doctype html><html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width">
<meta http-equiv="Content-Security-Policy" content="default-src 'none'; style-src 'unsafe-inline'"><title>Headless MKV direct-save repeat test</title>
<style>body{font:1rem system-ui;margin:2rem auto;max-width:78rem;padding:0 1rem;color:#172337}svg{width:min(100%,42rem);display:block}th,td{padding:.4rem;text-align:left;border-bottom:1px solid #ccd}section{overflow-x:auto}code{overflow-wrap:anywhere}</style></head>
<body><h1>Headless MKV direct-save repeat test</h1><p>Three same-page jobs and one fresh Chrome session passed. Real browser remux (stream copy, not re-encoding). No app-managed stage or retained output. This is not a matched speed benchmark or public-release approval.</p>
${chart("incrementalMiB", 250, "Full Chrome delta (MiB); right line is the 250 MiB limit")}
${chart("elapsedSeconds", Math.max(...jobs.map(j => j.elapsedSeconds)) * 1.05, "Browser conversion time (seconds)")}
<section><table><thead><tr>${titles.map(s => `<th scope="col">${s}</th>`).join("")}</tr></thead><tbody>${rows.map(r => `<tr>${r.map(v => `<td>${v}</td>`).join("")}</tr>`).join("")}</tbody></table></section>
<p>All three first-session jobs share the same original stable blank baseline; the fresh session uses its own. Cleanup uses loaded idle, not a replacement conversion baseline. Session-end cleanup: ${sessions.map(s => `S${s.session} ${fixed(s.sessionCleanup)} MiB`).join("; ")}.</p>
<p>Raw rows replayed: ${sessions.reduce((n, s) => n + s.rows, 0)}; valid conversion rows: ${sessions.reduce((n, s) => n + s.validConversionRows, 0)}. The native journals retain per-process samples.</p>
<p>Every exact output SHA-256: <code>${outputSha256}</code>. Packet/PCM/full-video content is inherited only through complete byte identity with the separately decoded output. JSON receipt SHA-256: <code>${sha256}</code>.</p></body></html>\n`;
  return { html, csv };
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  assert.equal(process.argv.length, 3);
  const file = process.argv[2], report = await replayProductionDirectOriginal(file);
  for (const [ext, content] of Object.entries(renderProductionDirectOriginal(report))) {
    const target = path.join(root, file.replace(/\.json$/, `.${ext}`));
    try { await writeFile(target, content, { flag: "wx" }); }
    catch (e) { if (e.code !== "EEXIST") throw e; assert.equal(await readFile(target, "utf8"), content); }
  }
  console.log(JSON.stringify(report));
}
