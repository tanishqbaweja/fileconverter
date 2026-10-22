import assert from "node:assert/strict";
import { finishOwnedCleanup } from "./owned-runtime-scratch.mjs";
import { describeOwnedCleanupError } from "./bounded-cleanup-error.mjs";

// Phases are ordered; independent actions inside a phase are all attempted.
// A failed observer/pin check must not bypass later owned-file cleanup. The
// caller still guards profile deletion on verified browser/server closure.
/** @param {Array<{name: string, actions: Array<() => unknown>}>} phases
 * @param {Array<{name: string, status: string, error?: unknown}>} reports */
export async function finishOwnedCleanupPhases(phases, reports = []) {
  assert.ok(Array.isArray(phases) && phases.length > 0 && phases.length <= 8);
  assert.equal(new Set(phases.map(phase => phase.name)).size, phases.length);
  for (const phase of phases) {
    assert.match(phase.name, /^[a-z][a-z-]{1,63}$/);
    assert.ok(Array.isArray(phase.actions) && phase.actions.length <= 32 && phase.actions.every(action => typeof action === "function"));
  }
  const errors = [];
  for (const phase of phases) {
    try {
      await finishOwnedCleanup(phase.actions);
      reports.push({ name: phase.name, status: "passed" });
    } catch (error) {
      reports.push({ name: phase.name, status: "failed", error: describeOwnedCleanupError(error) });
      errors.push(error);
    }
  }
  if (errors.length) throw new AggregateError(errors, "One or more owned cleanup phases failed");
  return reports;
}
