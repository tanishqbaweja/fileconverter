// Full-geometry private adverse + same-page validated recovery qualification.
import assert from "node:assert/strict";
import { makeEncoderPlaneBitrateBrowserRecipe, inspectBitrateDiagnostic } from "./encoder-plane-bitrate-browser-recipe.mjs";
export function makeEncoderPlaneRecoveryBrowserRecipe(sources, root, runtime, stamp, branch, build) {
  const old = makeEncoderPlaneBitrateBrowserRecipe(sources, root, runtime, stamp, branch, build, 4000000);
  const fixtureEnd = '  ];\n  for (const fixture of fixtures) {';
  const cancelGeneration = `  await native(["-v", "error", "-f", "lavfi", "-i",
    "testsrc2=size=640x360:rate=24:duration=20", "-c:v", "mpeg4", "-q:v", "2",
    "-bf", "0", "-threads", "1", path.join(work, "cancel.mkv")]);`;
  const start = old.spec.indexOf("for (const adapter of adapters) {\n  test(");
  const end = old.spec.indexOf('\n\ntest("private split MPEG2 propagates direct output write failure', start);
  assert.ok(start > 0 && end > start);
  const block = old.spec.slice(start, end);
  const bodyStart = block.indexOf('    const source = path.join(work, `${adapter.fixture}.${adapter.source}`);');
  assert.ok(bodyStart > 0 && block.endsWith("  });\n}"));
  const body = block.slice(bodyStart, -"  });\n}".length);
  const navigation = '      await page.goto(adapter.destination === "direct" ? "/?test=1&directory=1" : "/?test=1");';
  assert.equal(body.split(navigation).length - 1, 1);
  const helper = `async function validateConversion(page: import("@playwright/test").Page, adapter: typeof adapters[number], reload = true) {
${body.replace(navigation, navigation.replace("await page.goto", "if (reload) await page.goto"))}}

async function recoverOnSamePage(page: import("@playwright/test").Page, originalWorker: import("@playwright/test").Worker, phase: string) {
  await page.waitForFunction(() => window.__WITHIN_TEST__?.getState().workerStatus === "ready");
  expect(page.workers()).toHaveLength(1);
  expect(page.workers()).not.toContain(originalWorker);
  const recoveryWorker = page.workers()[0];
  rows.push({ kind: "adverse-native-configuration", phase, samples: [...bitrateAuditSamples], splitFinalSamples: [...splitFinalSamples] });
  bitrateAuditSamples.length = 0; splitFinalSamples.length = 0;
  // This updates only the existing localhost fault adapter. No navigation,
  // forced worker restart, parser, native context, or output bridge substitution.
  await page.evaluate(() => history.replaceState(null, "", "/?test=1&directory=1"));
  const startRow = rows.length;
  const adapter = adapters.find(a => a.fixture === "hevc" && a.destination === "direct")!;
  await validateConversion(page, adapter, false);
  await page.waitForFunction(() => window.__WITHIN_TEST__?.getState().workerStatus === "ready");
  expect(page.workers()).toHaveLength(1);
  expect(page.workers()).not.toContain(recoveryWorker); expect(page.workers()).not.toContain(originalWorker);
  rows.push({ kind: "actual-native-bitrate-configuration", bitRate: experimentBitRate, samples: [...bitrateAuditSamples] });
  const remaining = await page.evaluate(async () => {
    const directory = await navigator.storage.getDirectory(); const names: string[] = [];
    for await (const [name] of directory.entries()) names.push(name); return names;
  });
  expect(remaining).toEqual([]); rows.push({ cleanupRemovedEntries: remaining });
  rows.push({ kind: "validated-same-page-recovery", phase, startRow, endRow: rows.length,
    sameWorkerObject: false, retiredWorkerAbsent: true, productionReplacementWorkerUsed: true,
    completedWorkerRetired: true, noPageReload: true });
}
${block.slice(0, bodyStart)}    await validateConversion(page, adapter);
  });
}`;
  const edits = [
    [fixtureEnd, '  ];\n  fixtures.push({ ...fixtures[1], name: "cancel", seconds: 12 });\n  for (const fixture of fixtures) {'],
    ['fixture.name === "hevc"', '(fixture.name === "hevc" || fixture.name === "cancel")', 2],
    [cancelGeneration, '  // cancel.mkv is now the12-second full-geometry HEVC fixture above.'],
    [block, helper],
    ['  await page.goto("/?test=1&directory=1&fault=write");\n  await page.waitForFunction(() => window.__WITHIN_TEST__?.getState().workerStatus === "ready");',
      '  await page.goto("/?test=1&directory=1&fault=write");\n  await page.waitForFunction(() => window.__WITHIN_TEST__?.getState().workerStatus === "ready");\n  expect(page.workers()).toHaveLength(1); const originalWorker = page.workers()[0];'],
    ['  rows.push({ kind: "direct-write-failure", status: "passed", error: state.error, metrics: state.metrics, partialBytes: files });',
      '  rows.push({ kind: "direct-write-failure", status: "passed", error: state.error, metrics: state.metrics, partialBytes: files });\n  await recoverOnSamePage(page, originalWorker, "write-failure");'],
    ['    await page.locator(\'[data-testid="file-input"]\').setInputFiles(path.join(work, "cancel.mkv"));',
      '    expect(page.workers()).toHaveLength(1); const originalWorker = page.workers()[0];\n    await page.locator(\'[data-testid="file-input"]\').setInputFiles(path.join(work, "cancel.mkv"));'],
    ['      terminalState: state.jobState, metrics: state.metrics, partialBytes });',
      '      terminalState: state.jobState, metrics: state.metrics, partialBytes });\n    await recoverOnSamePage(page, originalWorker, "cancellation");'],
  ];
  let spec = old.spec;
  for (const [before, after, count = 1] of edits) { assert.equal(spec.split(before).length - 1, count, before); spec = spec.replaceAll(before, after); }
  let reversed = spec; for (const [before, after] of edits.toReversed()) reversed = reversed.replaceAll(after, before);
  assert.equal(reversed, old.spec);
  const filter = ',grep:/private split MPEG2 hevc to mp4 via direct:/'; assert.equal(old.config.split(filter).length - 1, 1);
  const config = old.config.replace(filter, ',maxFailures:1,grep:/private split MPEG2 (propagates direct output write failure|cancels after genuine direct output)/');
  return { ...old, spec, config, recoveryEdits: edits, samePageRecoveryRequired: true,
    originalProtectedInputNotSubstituted: true, publicAcceptance: false };
}

export function inspectRecoveryDiagnostic(report, baseline, build) {
  const markers = report.rows.filter(row => row.kind === "validated-same-page-recovery");
  assert.deepEqual(markers.map(row => row.phase), ["write-failure", "cancellation"]);
  const results = markers.map(marker => {
    assert.equal(marker.sameWorkerObject, false); assert.equal(marker.noPageReload, true);
    for (const field of ["retiredWorkerAbsent", "productionReplacementWorkerUsed", "completedWorkerRetired"]) assert.equal(marker[field], true);
    assert.ok(Number.isInteger(marker.startRow) && Number.isInteger(marker.endRow) && marker.endRow > marker.startRow);
    const rows = report.rows.slice(marker.startRow, marker.endRow);
    const analysis = inspectBitrateDiagnostic({ ...report, rows }, baseline, build, 4000000);
    assert.equal(analysis.caseStatus, "passed");
    const kind = marker.phase === "write-failure" ? "direct-write-failure" : "cancel-after-direct-output";
    const adverse = report.rows.filter(row => row.kind === kind); assert.equal(adverse.length, 1);
    assert.equal(adverse[0].status, "passed"); assert.ok(adverse[0].partialBytes.every(bytes => bytes === 0));
    const m = adverse[0].metrics;
    assert.equal(m.pendingOperations, 0); assert.equal(m.queuedBytes, 0); assert.equal(m.peakWasmMemoryBytes, 50331648);
    assert.ok(m.peakPendingOperations <= 1 && m.peakQueuedBytes <= 524288 && m.maxReadChunkBytes <= 65536 && m.maxWriteChunkBytes <= 524288);
    if (marker.phase === "cancellation") {
      assert.equal(adverse[0].terminalState, "cancelled"); assert.ok(adverse[0].beforeCancel.outputBytes > 32768);
    } else assert.ok(adverse[0].error.toLowerCase().includes("destination rejected a bounded write"));
    const native = report.rows.filter(row => row.kind === "adverse-native-configuration" && row.phase === marker.phase);
    assert.equal(native.length, 1); assert.equal(native[0].samples.length, 1);
    assert.deepEqual(native[0].samples[0], analysis.nativeConfiguration);
    assert.equal(native[0].splitFinalSamples.length, 1);
    const split = native[0].splitFinalSamples[0]; assert.equal(split.closed, true); assert.equal(split.activePackets, 0);
    assert.equal(split.queuedFrames, 0); assert.equal(split.queuedPackets, 0); assert.ok(split.frames > 0);
    return { phase: marker.phase, adversePartialOutputRemoved: true, samePageProductionReplacementWorkerRecovered: true, analysis };
  });
  assert.deepEqual(results[0].analysis.input, results[1].analysis.input);
  return { completedValidatedRecoveryConversions: 2, adverseCases: 2, results,
    completeChromiumMemoryAcceptance: false, fullOriginalAcceptance: false, publicAcceptance: false, speedImprovementProven: false };
}
