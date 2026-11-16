import assert from "node:assert/strict";
import { deriveScalingRepeatWindow } from "./mkv-large-scaling-repeat-report.mjs";
import { mkvProtectedCopy } from "./mkv-protected-copy-contract.mjs";
const fixed = n => typeof n === "number" && Number.isFinite(n) ? n.toFixed(3) : "unavailable";
const escape = s => String(s).replaceAll("&", "&amp;").replaceAll("<", "&lt;").replaceAll('"', "&quot;");
export function renderProductionStagedRepeatReport(r, nativeArms) {
  assert.equal(r.hevcHeaderProductionStagedOriginalRepeats, true); assert.equal(r.nativeConversionUsed, false); assert.equal(r.publicAcceptance, false);
  assert.equal(r.headed, false); assert.equal(r.browserServicesDisabled, false);
  assert.ok(["passed-unmodified-production-staged-original-repeats-not-public-acceptance", "failed-not-acceptance"].includes(r.status));
  assert.deepEqual(r.originalBefore, { bytes: mkvProtectedCopy.bytes, sha256: mkvProtectedCopy.sha256 }); assert.deepEqual(r.originalBefore, r.originalAfter);
  const passed = r.status.startsWith("passed-"); assert.ok(r.arms.length > 0 && r.arms.length <= 2); assert.equal(nativeArms.length, r.arms.length);
  if (passed) assert.deepEqual(r.arms.map(a => a.cases.length), [3, 1]);
  const jobs = [], nativeCsv = ["session,sequence,timestamp,available,in_recorded_conversion,tree_private_bytes,delta_original_blank_mib"];
  for (const [session, a] of r.arms.entries()) {
    const samples = nativeArms[session]; assert.ok(samples.length <= 20000);
    const windows = a.cases.map(c => c.conversionWindow && ({ ...c.conversionWindow, end: c.conversionWindow.end ?? a.memory?.end }));
    assert.equal(a.workerResponses, 0); assert.equal(a.releaseWorker.overrides, false);
    assert.equal(a.productionWorkerBinding.sha256, r.productionStagedRecoveryReference.productionWorkerSha256);
    for (const s of samples) {
      const valid = s.sampleError === null && Number.isFinite(s.privateBytes) && s.processes?.length > 0;
      if (valid) assert.equal(s.processes.reduce((n, p) => n + p.privateBytes, 0), s.privateBytes);
      const active = windows.some(w => w && Date.parse(s.timestamp) >= w.start && Date.parse(s.timestamp) <= w.end);
      assert.ok(!/[\r\n,"<>]/.test(s.timestamp));
      nativeCsv.push([session + 1, s.sequence, s.timestamp, valid, active, valid ? s.privateBytes : "unavailable",
        valid ? (s.privateBytes - a.blank.privateBytes) / 1048576 : "unavailable"].join(","));
    }
    const derived = [];
    for (const [index, c] of a.cases.entries()) {
      const memory = deriveScalingRepeatWindow(samples, windows[index], a.blank.privateBytes); assert.ok(memory);
      if (c.memory) assert.deepEqual(memory, c.memory);
      derived.push(memory);
      const cleanup = c.cleanupStable ? (c.cleanupStable.privateBytes - a.loaded.privateBytes) / 1048576 : null;
      if (cleanup !== null) assert.equal(cleanup, c.cleanupAboveIdleMiB);
      if (c.validation?.candidateGate?.passed) {
        assert.equal(c.validation.outputSha256, r.protectedReference.outputSha256); assert.equal(c.metrics.outputBytes, r.protectedReference.outputBytes);
        assert.equal(c.validation.fullVideoDecode, false); assert.equal(c.validation.fullVideoDecodeInheritedThroughWholeOutputIdentity, true);
        assert.equal(c.validation.independentValidation.noValidationReplay, true); assert.equal(c.validation.independentValidation.exactCurrentNativeBuildVerified, true);
        assert.equal(c.metrics.peakScratchBytes, c.metrics.outputBytes); assert.equal(c.metrics.scratchBytes, 0);
        assert.ok(c.metrics.maxScratchReadChunkBytes <= 524288 && c.metrics.maxScratchWriteChunkBytes <= 524288);
      }
      if (passed) assert.ok(c.state === "complete" && c.validation.candidateGate.passed && c.outputRemoved && memory.incrementalPrivateMiB <= 250 && cleanup !== null && cleanup <= 96);
      jobs.push({ session: session + 1, job: index + 1, state: c.state ?? "not-captured-before-budget-failure", elapsedMs: c.metrics?.elapsedMs ?? null,
        outputBytes: c.metrics?.outputBytes ?? null, outputSha256: c.validation?.outputSha256 ?? null, memory, cleanupAboveOriginalIdleMiB: cleanup,
        validatedOutputRemoved: c.outputRemoved === true, runtimeRemoved: a.ownedRuntimeRemoved === true });
    }
    assert.equal(derived.reduce((n, m) => n + m.validSamples, 0), a.memory.validSamples);
    assert.equal(derived.reduce((n, m) => n + m.unavailableSamples, 0), a.memory.unavailableSamples);
    assert.equal(Math.max(...derived.map(m => m.incrementalPrivateMiB)), a.memory.incrementalPrivateMiB);
    if (passed) assert.ok(a.ownedRuntimeRemoved && a.serverCleanup.ownedRootAbsent && a.memory.cleanupAboveIdleMiB !== null && a.memory.cleanupAboveIdleMiB <= 96);
  }
  const csv = ["session,job,state,elapsed_seconds,output_bytes,peak_incremental_private_mib,cleanup_original_idle_mib,valid_samples,unavailable_samples,validated_output_removed,owned_runtime_removed",
    ...jobs.map(j => [j.session, j.job, j.state, j.elapsedMs === null ? "unavailable" : j.elapsedMs / 1000, j.outputBytes ?? "unavailable",
      j.memory.incrementalPrivateMiB, j.cleanupAboveOriginalIdleMiB ?? "unavailable", j.memory.validSamples, j.memory.unavailableSamples,
      j.validatedOutputRemoved, j.runtimeRemoved].join(","))].join("\n") + "\n";
  const top = Math.max(300, ...jobs.map(j => j.memory.incrementalPrivateMiB)) * 1.1, y = n => 250 - n / top * 195;
  const bars = jobs.map((j, i) => `<rect x="${90 + i * 130}" y="${y(j.memory.incrementalPrivateMiB)}" width="65" height="${Math.max(0, j.memory.incrementalPrivateMiB) / top * 195}" fill="${j.memory.incrementalPrivateMiB <= 250 ? "#3266b0" : "#b92338"}"/><text x="${90 + i * 130}" y="${y(j.memory.incrementalPrivateMiB) - 10}">${fixed(j.memory.incrementalPrivateMiB)}</text><text x="${90 + i * 130}" y="275">S${j.session} J${j.job}</text>`).join("");
  const diagnostics = r.arms.flatMap(a => {
    const d = a.budgetFailureRoleDiagnostic; if (!d) return [];
    return [`Before quiescence: ${d.stateBeforeQuiescence?.phase ?? "unavailable"}; production cancellation requested: ${d.quiescence?.cancellationRequested === true}; terminal: ${d.quiescence?.terminalState ?? "unavailable"}.`,
      ...d.roles.map(p => {
        const peakChild = a.memory?.peak?.processes.find(q => q.pid === p.nativeBirth.pid && q.createdAt === p.nativeBirth.createdAt);
        return `Native child ${p.nativeBirth.pid}, birth ${p.nativeBirth.createdAt}, captured diagnostic snapshot ${fixed(p.nativeBirth.privateBytes / 1048576)} MiB; at the overall native peak ${fixed(peakChild?.privateBytes / 1048576)} MiB INCLUDED. Role census: ${p.result.status}; type ${p.result.type ?? "unavailable"}, subtype ${p.result.utilitySubtype ?? "unavailable"}.`;
      })];
  });
  const html = `<!doctype html><html lang="en"><meta charset="utf-8"><meta name="viewport" content="width=device-width"><title>Production-staged original repeat gate</title><style>body{font:15px system-ui;max-width:1000px;margin:2rem auto;padding:1rem;color:#172337}svg{width:100%;height:auto}text{font:12px system-ui;fill:#172337}table{width:100%;border-collapse:collapse}td,th{padding:.5rem;border-bottom:1px solid #ccd;text-align:left}</style>
<h1>Unmodified production-staged original repeat gate</h1><p>Status: ${escape(r.status)}. Actual protected original, planned3 same-page +1 clean-session. Corrected native code only; production worker/media/writer sources unmodified. Browser remux with real full-output stage and bounded512KiB final copy, NOT re-encoding, public release, near10GB, headed/manual coverage or a matched speedup.</p>
<svg viewBox="0 0 680 300" role="img" aria-label="Each original conversion whole Chrome private peak over SAME original blank"><path d="M60 ${y(250)}h570" stroke="#b92338" stroke-dasharray="5 4"/><text x="520" y="${y(250) - 10}">250MiB limit</text>${bars}</svg>
<table><tr><th>Session/job</th><th>State</th><th>Seconds</th><th>Peak MiB</th><th>Cleanup MiB</th><th>Full output validated/removed</th></tr>${jobs.map(j => `<tr><td>${j.session}/${j.job}</td><td>${escape(j.state)}</td><td>${fixed(j.elapsedMs === null ? null : j.elapsedMs / 1000)}</td><td>${fixed(j.memory.incrementalPrivateMiB)}</td><td>${fixed(j.cleanupAboveOriginalIdleMiB)}</td><td>${j.validatedOutputRemoved ? "yes" : "unverified; owned runtime " + (j.runtimeRemoved ? "removed" : "unverified")}</td></tr>`).join("")}</table>
<p>Every100ms native row retained; per-job and aggregate whole-tree sums/counts/peaks independently rederived without rebasing or excluding processes. Missing values stay unavailable, never zero. Each validated output matches EVERY byte of the SAME-core complete original packet/codec/PCM/video proof: inherited complete content, NOT a new decode.</p>
<p>A failed/incomplete job is not a validated output. A later production cancellation may clean it up but does not turn the memory failure into a pass. New-child roles stay unavailable if exact-birth census did not observe them; no retrospective role guess. Earlier private direct-retention and5GB-repeat failures remain FAILED.</p>${diagnostics.map(d => `<p>${escape(d)}</p>`).join("\n")}</html>\n`;
  return { csv, html, "native.csv": nativeCsv.join("\n") + "\n" };
}
