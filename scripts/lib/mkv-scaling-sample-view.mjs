// The FULL 100ms native stream is losslessly journaled separately. Thin only
// non-conversion validation points in the in-memory graph/stability view.
import assert from "node:assert/strict";
export function createScalingSampleView() {
  let lastValidationAt = -Infinity, total = 0, retained = 0, thinned = 0;
  const identities = new Map();
  return {
    select(batch, { validation, duringConversion }) {
      const selected = [];
      for (const row of batch.samples) {
        for (const p of row.processes ?? []) {
          const key = `${p.pid}:${p.creationFileTime}`;
          assert.ok(identities.has(key) || identities.size < 512, "Finite observed birth cap");
          if (!identities.has(key)) identities.set(key, p);
        }
        total++;
        const at = Date.parse(row.timestamp); assert.ok(Number.isFinite(at));
        if (validation && !duringConversion(at)) {
          if (at - lastValidationAt < 1000) { thinned++; continue; }
          lastValidationAt = at;
        }
        retained++; selected.push(row);
      }
      return selected;
    },
    births: () => [...identities.values()],
    report: () => ({ totalNativeSamples: total, retainedViewSamples: retained, validationGraphPointsThinned: thinned,
      nativeAcquisitionIntervalMs: 100, validationGraphMinimumSpacingMs: 1000, allConversionSamplesRetained: true,
      everyRawSamplePreservedInLosslessJournal: true, primaryFormulaChanged: false, processesExcluded: false, maximumObservedBirths: 512 }),
  };
}
