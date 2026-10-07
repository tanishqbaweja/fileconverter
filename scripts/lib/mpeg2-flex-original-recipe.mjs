// Real full-source/three-repeat candidate; only measured CSS + bounded counters/provenance.
import assert from "node:assert/strict";
import path from "node:path";
import { pathToFileURL } from "node:url";
import { makeStaticUiOriginalDriver } from "./mpeg2-static-ui-original-recipe.mjs";
import { DYNAMIC_FLEX_CSS } from "./ui-flex-layout-recipe.mjs";
export function makeFlexOriginalDriver(source, root, resolvePackage) {
  const prior = makeStaticUiOriginalDriver(source, root, resolvePackage);
  const uri = name => JSON.stringify(pathToFileURL(path.join(root, `scripts/lib/${name}.mjs`)).href);
  const patches = [
    ['let startupSettlement = null;', `import { startNativeBudgetFailureObserver } from ${uri("native-budget-failure-observer")};
import { createBoundedDomCounterSampler } from ${uri("bounded-dom-counters")};
import { observeOwnedProcessExit } from ${uri("owned-process-exit-observation")};
let domSession, domSampler, domSamplerReport = null, nativeFailureCapture = null;
let completedReport, completedReportPath; export { completedReport, completedReportPath };
const cssCandidate = { css: ${JSON.stringify(DYNAMIC_FLEX_CSS)}, staticAssets: [], interceptionError: null,
  sourceChanged: false, enginesChanged: false, publicAcceptance: false };
let startupSettlement = null;`],
    ['const sourceFiles = ["scripts/mpeg2-static-ui-original-memory.mjs",',
      'const sourceFiles = ["scripts/mpeg2-flex-original-memory.mjs", "scripts/lib/mpeg2-flex-original-recipe.mjs", "scripts/lib/ui-flex-layout-recipe.mjs", "scripts/lib/bounded-dom-counters.mjs", "scripts/lib/host-memory-preflight.mjs", "scripts/lib/native-budget-failure-observer.mjs", "scripts/lib/owned-process-exit-observation.mjs", "evidence/ui-flex-layout-2026-10-07.json", "evidence/ui-grid-layout-2026-10-07.json", "evidence/ui-flex-layout-comparison-2026-10-07.json", "evidence/ui-flex-layout-analysis-2026-10-07.json", "app/globals.css", "scripts/mpeg2-static-ui-original-memory.mjs",'],
    ['observer = await startParallelMemoryObserver(chrome.pid, runtime.directory);', `observer = await startNativeBudgetFailureObserver(chrome.pid, runtime.directory, {
    getBlankBaseline: () => blankBaseline,
    onFailure: async event => ({ dom: await domSampler.sample("native-budget-failure"),
      nativeAcquiredAt: event.after.timestamp, causalAllocationClaim: null }),
  });`],
    ['  const state = await page.evaluate(() => window.__WITHIN_TEST__?.getState() ?? null).catch(() => null);',
      '  const dom = await domSampler.sample(phase);\n  const state = await page.evaluate(() => window.__WITHIN_TEST__?.getState() ?? null).catch(() => null);'],
    ['phase, ...tree, sampleError, metrics:', 'phase, ...tree, sampleError, dom, metrics:'],
    ['  const version = await (await fetch(`http://127.0.0.1:${debugPort}/json/version`)).json();',
      `  domSession = await context.newCDPSession(page);
  const domTarget = await domSession.send("Target.getTargetInfo");
  domSampler = createBoundedDomCounterSampler(domSession, { targetId: domTarget.targetInfo.targetId });
  const version = await (await fetch(\`http://127.0.0.1:\${debugPort}/json/version\`)).json();`],
    ['  observer.setPhase("loaded-navigation"); await page.goto(query);', `  await context.route(origin + "/assets/*.css", async route => {
    try {
      assert.equal(cssCandidate.staticAssets.length, 0, "One small static stylesheet only");
      const response = await route.fetch(), css = await response.text();
      assert.ok(Buffer.byteLength(css) < MiB && css.includes(".control-grid"));
      const body = css + cssCandidate.css;
      const hash = data => createHash("sha256").update(data).digest("hex");
      cssCandidate.staticAssets.push({ url: route.request().url(), beforeBytes: Buffer.byteLength(css), beforeSha256: hash(css),
        afterBytes: Buffer.byteLength(body), afterSha256: hash(body) });
      await route.fulfill({ response, body });
    } catch (error) { cssCandidate.interceptionError = String(error).slice(0, 512); await route.abort("failed"); }
  });
  observer.setPhase("loaded-navigation"); await page.goto(query);
  assert.equal(cssCandidate.interceptionError, null); assert.equal(cssCandidate.staticAssets.length, 1);`],
    ['    await page.locator(\'[data-testid="convert-button"]\').click();', `    await observer.through(Date.now());
    const conversionAt = observer.setPhase("conversion-" + number); await observer.through(conversionAt);
    await page.locator('[data-testid="convert-button"]').click();`],
    ['    cleanup.conversionQuiescence = await cancelBrowserConversionBeforeCleanup(page);',
      '    if (observer) nativeFailureCapture = await observer.finishCapture();\n    cleanup.conversionQuiescence = await cancelBrowserConversionBeforeCleanup(page);'],
    ['finally { nativeMemory = observer.report(); }',
      'finally { nativeMemory = observer.report(); nativeFailureCapture = observer.failureCaptureReport(); }'],
    ['  await attempt(() => realms?.close());', `  await attempt(() => realms?.close());
  await attempt(async () => { domSampler?.close(); if (domSession) await domSession.detach();
    domSamplerReport = domSampler?.report() ?? null; });`],
    ["const { stdout } = await exec(\"powershell.exe\", [\"-NoProfile\", \"-NonInteractive\", \"-Command\",\n        `@(Get-CimInstance Win32_Process -Filter 'ProcessId = ${chrome.pid}').Count`]);\n      assert.equal(Number(stdout.trim()), 0, \"Owned Chrome root must actually be absent\");",
      'const identity = samples.flatMap(row => row.processes ?? []).find(row => row.pid === chrome.pid);\n      assert.ok(identity); cleanup.chromeRootExitObservation = await observeOwnedProcessExit(identity);\n      assert.equal(cleanup.chromeRootExitObservation.status, "owned-identity-absent");'],
    ['nativeMemory, failure, logs, forbiddenRequests,', 'nativeMemory, nativeFailureCapture, domSamplerReport, cssCandidate, failure, logs, forbiddenRequests,'],
    ['-private-mpeg2-static-ui-original-native-100ms', '-private-mpeg2-flex-original-native-100ms'],
    ['"mpeg2-static-ui-original-runtime-"', '"mpeg2-flex-original-runtime-"'],
    ['Full protected original after measured static405card UI reuse, unchanged codec/settings/Chrome/allprocesses250MiB/formula/three runs/fidelity/cleanup, fixed five-minute startup settling/no larger denominator. No native OS-picker or conversion-speed-A/B certification',
      'Full protected original with measured equivalent dynamic-control flex CSS ONLY; same encoder/settings/fixed32+16MiB/allprocesses250MiB/lower five-minute blank/three full runs/independent fidelity/cleanup gates. Bounded actual page DOM counters and one first native-failure counter callback, no detailed heap dump or forcedGC. Private candidate, no public/OS-picker/speed-A-B certification.'],
    ['  process.stdout.write(`${report.status}: ${reportBase}.json\\n`);',
      '  completedReport = report; completedReportPath = `${reportBase}.json`;\n  process.stdout.write(`${report.status}: ${reportBase}.json\\n`);'],
  ];
  let result = prior;
  for (const [before, after] of patches) { assert.equal(result.split(before).length, 2, before); result = result.replace(before, after); }
  let reversed = result; for (const [before, after] of [...patches].reverse()) reversed = reversed.replace(after, before);
  assert.equal(reversed, prior, "Only explicit private CSS/counters/provenance/identity-aware cleanup changes");
  return result;
}
