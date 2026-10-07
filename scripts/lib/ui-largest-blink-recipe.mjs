// Keep the real original UI workflow, but use TWO independently closed
// one-dump sessions (not a larger buffer or lost multi-dump trace).
import assert from "node:assert/strict";
import { makeUiCompleteBlinkControl } from "./ui-complete-blink-recipe.mjs";
export function makeUiLargestBlinkControl(source, root, helperUrl) {
  let result = makeUiCompleteBlinkControl(source, root, helperUrl);
  const patches = [
    ['let realms, attribution, traceReport = null;', 'let realms, attribution;\nconst traceReports = [];'],
    ['  if (attribution) await attribution.dump(phase, tree.processes);', `  if (["native-sampling-start", "ui-control-settled-3s"].includes(phase)) {
    assert.ok(traceReports.length < 2, "Two independent single-dump sessions only");
    attribution = await startBoundedRendererAttribution(cdp, realms);
    await attribution.dump(phase, tree.processes);
    const trace = await attribution.stop(); traceReports.push(trace); attribution = null;
    assert.equal(trace.status, "completed-diagnostic");
  }`],
    ['  attribution = await startBoundedRendererAttribution(cdp, realms);\n  await snapshot("blank-ui-control-only");', '  await snapshot("blank-ui-control-only");'],
    [`  await attempt(async () => { if (attribution) { traceReport = await attribution.stop();
    assert.equal(traceReport.status, "completed-diagnostic"); cleanup.samplingStopped = true; } });`,
      `  await attempt(async () => { if (attribution) {
    assert.ok(traceReports.length < 2); traceReports.push(await attribution.stop()); attribution = null; }
    cleanup.samplingStopped = traceReports.length === 2 && traceReports.every(t => t.status === "completed-diagnostic"); });`],
    ['"scripts/diagnose-ui-complete-blink.mjs",',
      '"scripts/diagnose-ui-largest-blink.mjs", "scripts/lib/ui-largest-blink-recipe.mjs", "scripts/lib/largest-blink-attribution-recipe.mjs", "scripts/lib/largest-blink-type-summary.mjs", "scripts/lib/bounded-detailed-blink-type-summary.mjs", "scripts/diagnose-ui-complete-blink.mjs",'],
    ['scope: "Actual production UI source inspection and60format-selection changes; complete brief Blink heap/DOM control only"',
      'scope: "Actual production UI source inspection and60format-selection changes; two independent single detailed largest64 Blink sessions only"'],
    ['rows, traceReport, forbidden,', 'rows, traceReports, forbidden,'],
    ['-ui-complete-blink.json', '-ui-largest-blink.json'],
    ['await createOwnedRuntimeScratch("ui-complete-blink-")', 'await createOwnedRuntimeScratch("ui-largest-blink-")'],
  ];
  for (const [before, after] of patches) { assert.equal(result.split(before).length, 2, before); result = result.replace(before, after); }
  let reversed = result;
  for (const [before, after] of [...patches].reverse()) reversed = reversed.replace(after, before);
  assert.equal(reversed, makeUiCompleteBlinkControl(source, root, helperUrl), "Only explicit measurement/provenance changes");
  return result;
}
