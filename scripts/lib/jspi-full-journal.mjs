// Node-only bounded durable evidence. No additional browser instrumentation.
import assert from "node:assert/strict";
import { open, readFile } from "node:fs/promises";
import path from "node:path";
import { gzipSync, gunzipSync } from "node:zlib";
import { sha } from "./stable-ui-headless-baseline-recipe.mjs";
import { supervisorJournal } from "./bounded-supervisor-journal.mjs";

export function estimateJspiRemaining(metrics, sourceBytes) {
  const processed = metrics?.inputBytes, elapsed = metrics?.elapsedMs;
  if (!(Number.isFinite(processed) && processed > 0 && processed < sourceBytes && Number.isFinite(elapsed) && elapsed > 0)) return null;
  return Math.round(elapsed * (sourceBytes - processed) / processed);
}
export function createJspiFullJournal(root, reportBase, qualification, sourceHashes) {
  assert.equal(path.dirname(reportBase), path.join(root, "outputs/reports"));
  const records = [], writeProgress = supervisorJournal(reportBase + "-jspi-progress.json", 16384);
  let pending = false;
  return {
    records,
    async progress(number, state, incrementalPrivateMiB) {
      assert.ok(Number.isInteger(number) && number >= 1 && number <= 3); assert.equal(pending, false); pending = true;
      try {
        await writeProgress({ recordedAt: new Date().toISOString(), number, jobState: state?.jobState ?? null, phase: state?.phase ?? null,
          inputBytes: state?.metrics?.inputBytes ?? null, outputBytes: state?.metrics?.outputBytes ?? null,
          elapsedMs: state?.metrics?.elapsedMs ?? null, estimatedRemainingMs: estimateJspiRemaining(state?.metrics, 2958573265),
          estimateBasis: "Production progress inputBytes/elapsed; approximate, not a completion or validation claim",
          peakIncrementalPrivateMiB: incrementalPrivateMiB, independentlyValidatedRuns: records.length,
          publicAcceptance: false });
      } finally { pending = false; }
    },
    async validated(run, blankBaseline, loadedIdle) {
      assert.equal(pending, false); pending = true;
      try {
        assert.equal(run.number, records.length + 1); assert.ok(records.length < 3);
        assert.equal(run.state.jobState, "complete"); assert.equal(run.independentValidation.fullDecode, true);
        assert.ok(run.independentValidation.ssim >= 0.98 && run.independentValidation.frameCount === 296160);
        assert.ok(run.independentValidation.maximumTimestampErrorSeconds <= 0.001);
        assert.ok(run.incrementalPrivateMiB <= 250); assert.equal(run.recovery.stable, true);
        const raw = Buffer.from(JSON.stringify({ recordedAt: new Date().toISOString(), number: run.number, run, blankBaseline, loadedIdle,
          qualification, sourceHashes, originalValidationOutputDeletionAndRecoveryCompleted: true,
          threeRunSessionAcceptance: false, publicAcceptance: false }));
        assert.ok(raw.length <= 2097152); const zip = gzipSync(raw, { level: 9 });
        const file = reportBase + `-jspi-validated-full-${run.number}.json.gz`;
        const handle = await open(file, "wx");
        try { await handle.writeFile(zip); await handle.sync(); } finally { await handle.close(); }
        assert.deepEqual(gunzipSync(await readFile(file)), raw);
        records.push({ path: path.relative(root, file).replaceAll(path.sep, "/"), bytes: zip.length, sha256: sha(zip),
          restoredBytes: raw.length, restoredSha256: sha(raw), number: run.number });
      } finally { pending = false; }
    },
  };
}
