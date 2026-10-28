// Separate functional diagnostic; the original early-baseline and 250 MiB
// assertions still decide the final verdict, including a failing terminal exit.
import assert from "node:assert/strict";
import { makeReproducedSvgDirectStressQualification } from "./reproduced-svg-direct-stress-recipe.mjs";
import { sha } from "../../images/resvg-source/source-pins.mjs";
const replace = (source, before, after) => {
  assert.equal(source.split(before).length - 1, 1, "Exact SVG execution diagnostic anchor: " + before);
  return source.replace(before, after);
};
export function makeSvgExecutionDiagnostic(options) {
  const base = makeReproducedSvgDirectStressQualification(options), suiteEdits = [];
  let suite = base.suite;
  const edit = (before, after) => { suite = replace(suite, before, after); suiteEdits.push([before, after]); };
  edit('    let stressPixelComparisonMs: number | null = null;',
    '    let stressPixelComparisonMs: number | null = null;\n    let executionRecovery: unknown = null;');
  edit('await page.goto(stressRepeat ? "/?test=1&directory=1" : "/?test=1");',
    'await page.goto(stressRepeat ? "/?test=1&directory=1" + (stressRepeat === "8m-grid-repeat-3" ? "&fault=write" : "") : "/?test=1");');
  const begin = suite.indexOf("for (const [\n  profileId,\n  sourceName,"), end = suite.indexOf('\n\ntest("GIF to JPEG XL preserves every frame', begin);
  assert.ok(begin > 0 && end > begin);
  const beforeClick = '      await page.locator(\'[data-testid="convert-button"]\').click();';
  const recovery = `      if (stressRepeat === "8m-grid-repeat-2" || stressRepeat === "8m-grid-repeat-3") {
        const timeOriginBefore = await page.evaluate(() => performance.timeOrigin);
        let cancelClick: { phase: string; atMs: number } | null = null;
        if (stressRepeat === "8m-grid-repeat-2") {
          [cancelClick] = await Promise.all([
            page.evaluate(() => new Promise<{ phase: string; atMs: number }>((resolve, reject) => {
              const observer = new MutationObserver(() => {
                const phase = document.querySelector(".progress-topline strong")?.textContent;
                const button = document.querySelector<HTMLButtonElement>("button.cancel");
                if (phase !== "Encoding PNG" || !button) return;
                observer.disconnect(); clearTimeout(deadline);
                button.click(); resolve({ phase, atMs: performance.now() });
              });
              const deadline = setTimeout(() => { observer.disconnect(); reject(new Error("No real rasterization UI phase observed for cancellation")); }, 10000);
              observer.observe(document.body, { subtree: true, childList: true, characterData: true });
            })),
            page.locator('[data-testid="convert-button"]').click(),
          ]);
        } else await page.locator('[data-testid="convert-button"]').click();
        const expectedState = stressRepeat === "8m-grid-repeat-2" ? "cancelled" : "error";
        await expect.poll(() => page.evaluate(() => window.__WITHIN_TEST__?.getState().jobState), { timeout: 30000 }).toBe(expectedState);
        const failed = await page.evaluate(() => window.__WITHIN_TEST__?.getState());
        expect(failed!.metrics.svgExecutionResources).toMatchObject({ phase: "aborted", cancellationBytes: 4,
          destinationSharedBytes: 266272, allocatedSharedBytes: 266276, destinationWorkerCount: 0, peakKnownWorkerCount: 2 });
        expect(failed!.metrics.activeWorkerCount).toBe(1);
        expect(failed!.metrics.queuedBytes).toBe(0); expect(failed!.metrics.pendingOperations).toBe(0);
        if (expectedState === "cancelled") {
          expect(failed!.metrics.outputBytes).toBe(0);
          expect(failed!.metrics.svgMemoryObservation!.phaseBytes.rasterized).toBeGreaterThan(0);
          expect(failed!.metrics.svgMemoryObservation!.phaseBytes.encoded).toBeUndefined();
        } else expect(failed!.error?.toLowerCase()).toContain("destination rejected a bounded write");
        const outputRemoved = await page.evaluate(async () => {
          const root = await navigator.storage.getDirectory();
          try { await root.getFileHandle("svg-grid-8m.png"); return false; }
          catch (error) { if (error instanceof DOMException && error.name === "NotFoundError") return true; throw error; }
        });
        expect(outputRemoved).toBe(true);
        await page.waitForFunction(() => window.__WITHIN_TEST__?.getState().workerStatus === "ready");
        await page.evaluate(() => history.replaceState(null, "", "/?test=1&directory=1"));
        await page.locator('[data-testid="file-input"]').setInputFiles(sourcePath);
        await page.locator('[data-testid="format-select"]').selectOption(profileId);
        const timeOriginAfter = await page.evaluate(() => performance.timeOrigin);
        expect(timeOriginAfter).toBe(timeOriginBefore);
        executionRecovery = { kind: expectedState, cancelClick, metrics: failed!.metrics, outputRemoved, timeOriginBefore, timeOriginAfter };
      }
`;
  let body = suite.slice(begin, end); body = replace(body, beforeClick, recovery + beforeClick);
  const after = suite.slice(0, begin) + body + suite.slice(end);
  suiteEdits.push([suite, after]); suite = after;
  edit('const evidence = JSON.stringify({ repeat: stressRepeat, destinationMode: "direct-handle-test-directory", independentlyValidatedRgbaPixels: true,',
    'const evidence = JSON.stringify({ repeat: stressRepeat, destinationMode: "direct-handle-test-directory", executionRecovery, independentlyValidatedRgbaPixels: true,');
  edit('        expect(state!.metrics.svgMemoryObservation).toMatchObject(',
    '        expect(state!.metrics.svgExecutionResources).toMatchObject({ phase: "closed", cancellationBytes: 4, destinationSharedBytes: 266272, allocatedSharedBytes: 266276, peakAllocatedSharedBytes: 266276, destinationWorkerCount: 0, peakKnownWorkerCount: 2 });\n' +
    '        expect(state!.metrics.sharedArrayBufferBytes).toBe(266276); expect(state!.metrics.activeWorkerCount).toBe(1);\n' +
    '        expect(state!.metrics.svgMemoryObservation).toMatchObject(');
  let driver = replace(base.driver, JSON.stringify(sha(base.suite)), JSON.stringify(sha(suite)));
  driver = replace(driver, 'assertionsChanged: false, thresholdsChanged: false,',
    'assertionsChanged: true, executionRecoveryAssertionsAdded: true, fidelityThresholdsChanged: false, thresholdsChanged: false,');
  const baselineAssertion = 'assert.equal(report.blankBaseline?.stable, true, "Do not delay/inflate the earliest stable blank baseline");';
  driver = replace(driver, baselineAssertion + ' report.baselineAdjusted = false;',
    'report.baselineAdjusted = false; report.executionDiagnostic = true; report.memoryAcceptance = false;\n' +
    '  report.earlyBaselineGatePassed = report.blankBaseline?.stable === true;\n' +
    '  report.earlyBaselineGateFailure = report.earlyBaselineGatePassed ? null : "No earliest stable blank baseline; final qualification must fail, functional diagnostic continues";');
  driver = replace(driver,
    'report.memory.incrementalPrivateMiB = (report.memory.peak.privateBytes - report.blankBaseline.privateBytes) / 1048576;',
    'report.memory.incrementalPrivateMiB = report.blankBaseline?.stable === true ? (report.memory.peak.privateBytes - report.blankBaseline.privateBytes) / 1048576 : null;');
  driver = replace(driver, '  assert.ok(report.memory.incrementalPrivateMiB <= 250, "Complete Chromium process-tree small-suite private-memory limit failed");',
    '  report.functionalAssertionsPassed = true;\n  ' + baselineAssertion + '\n' +
    '  assert.ok(report.memory.incrementalPrivateMiB <= 250, "Complete Chromium process-tree small-suite private-memory limit failed");');
  driver = replace(driver, '"passed-three-private-svg-grid-8m-direct-repeats-not-full-stress-or-release-acceptance"',
    '"completed-svg-execution-diagnostic-not-full-svg-or-release-acceptance"');
  driver = replace(driver, 'scope: "Three same-browser 3840x2160 SVG direct-handle conversions with exact independent RGBA equality; OS picker, effects, OOM/recovery and full release remain separate"',
    'scope: "SVG direct8M success, real UI cancellation between raster/PNG, direct write failure and same-page exact-pixel retries; final strict baseline/250 verdict retained, never release acceptance"');
  return { ...base, driver, suite, suiteEdits,
    proof: { ...base.proof, driverSha256: sha(driver), suiteSha256: sha(suite),
      executionDiagnostic: true, strictBaselineAssertionDeferredNotRemoved: true, original250MiBLimitRetained: true,
      unstableBaselineNeverUsedForCalculation: true, functionalPassCannotOverrideMemoryFailure: true,
      scope: "Three 8M direct successes, one real UI cancel and one direct write error, with same-page validated retries; not full release acceptance" } };
}
