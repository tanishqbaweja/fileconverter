// Keep historical executed recipes untouched. Only post-failure measurement,
// source provenance, diagnostic deadline and identity-aware exit observation.
import assert from "node:assert/strict";
import path from "node:path";
import { pathToFileURL } from "node:url";
import { makeStaticUiOriginalDriver } from "./mpeg2-static-ui-original-recipe.mjs";
export function makeFailureOnlyOriginalDriver(source, root, resolvePackage, helperUrl) {
  const prior = makeStaticUiOriginalDriver(source, root, resolvePackage);
  const uri = name => JSON.stringify(pathToFileURL(path.join(root, `scripts/lib/${name}.mjs`)).href);
  const patches = [
    ["const diagnosticOnly = false;", "const diagnosticOnly = true;"],
    ["let startupSettlement = null;", `import { startNativeBudgetFailureObserver } from ${uri("native-budget-failure-observer")};
import { startBoundedRendererAttribution } from ${JSON.stringify(helperUrl)};
import { createIndependentBlinkSessions } from ${uri("independent-blink-sessions")};
import { observeOwnedProcessExit } from ${uri("owned-process-exit-observation")};
let rendererAttribution = null, rendererAttributionResult = null, nativeFailureCapture = null;
let completedReport, completedReportPath; export { completedReport, completedReportPath };
let startupSettlement = null;`],
    ['const sourceFiles = ["scripts/mpeg2-static-ui-original-memory.mjs",',
      'const sourceFiles = ["scripts/mpeg2-failure-only-attribution.mjs", "scripts/lib/mpeg2-failure-only-attribution-recipe.mjs", "scripts/lib/host-memory-preflight.mjs", "scripts/lib/native-budget-failure-observer.mjs", "scripts/lib/independent-blink-sessions.mjs", "scripts/lib/owned-process-exit-observation.mjs", "scripts/lib/largest-blink-attribution-recipe.mjs", "scripts/lib/largest-blink-type-summary.mjs", "scripts/lib/bounded-detailed-blink-type-summary.mjs", "scripts/lib/complete-blink-heap-summary.mjs", "scripts/lib/bounded-renderer-attribution.mjs", "scripts/lib/memory-infra-attribution.mjs", "scripts/lib/native-memory-bursts.mjs", "scripts/lib/largest-burst-prerequisites.mjs", "evidence/native-budget-failure-control-retry-2026-10-07.json", "evidence/largest-blink-type-control-2026-10-07.json", "evidence/mpeg2-largest-burst-attribution-2026-10-07.json", "scripts/mpeg2-static-ui-original-memory.mjs",'],
    ['-private-mpeg2-static-ui-original-native-100ms', '-private-mpeg2-failure-only-attribution-native-100ms'],
    ['"mpeg2-static-ui-original-runtime-"', '"mpeg2-failure-only-runtime-"'],
    ['observer = await startParallelMemoryObserver(chrome.pid, runtime.directory);', `observer = await startNativeBudgetFailureObserver(chrome.pid, runtime.directory, {
    getBlankBaseline: () => blankBaseline,
    onFailure: async event => {
      assert.equal(rendererAttribution, null, "Only one post-failure trace, none at startup");
      rendererAttribution = createIndependentBlinkSessions({ createSession: () => browser.newBrowserCDPSession(), startAttribution: startBoundedRendererAttribution, realms });
      return rendererAttribution.dump("native-budget-failure-" + event.after.sequence, event.after.processes);
    },
  });`],
    ['    await page.locator(\'[data-testid="convert-button"]\').click();', `    // No tracing before this point. Require complete native pre-click coverage.
    await observer.through(Date.now());
    const conversionPhaseAt = observer.setPhase("conversion-" + number);
    await observer.through(conversionPhaseAt);
    await page.locator('[data-testid="convert-button"]').click();`],
    ['const deadline = Date.now() + 6 * 60 * 60_000;', 'const deadline = Date.now() + 70 * 60_000;'],
    ['cleanup.conversionQuiescence = await cancelBrowserConversionBeforeCleanup(page);', `// Native sampler stays LIVE through the post-failure dump and trace drain.
    if (observer) nativeFailureCapture = await observer.finishCapture();
    if (rendererAttribution) {
      rendererAttributionResult = await rendererAttribution.stop();
      assert.equal(rendererAttributionResult.sessions.length, 1, "Exactly one post-failure detailed trace");
      assert.equal(rendererAttributionResult.status, "completed-diagnostic");
      assert.equal(nativeFailureCapture.callback?.result?.success, true);
    }
  });
  await attempt(async () => {
    cleanup.conversionQuiescence = await cancelBrowserConversionBeforeCleanup(page);`],
    ['finally { nativeMemory = observer.report(); }',
      'finally { nativeMemory = observer.report(); nativeFailureCapture = observer.failureCaptureReport(); }'],
    ["const { stdout } = await exec(\"powershell.exe\", [\"-NoProfile\", \"-NonInteractive\", \"-Command\",\n        `@(Get-CimInstance Win32_Process -Filter 'ProcessId = ${chrome.pid}').Count`]);\n      assert.equal(Number(stdout.trim()), 0, \"Owned Chrome root must actually be absent\");",
      'const identity = samples.flatMap(row => row.processes ?? []).find(row => row.pid === chrome.pid);\n      assert.ok(identity, "Actual owned root birth required");\n      cleanup.chromeRootExitObservation = await observeOwnedProcessExit(identity);\n      assert.equal(cleanup.chromeRootExitObservation.status, "owned-identity-absent");'],
    ['nativeMemory, failure, logs, forbiddenRequests,', 'nativeMemory, nativeFailureCapture, rendererAttributionResult, failure, logs, forbiddenRequests,'],
    ['Full protected original after measured static405card UI reuse, unchanged codec/settings/Chrome/allprocesses250MiB/formula/three runs/fidelity/cleanup, fixed five-minute startup settling/no larger denominator. No native OS-picker or conversion-speed-A/B certification',
      'ONE full-source private changed diagnostic: NO detailed tracing before actual native full-tree250MiB failure, then exactly one independently closed largest64 dump. Native acquisition remains live through finalization. Same original source/settings/fixed heaps/lower prospective blank/full formula/quality/cancel/finally;70minute diagnostic deadline. Not public/fidelity/speed/scaling acceptance or every-burst/callsite attribution.'],
    ['  process.stdout.write(`${report.status}: ${reportBase}.json\\n`);',
      '  completedReport = report; completedReportPath = `${reportBase}.json`;\n  process.stdout.write(`${report.status}: ${reportBase}.json\\n`);'],
  ];
  let result = prior;
  for (const [before, after] of patches) { assert.equal(result.split(before).length, 2, before); result = result.replace(before, after); }
  let reversed = result;
  for (const [before, after] of [...patches].reverse()) reversed = reversed.replace(after, before);
  assert.equal(reversed, prior, "Only declared diagnostic changes; no engine/source/baseline/quality/gate weakening");
  return result;
}
