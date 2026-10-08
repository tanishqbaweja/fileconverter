// Separate cancelled diagnostic; the original full-conversion acceptance gates stay intact.
import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import path from "node:path";
import { pathToFileURL } from "node:url";
const sha = bytes => createHash("sha256").update(bytes).digest("hex");
export const REAL_OUTPUT_CHECKPOINT_BYTES = 16777216;
export const MAXIMUM_PROBE_CONVERSION_MS = 120000;
export function makeStableUiProgressProbe(executed, root, traceHelperUri, binding, mode) {
  assert.equal(sha(executed), "6f05a704dc270a4ca04137bc0d55e04a5e49852536578d307f4abe2dda2034a3");
  assert.ok(["baseline", "candidate"].includes(mode));
  assert.match(binding.url, /^\/assets\/ConverterApp-[A-Za-z0-9_-]+\.js$/);
  assert.ok(binding.bytes > 0 && binding.bytes < 1048576); assert.match(binding.sha256, /^[a-f0-9]{64}$/);
  const uri = name => JSON.stringify(pathToFileURL(path.join(root, `scripts/lib/${name}.mjs`)).href);
  const probe = { mode, checkpointOutputBytes: REAL_OUTPUT_CHECKPOINT_BYTES, maximumConversionMs: MAXIMUM_PROBE_CONVERSION_MS,
    expectedAsset: binding, checkpointReached: false, beforeCancellation: null, afterCancellation: null, cancellation: null,
    profilerClosed: false, performanceBefore: null, performanceAfter: null, chromeLauncherSha256: null, chromeLibrarySha256: null,
    viewport: { width: 1280, height: 900 }, originalFullSourceAcceptance: false, publicAcceptance: false, conversionSpeedAcceptance: false };
  const checkpoint = `
      if (lastState?.jobState === "running" && (lastState.metrics?.outputBytes ?? 0) >= progressProbe.checkpointOutputBytes) {
        progressProbe.checkpointReached = true;
        progressProbe.beforeCancellation = lastState;
        await conversionJs.close(); progressProbe.profilerClosed = true;
        progressProbe.performanceAfter = await domSession.send("Performance.getMetrics");
        progressProbe.cancellation = await cancelBrowserConversionBeforeCleanup(page);
        await takeSample("real-progress-checkpoint-after-cancel");
        progressProbe.afterCancellation = lastState; run.state = lastState;
        break;
      }
`;
  const patches = [
    ['const root = "H:\\\\Github Repositories\\\\fileconverter", MiB', `const root = ${JSON.stringify(root)}, MiB`],
    ['"file:///H:/Github%20Repositories/fileconverter/work/mpeg2-js-progress-driver-nz11r1/trace-helper.mjs"', JSON.stringify(traceHelperUri)],
    ['"file:///H:/Github%20Repositories/fileconverter/scripts/lib/conversion-js-allocation.mjs"', uri("conversion-js-allocation-duration-bound")],
    ['let conversionJs=null,conversionJsReport=null;', `let conversionJs=null,conversionJsReport=null;\nconst progressProbe = ${JSON.stringify(probe)};`],
    ['const sourceFiles = ["scripts/mpeg2-js-progress-original.mjs",',
      'const sourceFiles = ["scripts/diagnose-stable-ui-real-progress.mjs","scripts/lib/stable-ui-progress-probe-recipe.mjs","tests/stable-ui-progress-probe.test.mjs","scripts/lib/conversion-js-allocation-duration-bound.mjs","scripts/mpeg2-js-progress-original.mjs",'],
    ['-private-mpeg2-js-progress-original-native-100ms', `-private-mpeg2-ui-progress-${mode}-native-100ms`],
    ['"mpeg2-js-progress-original-runtime-"', `"mpeg2-ui-progress-${mode}-runtime-"`],
    ['  chrome = spawn("C:\\\\Program Files\\\\Google\\\\Chrome\\\\Application\\\\chrome.exe",',
      `  const launchHost = await (await import(${uri("host-memory-preflight")})).inspectStressHostMemory();
  progressProbe.launchHost = launchHost; assert.equal(launchHost.safeToStart, true);
  chrome = spawn("C:\\\\Program Files\\\\Google\\\\Chrome\\\\Application\\\\chrome.exe",`],
    ['  browserVersion = browser.version(); context = browser.contexts()[0]; page = context.pages()[0];',
      `  browserVersion = browser.version(); context = browser.contexts()[0]; page = context.pages()[0];
  await page.setViewportSize(progressProbe.viewport);
  progressProbe.chromeLauncherSha256 = await shaFile("C:\\\\Program Files\\\\Google\\\\Chrome\\\\Application\\\\chrome.exe");
  progressProbe.chromeLibrarySha256 = await shaFile(path.join("C:\\\\Program Files\\\\Google\\\\Chrome\\\\Application",browserVersion,"chrome.dll"));`],
    ['  domSession = await context.newCDPSession(page);', '  domSession = await context.newCDPSession(page);\n  await domSession.send("Performance.enable", { timeDomain: "threadTicks" });'],
    ['    if(number===1)await conversionJs.beforeConversion({jobState:lastState?.jobState??null,metrics:lastState?.metrics??null});',
      '    if(number===1)await conversionJs.beforeConversion({jobState:lastState?.jobState??null,metrics:lastState?.metrics??null});\n    progressProbe.performanceBefore = await domSession.send("Performance.getMetrics");'],
    ['    const deadline = Date.now() + 6 * 60 * 60_000; let nextLog = Date.now();',
      '    const deadline = Date.now() + progressProbe.maximumConversionMs; let nextLog = Date.now();'],
    ['      if (lastState?.jobState === "error" || lastState?.jobState === "complete" || lastState?.jobState === "cancelled") break;',
      checkpoint + '      if (lastState?.jobState === "error" || lastState?.jobState === "complete" || lastState?.jobState === "cancelled") break;'],
    ['nativeMemory, nativeFailureCapture, domSamplerReport, cssCandidate, abortDiagnostic, quiescedBudgetCapture, rendererAttributionResult, conversionJsReport, failure,',
      'nativeMemory, nativeFailureCapture, domSamplerReport, cssCandidate, abortDiagnostic, quiescedBudgetCapture, rendererAttributionResult, conversionJsReport, progressProbe, failure,'],
  ];
  let generated = executed;
  for (const [before, after] of patches) { assert.equal(generated.split(before).length, 2, before); generated = generated.replace(before, after); }
  let restored = generated;
  for (const [before, after] of patches.toReversed()) restored = restored.replace(after, before);
  assert.equal(restored, executed, "Only declared diagnostic measurement/normal cancellation; original codec, full source/SHA, quality, ALL-process250MiB, validators and finally remain intact");
  generated = generated.replaceAll("file:///H:/Github%20Repositories/fileconverter/scripts/", pathToFileURL(path.join(root, "scripts") + path.sep).href);
  assert.ok(generated.includes('"--headless=new"') && generated.includes("windowsHide: true"));
  assert.ok(generated.includes('assert.equal(run.state.jobState, "complete"'), "Cancelled probe must fail full acceptance, never masquerade as a completed conversion");
  return generated;
}
