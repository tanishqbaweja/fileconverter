// A failed multi-dump prerequisite lost trace data. This derivative removes
// the synthetic allocation and native-burst workflow, requests exactly ONE
// detailed blank snapshot, and keeps the SAME trace/serialization/realm caps.
import assert from "node:assert/strict";
import { makeDetailedBlinkControl } from "./detailed-blink-attribution-recipe.mjs";
export function makeSingleDetailedBlinkControl(source, root, helperUrl) {
  let generated = makeDetailedBlinkControl(source, root, helperUrl);
  const change = (before, after) => {
    assert.equal(generated.split(before).length, 2, before); generated = generated.replace(before, after);
  };
  const start = generated.indexOf("  observer = await startBurstMemoryObserver(");
  const end = generated.indexOf("} catch (error) { failure = String(error);", start);
  assert.ok(start > 0 && end > start);
  const before = generated.slice(start, end);
  assert.ok(before.includes("new Uint8Array(40 * 1048576)"));
  change(before, `  assert.equal((await attribution.dump("blank-single-detailed-control")).success, true);
  trace = await attribution.stop(); cleanup.traceStopped = true;
  assert.equal(trace.status, "completed-diagnostic");
  assert.equal(trace.trace.dataLossOccurred, false); assert.equal(trace.trace.overflow, false);
  assert.equal(trace.allocatorSummary.length, 1);
`);
  const cleanupStart = generated.indexOf("  await attempt(async () => {\n    if (page && !page.isClosed()) {");
  const cleanupEnd = generated.indexOf("  await attempt(async () => {\n    if (observer)", cleanupStart);
  assert.ok(cleanupStart > 0 && cleanupEnd > cleanupStart);
  change(generated.slice(cleanupStart, cleanupEnd), "");
  change('const cleanup = { syntheticReferenceRemoved: false, observerStopped: false, traceStopped: false,',
    'const cleanup = { traceStopped: false,');
  // No native observer runs: sampled-identity absence is not a completed check.
  change('sampledIdentitiesAbsent: false, runtimeRemoved: false', 'runtimeRemoved: false');
  change('syntheticAllocationBytes: 40 * 1048576', 'syntheticAllocationBytes: 0');
  change('scope: "actual-detailed-blink-type-synthetic-blank-browser-prerequisite"',
    'scope: "actual-single-detailed-blink-type-blank-browser-prerequisite"');
  change('-detailed-blink-type-control.json', '-single-detailed-blink-type-control.json');
  change('"scripts/probe-detailed-blink-types.mjs",',
    '"scripts/probe-single-detailed-blink-types.mjs", "scripts/lib/single-detailed-blink-control-recipe.mjs", "scripts/probe-detailed-blink-types.mjs",');
  change('This deliberately perturbed short control proves a bounded native-triggered dump, not attribution of the original failure, stable startup baseline, production correctness, conversion speed or 250MiB acceptance. No GC was forced; reference removal does not prove immediate memory reclamation.',
    'Single nondeterministic detailed blank dump only; no native observer, synthetic allocation, converter or user file. Existing trace caps unchanged. No original-cause, live-object, stable baseline or conversion acceptance proof. No GC forced.');
  return generated;
}
